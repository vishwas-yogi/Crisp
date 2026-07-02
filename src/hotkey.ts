import { uIOhook, UiohookKey, type UiohookKeyboardEvent } from 'uiohook-napi';
import type { Config } from './types.ts';

type ParsedHotkey = {
  keycode: number;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
};

// Maps config key name strings to UiohookKey codes.
// Add more as needed — letter keys cover the common case.
const KEY_MAP: Record<string, number> = {
  a: UiohookKey.A,
  b: UiohookKey.B,
  c: UiohookKey.C,
  d: UiohookKey.D,
  e: UiohookKey.E,
  f: UiohookKey.F,
  g: UiohookKey.G,
  h: UiohookKey.H,
  i: UiohookKey.I,
  j: UiohookKey.J,
  k: UiohookKey.K,
  l: UiohookKey.L,
  m: UiohookKey.M,
  n: UiohookKey.N,
  o: UiohookKey.O,
  p: UiohookKey.P,
  q: UiohookKey.Q,
  r: UiohookKey.R,
  s: UiohookKey.S,
  t: UiohookKey.T,
  u: UiohookKey.U,
  v: UiohookKey.V,
  w: UiohookKey.W,
  x: UiohookKey.X,
  y: UiohookKey.Y,
  z: UiohookKey.Z,
  '0': UiohookKey['0'],
  '1': UiohookKey['1'],
  '2': UiohookKey['2'],
  '3': UiohookKey['3'],
  '4': UiohookKey['4'],
  '5': UiohookKey['5'],
  '6': UiohookKey['6'],
  '7': UiohookKey['7'],
  '8': UiohookKey['8'],
  '9': UiohookKey['9'],
  space: UiohookKey.Space,
  '.': UiohookKey.Period,
  ',': UiohookKey.Comma,
  '/': UiohookKey.Slash,
  f1: UiohookKey.F1,
  f2: UiohookKey.F2,
  f3: UiohookKey.F3,
  f4: UiohookKey.F4,
  f5: UiohookKey.F5,
  f6: UiohookKey.F6,
  f7: UiohookKey.F7,
  f8: UiohookKey.F8,
  f9: UiohookKey.F9,
  f10: UiohookKey.F10,
  f11: UiohookKey.F11,
  f12: UiohookKey.F12,
};

function parseHotkey(hotkey: string): ParsedHotkey {
  const parts = hotkey
    .toLowerCase()
    .split('+')
    .map((p) => p.trim());
  const key = parts[parts.length - 1];
  const modifiers = new Set(parts.slice(0, -1));

  const keycode = KEY_MAP[key];
  if (keycode === undefined) {
    throw new Error(
      `[crisp] Unknown key in hotkey config: "${key}". Supported: a-z, 0-9, space, f1-f12, . , /`,
    );
  }

  return {
    keycode,
    metaKey: modifiers.has('cmd') || modifiers.has('command') || modifiers.has('meta'),
    ctrlKey: modifiers.has('ctrl') || modifiers.has('control'),
    altKey: modifiers.has('alt') || modifiers.has('option'),
    shiftKey: modifiers.has('shift'),
  };
}

function matchesHotkey(e: UiohookKeyboardEvent, hotkey: ParsedHotkey): boolean {
  return (
    e.keycode === hotkey.keycode &&
    !!e.metaKey === hotkey.metaKey &&
    !!e.ctrlKey === hotkey.ctrlKey &&
    !!e.altKey === hotkey.altKey &&
    !!e.shiftKey === hotkey.shiftKey
  );
}

export function registerHotkeys(config: Config, onRewrite: () => void): () => void {
  const rewriteHotkey = parseHotkey(config.general.hotkey);

  uIOhook.on('keydown', (e) => {
    if (matchesHotkey(e, rewriteHotkey)) {
      onRewrite();
    }
  });

  uIOhook.start();
  console.log(`[crisp] Listening for hotkey: ${config.general.hotkey}`);

  const stop = () => {
    uIOhook.stop();
  };

  process.on('SIGINT', () => {
    stop();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    stop();
    process.exit(0);
  });
  process.on('exit', stop);

  return stop;
}
