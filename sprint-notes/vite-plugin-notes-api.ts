import type { Plugin } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

export default function notesApi(): Plugin {
  const dataDir = path.resolve(__dirname, 'data');
  const filePath = path.join(dataDir, 'notes.json');

  function ensureFile() {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, '{}', 'utf-8');
    }
  }

  function writeNotes(data: string) {
    const pretty = JSON.stringify(JSON.parse(data), null, 2);
    fs.writeFileSync(filePath, pretty, 'utf-8');
  }

  return {
    name: 'notes-api',
    configureServer(server) {
      server.middlewares.use('/api/notes', (req, res) => {
        ensureFile();

        if (req.method === 'GET') {
          const data = fs.readFileSync(filePath, 'utf-8');
          res.setHeader('Content-Type', 'application/json');
          res.end(data);
          return;
        }

        if (req.method === 'POST') {
          // Vite's connect middleware may have already parsed the body
          const reqWithBody = req as typeof req & { body?: unknown };
          if (reqWithBody.body !== undefined && reqWithBody.body !== null) {
            const json = typeof reqWithBody.body === 'string'
              ? reqWithBody.body
              : JSON.stringify(reqWithBody.body);
            writeNotes(json);
            res.setHeader('Content-Type', 'application/json');
            res.end('{"ok":true}');
            return;
          }

          // Fallback: read raw stream chunks
          const chunks: Buffer[] = [];
          req.on('data', (chunk: unknown) => {
            if (Buffer.isBuffer(chunk)) {
              chunks.push(chunk);
            } else if (typeof chunk === 'string') {
              chunks.push(Buffer.from(chunk));
            } else {
              // Chunk is a parsed object — stringify it directly
              writeNotes(JSON.stringify(chunk));
              res.setHeader('Content-Type', 'application/json');
              res.end('{"ok":true}');
            }
          });
          req.on('end', () => {
            if (chunks.length > 0) {
              writeNotes(Buffer.concat(chunks).toString('utf-8'));
              res.setHeader('Content-Type', 'application/json');
              res.end('{"ok":true}');
            }
          });
          return;
        }

        res.statusCode = 405;
        res.end('Method not allowed');
      });
    },
  };
}
