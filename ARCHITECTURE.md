# Crisp — Architecture

This document explains how Crisp works end-to-end: the trigger mechanism, data flow, component responsibilities, and why each piece exists.

---

## Big picture

```text
┌─────────────────────────────────────────────────────────────┐
│  Any macOS app (WhatsApp, Chrome, Obsidian, etc.)           │
│                                                             │
│  User selects text → right-click → Services → Crisp Rewrite │
└──────────────────────────┬──────────────────────────────────┘
                           │ macOS Services mechanism
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  Crisp Rewrite.workflow  (~/Library/Services/)              │
│                                                             │
│  Step 1: Copy to Clipboard  ──► NSPasteboard.general        │
│  Step 2: Run Shell Script   ──► pbpaste | service.py        │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP POST /rewrite
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  Node.js daemon  (npm run dev)   127.0.0.1:8765             │
│                                                             │
│  Lua onBeforeRewrite ──► Ollama (qwen2.5:1.5b) ──► Lua     │
│  onAfterRewrite ──► osascript confirm dialog                │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP response (rewritten text)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  service.py stdout → macOS replaces selection               │
└─────────────────────────────────────────────────────────────┘
```

---

## Component breakdown

### 1. macOS Services mechanism

macOS has a built-in system called **Services** that lets any app expose text-processing actions to all other apps. When you right-click with text selected, macOS:

1. Writes the selected text to a private, uniquely-named pasteboard
2. Invokes the matching Service workflow/handler
3. Passes the handler's stdout back and **replaces the selected text** with it

This is entirely handled by macOS — no keyboard hook permissions, no clipboard hacks, no app-specific plugins. It works in every Cocoa and most non-Cocoa apps.

### 2. The Automator workflow (`Crisp Rewrite.workflow`)

The workflow lives at `~/Library/Services/Crisp Rewrite.workflow` and is installed by `npm run install-service`.

It has exactly two steps:

**Step 1 — Copy to Clipboard**
Copies the selected text from the private service pasteboard to `NSPasteboard.general` (the regular clipboard). This step exists because of a macOS 26 regression: the stripped-down workflow runtime that ships without Automator.app does not forward the service's input text to the shell script's stdin or `$@` arguments. Without this step, `pbpaste` reads the old clipboard instead of the selected text.

**Step 2 — Run Shell Script**
```bash
/usr/bin/pbpaste | /usr/bin/python3 "$HOME/.crisp/service.py"
```
Reads the text from `NSPasteboard.general` (now containing the selected text) and pipes it to the Python bridge script. The script's stdout becomes the workflow's output, which macOS uses to replace the selection.

### 3. Python bridge (`~/.crisp/service.py`)

A minimal Python script installed by `npm run install-service`. Responsibilities:

- Reads selected text from stdin (piped from `pbpaste`)
- Serialises it as JSON and POSTs to `http://127.0.0.1:8765/rewrite`
- On success: writes the daemon's `result` to stdout → macOS replaces selection
- On failure (daemon not running, timeout): writes the original text to stdout → selection is unchanged, no data loss

```text
stdin (selected text)
  → POST /rewrite  {"text": "..."}
  → stdout (rewritten text or original on error)
```

### 4. Node.js daemon (`npm run dev`)

Started once and kept running in the background. It's a plain `node:http` server with no framework. When it receives `POST /rewrite`:

1. Parses the JSON body, validates the text is ≥ 3 characters
2. Calls `lua.onBeforeRewrite(text, tone)` — runs `on_before_rewrite` from `~/.crisp/hooks.lua` if present; can transform text or switch tone
3. Sends the text to Ollama (`qwen2.5:1.5b`) with a tone-specific system prompt
4. Calls `lua.onAfterRewrite(original, rewritten)` — runs `on_after_rewrite` if defined; can post-process the result
5. In `confirm` mode: shows an osascript Accept/Reject dialog and waits for user input (the HTTP request stays open during this)
6. Returns `{"result": "..."}` — either the rewritten text (accepted) or the original (rejected)

The server is bound to `127.0.0.1` only — not exposed to the network.

### 5. Confirm dialog (`src/confirm.ts`)

Uses `osascript` via stdin to show a native macOS dialog:

```text
┌─────────────────────────────┐
│ Crisp                       │
│                             │
│ Original:                   │
│ I am writing this to test…  │
│                             │
│ Rewritten:                  │
│ I'm writing this to test…   │
│                             │
│  [Reject]        [Accept]   │
└─────────────────────────────┘
```

**Truncation**: both previews are capped at 180 characters (`src/confirm.ts:23`). The full text is still sent to Ollama and used for replacement — only the dialog preview is shortened. This is a Phase 3 improvement target (full diff view).

In `auto` mode the dialog is skipped entirely and the rewritten text is returned immediately.

### 6. Ollama / rewriter (`src/rewriter.ts`)

Uses the official `ollama` npm package to call the local Ollama server (`http://localhost:11434`). Builds a system prompt from the active tone's `hint` field plus a set of fixed rules (preserve formatting, output only the rewritten text, etc.). Strips any surrounding quotes or code fences from the model's output before returning.

