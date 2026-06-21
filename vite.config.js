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
                fs.writeFileSync(dbPath, body, 'utf8');
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.end(JSON.stringify({ success: true }));
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
