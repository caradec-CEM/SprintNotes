import type { Plugin } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

interface FileEndpoint {
  route: string;       // URL path, e.g. '/api/notes'
  filename: string;    // File under data/, e.g. 'notes.json'
  defaultBody: string; // Initial contents if file doesn't exist
}

const ENDPOINTS: FileEndpoint[] = [
  { route: '/api/notes', filename: 'notes.json', defaultBody: '{}' },
  { route: '/api/team', filename: 'team.json', defaultBody: '{"members":[]}' },
];

export default function notesApi(): Plugin {
  const dataDir = path.resolve(__dirname, 'data');

  function ensureFile(filename: string, defaultBody: string): string {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const filePath = path.join(dataDir, filename);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, defaultBody, 'utf-8');
    }
    return filePath;
  }

  function handle(endpoint: FileEndpoint) {
    return (req: IncomingMessage, res: ServerResponse) => {
      const filePath = ensureFile(endpoint.filename, endpoint.defaultBody);

      if (req.method === 'GET') {
        const data = fs.readFileSync(filePath, 'utf-8');
        res.setHeader('Content-Type', 'application/json');
        res.end(data);
        return;
      }

      if (req.method === 'POST') {
        // Vite's connect middleware may have already parsed JSON bodies.
        const bodyReq = req as IncomingMessage & { body?: unknown };
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
    };
  }

  return {
    name: 'notes-api',
    configureServer(server) {
      for (const endpoint of ENDPOINTS) {
        server.middlewares.use(endpoint.route, handle(endpoint));
      }
    },
  };
}
