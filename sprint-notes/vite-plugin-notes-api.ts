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
          const reqWithBody = req as typeof req & { body?: unknown };
          if (reqWithBody.body) {
            const data = typeof reqWithBody.body === 'string' ? reqWithBody.body : JSON.stringify(reqWithBody.body);
            const pretty = JSON.stringify(JSON.parse(data), null, 2);
            fs.writeFileSync(filePath, pretty, 'utf-8');
            res.setHeader('Content-Type', 'application/json');
            res.end('{"ok":true}');
            return;
          }

          let body = '';
          req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
          req.on('end', () => {
            const pretty = JSON.stringify(JSON.parse(body), null, 2);
            fs.writeFileSync(filePath, pretty, 'utf-8');
            res.setHeader('Content-Type', 'application/json');
            res.end('{"ok":true}');
          });
          return;
        }

        res.statusCode = 405;
        res.end('Method not allowed');
      });
    },
  };
}
