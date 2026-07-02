import { execFile } from 'node:child_process';

function runAppleScript(script: string, timeoutMs = 60000): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = execFile('osascript', ['-'], { timeout: timeoutMs }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout.trim());
    });
    proc.stdin!.write(script);
    proc.stdin!.end();
  });
}

// Escape text for safe embedding in an AppleScript string literal.
function esc(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '')
    .replace(/\n/g, '" & return & "');
}

function truncate(text: string, max = 180): string {
  const trimmed = text.trim();
  return trimmed.length <= max ? trimmed : trimmed.slice(0, max) + '…';
}

// Shows an Accept/Reject dialog. Returns true if the user accepted.
// Dismissed dialog or error counts as rejection.
export async function showConfirmDialog(original: string, rewritten: string): Promise<boolean> {
  const origDisplay = truncate(original);
  const rewDisplay = truncate(rewritten);

  const script = `
set dialogResult to display dialog ¬
  "Original:" & return & "${esc(origDisplay)}" & return & return & ¬
  "Rewritten:" & return & "${esc(rewDisplay)}" ¬
  buttons {"Reject", "Accept"} ¬
  default button "Accept" ¬
  with title "Crisp"
return button returned of dialogResult
`.trim();

  try {
    const result = await runAppleScript(script);
    return result === 'Accept';
  } catch {
    // User dismissed the dialog (Esc / Command-period) or error
    return false;
  }
}

// macOS system notification — fire-and-forget.
export function notify(title: string, message: string): void {
  const script = `display notification "${esc(message)}" with title "${esc(title)}"`;
  const proc = execFile('osascript', ['-'], { timeout: 3000 }, () => {});
  proc.stdin!.write(script);
  proc.stdin!.end();
}
