import clipboard from 'clipboardy';
import { execFile } from 'node:child_process';
import type { UndoEntry } from './types.ts';

const undoStack: UndoEntry[] = [];
const MAX_UNDO = 20;

// Run an AppleScript passed via stdin — avoids all shell quoting issues.
function runAppleScript(script: string, timeoutMs = 5000): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = execFile('osascript', ['-'], { timeout: timeoutMs }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout.trim());
    });
    proc.stdin!.write(script);
    proc.stdin!.end();
  });
}

export async function getActiveApp(): Promise<string> {
  try {
    return await runAppleScript(`
      tell application "System Events"
        return name of first application process whose frontmost is true
      end tell
    `);
  } catch {
    return 'Unknown';
  }
}

export async function saveClipboard(): Promise<string> {
  try {
    return await clipboard.read();
  } catch {
    return '';
  }
}

// Simulate Cmd+C to copy the current selection into the clipboard.
export async function copySelection(): Promise<void> {
  await runAppleScript('tell application "System Events" to keystroke "c" using {command down}');
}

export async function readClipboard(): Promise<string> {
  return clipboard.read();
}

export async function writeClipboard(text: string): Promise<void> {
  await clipboard.write(text);
}

// Simulate Cmd+V to paste clipboard contents into the active app.
export async function paste(): Promise<void> {
  await runAppleScript('tell application "System Events" to keystroke "v" using {command down}');
}

export async function restoreClipboard(saved: string): Promise<void> {
  if (saved) {
    await clipboard.write(saved);
  }
}

export function pushUndo(entry: UndoEntry): void {
  undoStack.push(entry);
  if (undoStack.length > MAX_UNDO) undoStack.shift();
}

export function popUndo(): UndoEntry | undefined {
  return undoStack.pop();
}

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
