# Crisp — Implementation Plan

> This is a living document. Update after each major decision or phase completion.
> See `AGENTS.md` for the authoritative agent context (architecture, ADR, phase status).

## What We're Building

**Crisp** — a local, private AI writing assistant for macOS. Select any text in any app, press a hotkey, and it's rewritten using a local LLM. Works everywhere via the clipboard strategy — no browser extension or Obsidian plugin needed.

## Name

**Crisp** — describes the outcome (crisp, clear writing). Config lives at `~/.crisp/`.

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Runtime | Node.js + TypeScript | `tsx` for dev |
| LLM | Ollama + qwen2.5:1.5b | ~1.5 GB RAM, ~180 tok/s on M5 Metal |
| Global hotkey | uiohook-napi | arm64-darwin prebuilt available |
| Clipboard | clipboardy (read/write) + osascript (Cmd+C / Cmd+V) | Universal strategy |
| Config | smol-toml | ESM-native TOML 1.0 parser |
| Lua hooks | wasmoon | Lua 5.4 via WASM, no native install |
| Dialogs | osascript (stdin) | Lightweight, native macOS |

## Core Flow (Clipboard Strategy)

1. User selects text → presses hotkey
2. Daemon: save clipboard → simulate Cmd+C → read clipboard
3. Guard: abort if nothing selected or selection < 3 chars
4. Lua `on_before_rewrite` hook (if hooks.lua exists)
5. Send to Ollama with tone prompt → get rewritten text
6. Lua `on_after_rewrite` hook
7. If `mode = confirm`: show Accept/Reject dialog
8. If accepted: write rewritten text → simulate Cmd+V → restore clipboard

## Config (`~/.crisp/config.toml`)

```toml
[general]
mode = "confirm"          # "auto" | "confirm"
default_tone = "personal"
hotkey = "cmd+shift+r"
preserve_tone = true

[model]
name = "qwen2.5:1.5b"
ollama_url = "http://localhost:11434"
keepalive = "10m"

[tones.personal]
hint = "Improve clarity and flow only. Keep the tone casual and natural."

[tones.professional]
hint = "Make this professional and clear. Preserve the core message."

[tones.academic]
hint = "Rewrite in a formal academic style. Preserve all factual details."

[tones.concise]
hint = "Make this more concise. Remove filler, keep all meaning."
```

## Lua Hooks (`~/.crisp/hooks.lua`)

```lua
function on_before_rewrite(text, app_name, tone)
  return text, tone  -- can modify text or switch tone per-app
end

function on_after_rewrite(original, rewritten, app_name)
  return rewritten   -- can post-process the result
end
```

## Implementation Phases

### Phase 1 — Core Daemon (COMPLETE)
- [x] package.json, tsconfig.json, npm install
- [x] src/config.ts — TOML loader
- [x] src/rewriter.ts — Ollama client
- [x] src/clipboard.ts — clipboard + osascript keyboard simulation
- [x] src/hotkey.ts — uiohook-napi listener
- [x] src/confirm.ts — osascript dialog + notifications
- [x] src/lua.ts — wasmoon Lua runner (lazy, noop fallback)
- [x] src/index.ts — main daemon wiring
- [x] AGENTS.md + CLAUDE.md symlink

### Phase 2 — Polish
- [ ] Lua hooks: wire on_before/on_after calls into index.ts (structure is ready)
- [ ] Undo hotkey (`ctrl+shift+z`) — pops undo stack, pastes original
- [ ] Menu bar icon: tone switcher + enable/disable
- [ ] launchd plist for auto-start on login
- [ ] `npm run rewrite` one-shot CLI for testing

### Phase 3 — UX
- [ ] Better confirm UI: side-by-side diff (Electron or Swift overlay)
- [ ] Tone quick-picker: second hotkey cycles tones
- [ ] macOS notification on auto-replace
- [ ] Long-text chunking for inputs > 2000 tokens

### Phase 4 — Advanced
- [ ] MLX backend (Apple Neural Engine, even faster on M5)
- [ ] Optional browser extension (if clipboard ever falls short)
- [ ] Stats / history in menu bar

## Key Edge Cases

| Challenge | Mitigation |
|---|---|
| Model cold start | Ollama `keepalive` keeps model warm |
| Clipboard race | 200ms windows; save/restore always runs in finally |
| Long text > 4096 tokens | Phase 3: paragraph chunking |
| Preserving markdown | Explicit prompt rule: "preserve all markdown formatting" |
| macOS permissions | First-launch guide in README |
| Hotkey conflicts in browser | Change default hotkey in config.toml |
| osascript fails (sandboxed app) | Clipboard written correctly; paste manually |
| Non-English text | Qwen2.5 is multilingual |

## Verification Checklist

1. `npm run dev` starts without errors
2. Open TextEdit → type text → select it → press hotkey → confirm dialog appears → text replaced
3. Open Gmail → compose → select text → press hotkey → rewritten in place
4. Open Obsidian → select paragraph → press hotkey → rewritten
5. Tone preservation: casual text rewritten without explicit tone stays casual
6. Full round-trip completes in < 5s on M5
