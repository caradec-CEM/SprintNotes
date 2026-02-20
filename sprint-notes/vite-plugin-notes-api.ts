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