Model: `qwen2.5:1.5b` by default — 1.5B parameters, ~1.5 GB RAM, ~180 tokens/s on M5 via Metal. Ollama keeps the model warm in memory for `keepalive` minutes after the last request (default: 10 min).

### 7. Lua hooks (`src/lua.ts`)

Optional customisation layer using `wasmoon` (Lua 5.4 compiled to WASM — no native Lua install needed). Loaded lazily only if `~/.crisp/hooks.lua` exists. If the file is absent or `wasmoon` fails to initialise, a noop runner is used and the daemon continues normally.

Two hook points:
- `on_before_rewrite(text, app_name, tone)` — transform text or switch tone before the model sees it
- `on_after_rewrite(original, rewritten, app_name)` — post-process the model's output

### 8. Config (`src/config.ts`)

Loads `~/.crisp/config.toml` with `smol-toml` (ESM-native TOML parser). Deep-merges with hardcoded defaults so missing keys never crash the daemon. Creates the default config file on first run if absent.

---

## Data flow in detail

```text
right-click → Services → Crisp Rewrite
  │
  │ [macOS]
  ├─ selected text → private service pasteboard
  │
  │ [Automator workflow step 1]
  ├─ private pasteboard → NSPasteboard.general (Copy to Clipboard)
  │
  │ [Automator workflow step 2 — shell script]
  ├─ pbpaste reads NSPasteboard.general
  ├─ pipes text to service.py stdin
  │
  │ [service.py]
  ├─ reads stdin → JSON body
  ├─ POST http://127.0.0.1:8765/rewrite
  │
  │ [Node.js daemon — src/server.ts]
  ├─ parse body, validate length
  ├─ lua.onBeforeRewrite(text, tone)
  │     └─ hooks.lua: on_before_rewrite (if defined)
  ├─ ollama.chat(model, systemPrompt + text)
  │     └─ qwen2.5:1.5b via localhost:11434
  ├─ lua.onAfterRewrite(original, rewritten)
  │     └─ hooks.lua: on_after_rewrite (if defined)
  ├─ [confirm mode] osascript dialog → Accept / Reject
  └─ return {"result": "<rewritten or original>"}
  │
  │ [service.py]
  ├─ writes result to stdout
  │
  │ [macOS]
  └─ replaces selected text with stdout content
```

---

## File map

```text
src/
  index.ts       Entry point — wires config, Lua, HTTP server
  server.ts      HTTP server on 127.0.0.1:8765
  rewriter.ts    Ollama client + prompt builder + output cleaner
  confirm.ts     osascript confirm dialog + notify()
  lua.ts         wasmoon Lua runner (lazy-loaded)
  config.ts      TOML loader with defaults
  types.ts       Shared TypeScript types
  hotkey.ts      (Unused on macOS 26) Swift helper spawner

Crisp Rewrite.workflow/Contents/
  document.wflow   Automator workflow definition (2 actions)
  Info.plist       Bundle metadata (required for service registration)

scripts/
  crisp_service.py    Python HTTP bridge (installed to ~/.crisp/service.py)
  install-service.sh  Copies workflow → ~/Library/Services/, service.py → ~/.crisp/

helper/
  hotkey.swift     (Unused on macOS 26) Swift CGEventTap implementation
  hotkey-bin       (Unused on macOS 26) Compiled binary

~/.crisp/
  config.toml      User config (auto-created with defaults)
  hooks.lua        Optional Lua hooks (not created automatically)
  service.py       Python bridge (installed by npm run install-service)
```

---

## Why not a keyboard hook?

The original design used `uiohook-napi` (Node.js wrapper around `libuiohook`) to listen for a global hotkey. This was abandoned for two reasons:

1. **Permission failure on modern macOS**: macOS 14+ requires both Accessibility and Input Monitoring permissions for global keyboard monitoring. For unsigned binaries (like nvm-installed Node.js), macOS silently denies the permission even when it appears granted in System Settings. Attempts to switch to a compiled Swift binary using `NSEvent.addGlobalMonitorForEvents` hit the same issue — that API also requires Input Monitoring on macOS 14+.

2. **Automator.app removed on macOS 26**: The fallback of using a compiled Swift app bundle (which can get signed TCC permissions) was also explored, but the macOS Services approach turned out to be simpler and more universal. No permissions required at all.

The Services approach is actually better: macOS handles the text selection capture and replacement natively, so there's no clipboard save/restore race condition and undo works for free via the standard edit stack.

---

## Known limitations

| Limitation | Location | Phase |
|---|---|---|
| Dialog truncates preview at 180 chars | `src/confirm.ts:23` | Phase 3 |
| Daemon must be running manually | — | Phase 2 (launchd) |
| No per-app tone switching in UI | `~/.crisp/hooks.lua` workaround | Phase 2 |
| Long text sent to model in one shot (no chunking) | `src/rewriter.ts` | Phase 3 |
| Confirm dialog shows no formatting (plain text only) | `src/confirm.ts` | Phase 3 |
