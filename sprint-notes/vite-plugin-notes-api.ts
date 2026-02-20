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
          // (for application/json). If so, req.body is an object and the
          // stream is consumed. For text/plain the stream is still intact.
          const bodyReq = req as typeof req & { body?: unknown };
          if (bodyReq.body !== undefined && bodyReq.body !== null) {
            try {
              const raw = typeof bodyReq.body === 'string'
                ? bodyReq.body
                : JSON.stringify(bodyReq.body);
              const pretty = JSON.stringify(JSON.parse(raw), null, 2);
              fs.writeFileSync(filePath, pretty, 'utf-8');
              res.setHeader('Content-Type', 'application/json');
              res.end('{"ok":true}');
            } catch (e) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: String(e) }));
            }
            return;
          }

          // Fallback: read from stream (text/plain or unparsed bodies)
          const chunks: Buffer[] = [];
          req.on('data', (chunk: Buffer) => chunks.push(chunk));
          req.on('end', () => {
            try {
              const raw = Buffer.concat(chunks).toString('utf-8');
              const pretty = JSON.stringify(JSON.parse(raw), null, 2);
              fs.writeFileSync(filePath, pretty, 'utf-8');
              res.setHeader('Content-Type', 'application/json');
              res.end('{"ok":true}');
            } catch (e) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: String(e) }));
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
