import { existsSync, readFileSync } from 'node:fs';
import { HOOKS_PATH } from './config.ts';
import type { LuaRunner } from './types.ts';

const noopRunner: LuaRunner = {
  onBeforeRewrite: async (text, _app, tone) => [text, tone],
  onAfterRewrite: async (_orig, rewritten) => rewritten,
};

// Lazy-loads wasmoon and ~/.crisp/hooks.lua only if the file exists.
// Returns a noop runner if hooks.lua is absent or fails to load.
export async function createLuaRunner(): Promise<LuaRunner> {
  if (!existsSync(HOOKS_PATH)) {
    return noopRunner;
  }

  try {
    const { LuaFactory } = await import('wasmoon');
    const factory = new LuaFactory();
    const lua = await factory.createEngine();

    const hooksCode = readFileSync(HOOKS_PATH, 'utf8');
    await lua.doString(hooksCode);

    return {
      async onBeforeRewrite(text, appName, tone) {
        try {
          const fn = lua.global.get('on_before_rewrite') as
            ((t: string, a: string, tone: string) => [string, string] | undefined) | undefined;
          if (typeof fn !== 'function') return [text, tone];
          const result = fn(text, appName, tone);
          if (Array.isArray(result) && result.length >= 2) {
            return [String(result[0] ?? text), String(result[1] ?? tone)];
          }
          return [text, tone];
        } catch (err) {
          console.warn('[crisp] hooks.lua on_before_rewrite error:', err);
          return [text, tone];
        }
      },

      async onAfterRewrite(original, rewritten, appName) {
        try {
          const fn = lua.global.get('on_after_rewrite') as
            ((o: string, r: string, a: string) => string | undefined) | undefined;
          if (typeof fn !== 'function') return rewritten;
          const result = fn(original, rewritten, appName);
          return typeof result === 'string' ? result : rewritten;
        } catch (err) {
          console.warn('[crisp] hooks.lua on_after_rewrite error:', err);
          return rewritten;
        }
      },
    };
  } catch (err) {
    console.warn('[crisp] Failed to initialize Lua runner — hooks.lua will be skipped:', err);
    return noopRunner;
  }
}
