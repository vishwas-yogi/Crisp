# Crisp

A local, private AI writing assistant for macOS. Select any text in any app, press a hotkey, and it's rewritten — preserving your voice, in place, instantly.

Works everywhere (Gmail, Obsidian, Slack, Notes, VS Code…) via the clipboard. No browser extension. No cloud. No cost per rewrite.

---

## How it works

1. Select text in any app
2. Press `Cmd+Shift+R`
3. Crisp copies the selection, sends it to a local LLM, and pastes the result back
4. In `confirm` mode (default), you see an Accept/Reject dialog first

The clipboard is saved before and restored after — your clipboard contents are unaffected.

---

## Requirements

- macOS (Apple Silicon recommended — M1 or later)
- Node.js 18+
- [Ollama](https://ollama.com) with `qwen2.5:1.5b` pulled

---

## Quick start

```bash
# 1. Install Ollama
brew install ollama

# 2. Pull the model (~900 MB, ~1.5 GB RAM when loaded)
ollama pull qwen2.5:1.5b

# 3. Start Ollama (or it auto-starts on first request)
ollama serve

# 4. Install Crisp dependencies
npm install

# 5. Run
npm run dev
```

On first run, macOS will ask for two permissions — grant both:
- **Accessibility** — to read global keydown events
- **Input Monitoring** — to hook the keyboard system-wide

(System Settings → Privacy & Security → Accessibility / Input Monitoring)

---

## Configuration

Crisp reads `~/.crisp/config.toml` on startup. The file is created automatically with defaults if absent.

```toml
[general]
mode = "confirm"          # "confirm" shows Accept/Reject dialog; "auto" replaces immediately
default_tone = "personal"
hotkey = "cmd+shift+r"    # Change if this conflicts with apps you use
preserve_tone = true      # Don't alter your voice unless a tone is explicitly applied

[model]
name = "qwen2.5:1.5b"
ollama_url = "http://localhost:11434"
keepalive = "10m"         # Keep model warm in memory for 10 min after last use

[tones.personal]
description = "Casual, natural, keep my voice"
hint = "Improve clarity and flow only. Keep the tone casual and natural."

[tones.professional]
description = "Clear, polite, workplace appropriate"
hint = "Make this professional and clear. Preserve the core message and all details."

[tones.academic]
description = "Formal, precise, structured"
hint = "Rewrite in a formal academic style. Preserve all factual details exactly."

[tones.concise]
description = "Trim the fat, keep the point"
hint = "Make this more concise. Remove filler, keep all meaning."
```

### Adding custom tones

Add any `[tones.yourname]` block with a `description` and `hint`. The `hint` is injected directly into the model prompt, so write it as a plain instruction.

### Hotkey conflicts

`Cmd+Shift+R` triggers Chrome's hard reload. If you write in the browser often, change the hotkey:

```toml
[general]
hotkey = "ctrl+shift+r"   # Ctrl modifier is rarely used in macOS apps
```

---

## Lua hooks

Create `~/.crisp/hooks.lua` to customise behaviour per-app without touching the source code.

```lua
-- Called before the model sees the text.
-- Return (text, tone) — modify either to change what gets sent.
function on_before_rewrite(text, app_name, tone)
  -- Force professional tone in email apps
  if app_name == "Mimestream" or app_name == "Mail" or app_name == "Spark" then
    return text, "professional"
  end
  return text, tone
end

-- Called after the model returns.
-- Return the final text to paste.
function on_after_rewrite(original, rewritten, app_name)
  return rewritten
end
```

If the file doesn't exist, hooks are silently skipped. Errors inside hook functions are caught and logged — they never crash the daemon.

---

## Model options

| Model | RAM | Speed (M5) | Notes |
|---|---|---|---|
| `qwen2.5:1.5b` (default) | ~1.5 GB | ~180 tok/s | Good quality, low footprint |
| `phi3.5:mini` | ~3.0 GB | ~90 tok/s | Better reasoning, 128k context |
| `qwen2.5:0.5b` | ~0.8 GB | ~300 tok/s | Fastest, reduced quality |

Change model in `~/.crisp/config.toml` under `[model] name = "..."`.

---

## Dev commands

```bash
npm run dev          # Start the daemon (tsx, hot-reloadable)
npm run typecheck    # TypeScript type check
npm run lint         # ESLint
npm run lint:fix     # ESLint with auto-fix
npm run format       # Prettier format
npm run format:check # Prettier check (for CI)
```

---

## Project structure

```
src/
  index.ts      — Main daemon: wires hotkey → clipboard → model → confirm → paste
  types.ts      — Shared TypeScript types (Config, UndoEntry, LuaRunner, ToneConfig)
  config.ts     — Loads ~/.crisp/config.toml, deep-merges with typed defaults
  rewriter.ts   — Ollama client, prompt assembly, output sanitisation
  clipboard.ts  — save / copySelection / read / write / paste / restore + undo stack
  hotkey.ts     — uiohook-napi global hotkey listener, parses "cmd+shift+r" strings
  confirm.ts    — osascript Accept/Reject dialog and notify() helper
  lua.ts        — wasmoon Lua 5.4 runner, lazy-loaded, noop fallback
```

---

## Roadmap

- **Phase 2**: Undo hotkey, menu bar icon with tone switcher, launchd auto-start
- **Phase 3**: Side-by-side diff confirm UI, tone quick-picker hotkey, long-text chunking
- **Phase 4**: MLX backend (Apple Neural Engine), optional browser extension
