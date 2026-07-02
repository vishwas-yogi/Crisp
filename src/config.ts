import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { parse } from 'smol-toml';
import type { Config } from './types.ts';

export type { Config, ToneConfig } from './types.ts';

const DEFAULTS: Config = {
  general: {
    mode: 'confirm',
    default_tone: 'personal',
    hotkey: 'cmd+shift+r',
    preserve_tone: true,
  },
  model: {
    name: 'qwen2.5:1.5b',
    ollama_url: 'http://localhost:11434',
    keepalive: '10m',
  },
  tones: {
    personal: {
      description: 'Casual, natural, keep my voice',
      hint: 'Improve clarity and flow only. Keep the tone casual and natural — do not change the style or voice.',
    },
    professional: {
      description: 'Clear, polite, workplace appropriate',
      hint: 'Make this professional and clear. Preserve the core message and all details.',
    },
    academic: {
      description: 'Formal, precise, structured',
      hint: 'Rewrite in a formal academic style. Preserve all factual details exactly.',
    },
    concise: {
      description: 'Trim the fat, keep the point',
      hint: 'Make this more concise. Remove filler, keep all meaning.',
    },
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deepMerge(base: any, override: any): any {
  const result = { ...base };
  for (const key of Object.keys(override ?? {})) {
    if (
      override[key] !== null &&
      typeof override[key] === 'object' &&
      !Array.isArray(override[key]) &&
      typeof base[key] === 'object'
    ) {
      result[key] = deepMerge(base[key] ?? {}, override[key]);
    } else if (override[key] !== undefined) {
      result[key] = override[key];
    }
  }
  return result;
}

export function loadConfig(): Config {
  const configDir = join(homedir(), '.crisp');
  const configPath = join(configDir, 'config.toml');

  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  if (!existsSync(configPath)) {
    return DEFAULTS;
  }

  try {
    const raw = readFileSync(configPath, 'utf8');
    const parsed = parse(raw) as Partial<Config>;
    return deepMerge(DEFAULTS, parsed) as Config;
  } catch (err) {
    console.error('[crisp] Failed to parse ~/.crisp/config.toml:', err);
    console.error('[crisp] Falling back to defaults.');
    return DEFAULTS;
  }
}

export const CONFIG_DIR = join(homedir(), '.crisp');
export const CONFIG_PATH = join(CONFIG_DIR, 'config.toml');
export const HOOKS_PATH = join(CONFIG_DIR, 'hooks.lua');
