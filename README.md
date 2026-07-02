# Crisp

A local, private AI writing assistant for macOS. Select any text in any app, trigger the Crisp service, and it's rewritten by a local LLM — in place, preserving your voice.

Works everywhere (Gmail, WhatsApp, Obsidian, Slack, Notes, VS Code…). No browser extension. No cloud. No cost per rewrite.

---

## How it works

1. Select text in any app
2. Right-click → **Services → Crisp Rewrite (Crisp Rewrite.workflow)**
3. In `confirm` mode (default): review the rewrite in an Accept/Reject dialog → click **Accept**
4. The selected text is replaced with the rewritten version

The replacement is a standard macOS edit — **Cmd+Z undoes it** in any app.

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

# 5. Install the macOS Service (one-time)
npm run install-service

# 6. Start the daemon
npm run dev
```

No permissions dialogs required.

---

## Configuration

Crisp reads `~/.crisp/config.toml` on startup. Created automatically with defaults if absent.

```toml
[general]
mode = "confirm"          # "confirm" shows Accept/Reject dialog; "auto" replaces immediately
default_tone = "personal"
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

### Custom tones

Add any `[tones.yourname]` block with a `description` and `hint`. The `hint` is injected directly into the model prompt.

---

## Lua hooks

Create `~/.crisp/hooks.lua` to customise behaviour per-app without touching source code.

```lua
-- Called before the model sees the text. Return (text, tone) to modify either.
function on_before_rewrite(text, app_name, tone)
  if app_name == "Mimestream" or app_name == "Mail" then
    return text, "professional"
  end
  return text, tone
end

-- Called after the model returns. Return the final text.
function on_after_rewrite(original, rewritten, app_name)
  return rewritten
end
```

If the file doesn't exist, hooks are silently skipped.

---

## Model options

| Model | RAM | Speed (M5) | Notes |
|---|---|---|---|
| `qwen2.5:1.5b` (default) | ~1.5 GB | ~180 tok/s | Good quality, low footprint |
| `phi3.5:mini` | ~3.0 GB | ~90 tok/s | Better reasoning, 128k context |
| `qwen2.5:0.5b` | ~0.8 GB | ~300 tok/s | Fastest, reduced quality |

---

## Known limitations

- **Confirm dialog truncates text at 180 characters** — the full text is still sent to the model and used for replacement; only the preview in the dialog is shortened.
- **`auto` mode replaces without confirmation** — safe for short text, use carefully for long selections.
- **Daemon must be running** — if `npm run dev` isn't active, the service silently returns the original text unchanged.

---

## Dev commands

```bash
npm run dev              # Start the daemon
npm run install-service  # (Re)install the macOS Service workflow
npm run typecheck        # TypeScript type check
npm run lint             # ESLint
npm run lint:fix         # ESLint with auto-fix
npm run format           # Prettier format
npm run format:check     # Prettier check
```

---

## Troubleshooting

**Service doesn't appear in right-click menu** — run `npm run install-service` and reopen the app. If two "Crisp Rewrite" items appear, always use the one labelled `(Crisp Rewrite.workflow)`.

**Nothing happens when the service is clicked** — make sure `npm run dev` is running.

**Wrong text is rewritten** — avoid copying anything between selecting text and triggering the service; the workflow reads from the clipboard.

**Rewrite is slow on first use** — Ollama loads the model on the first request (~2s). Subsequent rewrites are fast. Increase `keepalive` in config.toml to keep the model warm.

---

## Architecture

See [`ARCHITECTURE.md`](ARCHITECTURE.md) for a detailed breakdown of how all the pieces fit together.

---

## Roadmap

- **Phase 2**: Menu bar icon with tone switcher, launchd auto-start on login
- **Phase 3**: Full-text diff confirm UI (no truncation), tone quick-picker, long-text chunking
- **Phase 4**: MLX backend (Apple Neural Engine), optional browser extension
