import { Ollama } from 'ollama';
import type { Config } from './types.ts';

function buildSystemPrompt(
  toneHint: string,
  preserveTone: boolean,
  hasExplicitTone: boolean,
): string {
  const toneRule =
    preserveTone && !hasExplicitTone
      ? "Do not change the author's voice, style, or tone."
      : toneHint;

  return [
    "You are a writing assistant. Your only job is to rewrite the user's text.",
    'Rules:',
    `- ${toneRule}`,
    '- Preserve ALL original details, facts, and meaning exactly.',
    '- Preserve all markdown formatting (bold, headers, lists, code blocks) if present.',
    '- Output ONLY the rewritten text — no explanations, no preamble, no surrounding quotes.',
  ].join('\n');
}

function cleanOutput(text: string): string {
  return text
    .trim()
    .replace(/^["'`]|["'`]$/gs, '') // strip surrounding quotes or backticks
    .replace(/^```[\w]*\n?|\n?```$/gm, '') // strip code fences
    .trim();
}

export async function rewrite(text: string, tone: string, config: Config): Promise<string> {
  const toneConfig = config.tones[tone] ?? config.tones[config.general.default_tone];
  const hasExplicitTone = tone !== config.general.default_tone || !config.general.preserve_tone;
  const systemPrompt = buildSystemPrompt(
    toneConfig?.hint ?? 'Improve clarity and flow.',
    config.general.preserve_tone,
    hasExplicitTone,
  );

  const ollama = new Ollama({ host: config.model.ollama_url });

  const response = await ollama.chat({
    model: config.model.name,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: text },
    ],
    keep_alive: config.model.keepalive,
    stream: false,
  });

  return cleanOutput(response.message.content);
}
