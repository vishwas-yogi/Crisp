import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import type { Config } from './types.ts';

// Compiled from helper/hotkey.swift — run "npm run build:hotkey" to (re)build.
const HELPER_BIN = join(process.cwd(), 'helper', 'hotkey-bin');

let helperProcess: ChildProcess | null = null;

export function registerHotkeys(config: Config, onRewrite: () => void): () => void {
  if (!existsSync(HELPER_BIN)) {
    throw new Error(
      `[crisp] Hotkey helper binary not found at ${HELPER_BIN}\n` +
        `Run "npm run build:hotkey" to compile it.`,
    );
  }

  helperProcess = spawn(HELPER_BIN, [config.general.hotkey], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // Each line on stdout is a HOTKEY signal from the Swift process
  const rl = createInterface({ input: helperProcess.stdout! });
  rl.on('line', (line) => {
    if (line.trim() === 'HOTKEY') {
      onRewrite();
    }
  });

  // Forward Swift stderr (permission prompts, debug info) to our stderr
  helperProcess.stderr?.on('data', (data: Buffer) => process.stderr.write(data));

  helperProcess.on('error', (err) => {
    console.error('[crisp] Failed to start hotkey helper:', err.message);
  });

  helperProcess.on('exit', (code, signal) => {
    if (signal !== 'SIGTERM' && signal !== 'SIGKILL' && code !== 0) {
      console.error(`[crisp] Hotkey helper exited unexpectedly (code=${code ?? signal})`);
    }
  });

  console.log(`[crisp] Listening for hotkey: ${config.general.hotkey}`);

  const stop = () => {
    if (helperProcess) {
      helperProcess.kill('SIGTERM');
      helperProcess = null;
    }
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
