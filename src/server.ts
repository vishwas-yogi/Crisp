import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { Config } from './types.ts';

const PORT = 8765;
const HOST = '127.0.0.1';

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: Buffer) => (body += chunk.toString()));
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

export function startServer(
  config: Config,
  onRewrite: (text: string, tone: string) => Promise<string>,
): void {
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== 'POST' || req.url !== '/rewrite') {
      res.writeHead(404).end();
      return;
    }
    try {
      const body = await readBody(req);
      const { text, tone = config.general.default_tone } = JSON.parse(body) as {
        text: string;
        tone?: string;
      };
      if (!text || text.trim().length < 3) {
        res.writeHead(400).end(JSON.stringify({ error: 'text too short' }));
        return;
      }
      const result = await onRewrite(text, tone);
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ result }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[crisp] Request error:', msg);
      res.writeHead(500).end(JSON.stringify({ error: msg }));
    }
  });

  server.listen(PORT, HOST);
}
