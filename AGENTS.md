# Crisp — Agent Context

**What it is**: A macOS writing assistant daemon. Select any text in any app, trigger the Crisp service (right-click → Services → Crisp Rewrite), and it's rewritten by a local LLM in place — no browser extension, no cloud.

**Run it**: `npm run dev` (requires Ollama running + `qwen2.5:1.5b` pulled). First-time setup also requires `npm run install-service`.

**Deep dive**: See [`ARCHITECTURE.md`](ARCHITECTURE.md) for the full component breakdown and data flow.

---

## Architecture Decision Log

| Decision | Choice | Rejected | Reason |
|---|---|---|---|
| Language | TypeScript / Node.js | Python | User preference; `ollama` npm covers model calls |
| Integration strategy | macOS Service + HTTP server | Clipboard-only hotkey, browser extension | Service handles text selection/replacement natively; no clipboard race condition |
| Trigger mechanism | macOS Automator workflow (Service) | uiohook-napi, Swift CGEventTap helper | macOS 14+ silently rejects Input Monitoring for unsigned binaries; Service needs no keyboard permissions |
| LLM | qwen2.5:1.5b via Ollama | Cloud API | Privacy, zero cost, runs comfortably on M5 Mac Air (~1.5 GB RAM) |
| TOML parsing | smol-toml | @iarna/toml | ESM-native, zero interop issues |
| Lua scripting | wasmoon | lupa (Python) | Runs Lua 5.4 inside Node.js via WASM — no native Lua install required |
| Daemon–Service bridge | HTTP server on 127.0.0.1:8765 | IPC / stdin pipe | Universal, no extra deps, survives process restarts independently |
| Pasteboard bridge | "Copy to Clipboard" action + `pbpaste` | Direct stdin forwarding from workflow | macOS 26 workflow runtime doesn't forward service text to shell script stdin/args — explicit copy step is required |
| Confirm UI | osascript dialog | Electron window | Zero overhead, native feel |

---

## Trigger Flow

```text
User selects text → triggers macOS Service (keyboard shortcut or right-click → Services)
  → macOS writes selected text to private service pasteboard
  → Automator workflow fires (Crisp Rewrite.workflow):
      Step 1: Copy to Clipboard  — bridges private pasteboard → NSPasteboard.general
      Step 2: Run Shell Script   — /usr/bin/pbpaste | /usr/bin/python3 ~/.crisp/service.py
  → service.py reads text from stdin (pbpaste output)
  → POSTs to http://127.0.0.1:8765/rewrite
  → Node.js daemon:
      → lua.onBeforeRewrite(text, tone)
      → Ollama: rewrite(text, tone)
      → lua.onAfterRewrite(original, rewritten)
      → mode=confirm: osascript dialog → Accept / Reject
      → returns result JSON (or original if rejected)
  → service.py writes result to stdout
  → macOS replaces selected text with stdout output (native, undo-able with Cmd+Z)
```

---

## Config

| Path | Purpose |
|---|---|
| `~/.crisp/config.toml` | Main user config (auto-created with defaults if absent) |
| `~/.crisp/hooks.lua` | Optional Lua customisation — loaded only if file exists |
| `~/.crisp/service.py` | Python bridge script installed by `npm run install-service` |

Key config fields: `general.mode` (`confirm`/`auto`), `general.default_tone`, `general.preserve_tone`, `model.name`, `model.ollama_url`.

The trigger shortcut is set in **System Settings → Keyboard → Keyboard Shortcuts → Services → Text → Crisp Rewrite**, not in config.toml.

---

## Key Files

| File | Purpose |
|---|---|
| `src/index.ts` | Entry point: starts HTTP server, wires rewrite handler |
| `src/server.ts` | HTTP server on 127.0.0.1:8765, handles POST /rewrite |
| `src/config.ts` | Loads `~/.crisp/config.toml`, deep-merges with typed defaults |
| `src/rewriter.ts` | Ollama client, prompt assembly, output cleaning |
| `src/confirm.ts` | osascript Accept/Reject dialog + `notify()` helper |
| `src/lua.ts` | wasmoon Lua runner, lazy-loaded, noop fallback when hooks.lua absent |
| `src/types.ts` | Shared TypeScript types (Config, ToneConfig, UndoEntry, LuaRunner) |
| `src/hotkey.ts` | Swift helper spawner — unused on macOS 26, kept for reference |
| `Crisp Rewrite.workflow/` | Automator Service bundle — installed to ~/Library/Services/ |
| `scripts/crisp_service.py` | Python HTTP bridge — installed to ~/.crisp/service.py |
| `scripts/install-service.sh` | Installs workflow + service.py, flushes pbs |
| `helper/hotkey.swift` | Swift hotkey binary source — unused on macOS 26 |

---

## Phase Status

- [x] **Phase 1** — Core daemon (macOS Service → HTTP → Ollama → confirm → text replacement)
- [ ] **Phase 2** — Lua hooks deeper integration, menu bar icon, launchd plist, undo hotkey
- [ ] **Phase 3** — Better confirm UI (diff view), tone quick-picker, long-text chunking
- [ ] **Phase 4** — MLX backend, optional browser extension, stats

---

## Setup & Requirements

```bash
# 1. Install Ollama
brew install ollama

# 2. Pull the model
ollama pull qwen2.5:1.5b

# 3. Start Ollama (or it starts on demand)
ollama serve

# 4. Install Node deps
npm install

# 5. Install the macOS Service (one-time)
npm run install-service

# 6. Assign a keyboard shortcut
#    System Settings → Keyboard → Keyboard Shortcuts → Services → Text
#    Find "Crisp Rewrite" → assign e.g. Ctrl+Shift+R

# 7. Run the daemon
npm run dev
```

No macOS permissions required — the Service mechanism needs none.

---

## Known Gotchas

- **macOS 26 Tahoe**: Automator.app was removed, but the `.workflow` bundle runtime still exists. The workflow runs correctly when installed to `~/Library/Services/`.
- **"Copy to Clipboard" step is mandatory**: The macOS 26 workflow runtime does not forward the service's input text to the shell script via stdin or `$@`. The explicit "Copy to Clipboard" action bridges the private service pasteboard to `NSPasteboard.general` so `pbpaste` works.
- **Two services may appear**: If both `Crisp Rewrite.workflow` and `Crisp Rewrite.shortcut` are installed, two items appear. Use the `.workflow` one — it's the working implementation.
- **Shortcut (.shortcut) does nothing**: The `.shortcut` file format for Shortcuts.app uses a different input variable system; the generated file doesn't correctly wire the selected text. Use the workflow instead.
- **Hotkey is set in System Settings, not config.toml**: The `general.hotkey` field in config.toml is unused in the current architecture (it was for uiohook-napi). The trigger shortcut lives in System Settings → Keyboard → Services.
- **Daemon must be running**: The workflow calls `http://127.0.0.1:8765/rewrite`. If the daemon isn't running, the workflow silently returns the original text unchanged (the Python script's fallback).
- **Lua runner is loaded lazily**: if `wasmoon` WASM init fails, a noop runner is used and a warning is logged.
- `cmd+shift+z` undo hotkey not registered (Phase 2). In confirm mode this isn't needed — macOS Service text replacement is natively undo-able with Cmd+Z.
