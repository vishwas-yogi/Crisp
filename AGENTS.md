# Crisp — Agent Context

**What it is**: A macOS writing assistant daemon that intercepts selected text via a global hotkey, rewrites it using a local LLM, and pastes it back — works in every app with no extensions needed.

**Run it**: `npm run dev` (requires Ollama running + `qwen2.5:1.5b` model pulled)

---

## Architecture Decision Log

| Decision | Choice | Rejected | Reason |
|---|---|---|---|
| Language | TypeScript / Node.js | Python | User preference; `ollama` npm covers model calls |
| Integration strategy | Clipboard-only | Browser extension + Obsidian plugin | Clipboard works universally in all apps; eliminates per-app complexity |
| LLM | qwen2.5:1.5b via Ollama | Cloud API | Privacy, zero cost, runs comfortably on M5 Mac Air (~1.5 GB RAM) |
| TOML parsing | smol-toml | @iarna/toml | ESM-native, zero interop issues |
| Lua scripting | wasmoon | lupa (Python) | Runs Lua 5.4 inside Node.js via WASM — no native Lua install required |
| Keyboard simulation | osascript stdin | @nut-tree/nut-js | Lightweight, macOS-native, no extra deps, no quoting issues via stdin pipe |
| Hotkey listener | uiohook-napi | Swift helper | Direct Node.js integration; prebuilt binaries for arm64-darwin |
| Confirm UI | osascript dialog | Electron window | Zero overhead, native feel for Phase 1 |

---

## Clipboard Flow

```
Hotkey fires
  → save clipboard
  → osascript: Cmd+C   (copies selection to clipboard)
  → sleep 200ms
  → read clipboard (clipboardy)
  → guard: no selection / unchanged / < 3 chars → abort
  → lua.onBeforeRewrite(text, app, tone)
  → Ollama: rewrite(text, tone)
  → lua.onAfterRewrite(original, rewritten, app)
  → mode=confirm: osascript dialog → Accept / Reject
  → if accepted: write rewritten → osascript: Cmd+V → sleep 200ms
  → restore original clipboard (always, even on error)
```

**Key caveat**: `cmd+shift+r` (default hotkey) also triggers Chrome hard-refresh in browsers. Change hotkey in `~/.crisp/config.toml` if this causes issues (e.g. use `ctrl+shift+r`).

---

## Config

| Path | Purpose |
|---|---|
| `~/.crisp/config.toml` | Main user config (auto-created with defaults if absent) |
| `~/.crisp/hooks.lua` | Optional Lua customisation — loaded only if file exists |

Key config fields: `general.mode` (`confirm`/`auto`), `general.hotkey`, `general.default_tone`, `general.preserve_tone`, `model.name`, `model.ollama_url`.

---

## Key Files

| File | Purpose |
|---|---|
| `src/index.ts` | Entry point: wires hotkey → clipboard → rewriter → confirm → paste |
| `src/config.ts` | Loads `~/.crisp/config.toml`, deep-merges with typed defaults |
| `src/hotkey.ts` | `uiohook-napi` listener, parses `"cmd+shift+r"` style strings |
| `src/clipboard.ts` | save / copySelection / read / write / paste / restore + undo stack |
| `src/rewriter.ts` | Ollama client, prompt assembly, output cleaning |
| `src/confirm.ts` | osascript Accept/Reject dialog + `notify()` helper |
| `src/lua.ts` | wasmoon Lua runner, lazy-loaded, noop fallback when hooks.lua absent |

---

## Phase Status

- [x] **Phase 1** — Core daemon (hotkey → clipboard → Ollama → confirm → paste)
- [ ] **Phase 2** — Lua hooks wired in, menu bar icon, launchd plist, undo hotkey
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

# 5. Run Crisp
npm run dev
```

macOS permissions required on first run (System Settings → Privacy & Security):
- **Accessibility** — for uiohook-napi to read global key events
- **Input Monitoring** — for uiohook-napi to hook keyboard at system level

---

## Known Gotchas

- `uiohook-napi` fires the hotkey event but does NOT suppress it — apps still see the original keypress. Choose a non-conflicting hotkey.
- `cmd+shift+z` is NOT registered as undo hotkey in Phase 1 (added in Phase 2). Use confirm mode to avoid unwanted rewrites.
- osascript key simulation can fail silently in sandboxed App Store apps. The clipboard is still written correctly — user can paste manually with Cmd+V.
- Lua runner is loaded lazily; if `wasmoon` WASM init fails, a noop runner is used and a warning is logged.
