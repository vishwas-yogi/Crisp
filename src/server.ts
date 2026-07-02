import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { Config } from './types.ts';

const PORT = 8765;
const HOST = '127.0.0.1';
const MAX_BODY_BYTES = 1 * 1024 * 1024; // 1 MB

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        req.destroy();
        reject(new Error('request body too large'));
        return;
      }
      body += chunk.toString();
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

export function startServer(
  config: Config,
  onRewrite: (text: string, tone: string) => Promise<string>,
): void {
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    // Browsers always send an Origin header on cross-origin requests; service.py never does.
    // Rejecting any request that carries Origin blocks CSRF from local web pages.
    if (req.headers.origin !== undefined) {
      res.writeHead(403).end();
      return;
    }

    if (req.method !== 'POST' || req.url !== '/rewrite') {
      res.writeHead(404).end();
      return;
    }

    try {
      const body = await readBody(req);

      let parsed: unknown;
      try {
        parsed = JSON.parse(body);
      } catch {
        res.writeHead(400).end(JSON.stringify({ error: 'invalid JSON' }));
        return;
      }

      if (typeof parsed !== 'object' || parsed === null) {
        res.writeHead(400).end(JSON.stringify({ error: 'expected JSON object' }));
        return;
      }

      const { text, tone } = parsed as Record<string, unknown>;

      if (typeof text !== 'string' || text.trim().length < 3) {
        res.writeHead(400).end(JSON.stringify({ error: 'text missing or too short' }));
        return;
      }

      const resolvedTone = typeof tone === 'string' ? tone : config.general.default_tone;
      const result = await onRewrite(text, resolvedTone);
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ result }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[crisp] Request error:', msg);
      res.writeHead(500).end(JSON.stringify({ error: msg }));
    }
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[crisp] Port ${PORT} already in use — is another instance running?`);
    } else {
      console.error('[crisp] Server error:', err.message);
    }
    process.exit(1);
  });

  server.listen(PORT, HOST);
}
