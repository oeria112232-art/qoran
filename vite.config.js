import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

import fs from 'fs'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'api-database-middleware',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url.startsWith('/api/database')) {
            const dbPath = path.resolve(__dirname, 'bonyan_database.json');
            
            if (req.method === 'GET') {
              res.setHeader('Content-Type', 'application/json');
              res.setHeader('Access-Control-Allow-Origin', '*');
              if (fs.existsSync(dbPath)) {
                res.end(fs.readFileSync(dbPath, 'utf8'));
              } else {
                res.end(JSON.stringify({}));
              }
              return;
            }
            
            if (req.method === 'POST') {
              let body = '';
              req.on('data', chunk => { body += chunk; });
              req.on('end', () => {
                try {
                  const parsed = JSON.parse(body);
                  if (parsed && Array.isArray(parsed.students) && parsed.students.length >= 100 && Array.isArray(parsed.teachers)) {
                    fs.writeFileSync(dbPath, body, 'utf8');
                    res.setHeader('Content-Type', 'application/json');
                    res.setHeader('Access-Control-Allow-Origin', '*');
                    res.end(JSON.stringify({ success: true }));
                  } else {
                    res.statusCode = 400;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ error: 'Invalid database structure' }));
                  }
                } catch (e) {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: 'Invalid JSON' }));
                }
              });
              return;
            }
          }
          next();
        });
      }
    }
  ],
  server: {
    port: 4445,
    host: '127.0.0.1',
    allowedHosts: true,
  }
})
