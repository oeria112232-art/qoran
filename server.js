import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 4445;
const SEED_DB_PATH = path.resolve(__dirname, 'bonyan_database.json');
const DB_PATH = path.resolve(__dirname, 'database_live.json');

// Copy seed database to live database if live database doesn't exist on server startup
if (!fs.existsSync(DB_PATH) && fs.existsSync(SEED_DB_PATH)) {
  fs.copyFileSync(SEED_DB_PATH, DB_PATH);
}

const DIST_DIR = path.resolve(__dirname, 'dist');

// Find the current active JS file name at startup to intercept outdated cache requests
let currentJsFile = '';
try {
  const assetsDir = path.resolve(DIST_DIR, 'assets');
  if (fs.existsSync(assetsDir)) {
    const files = fs.readdirSync(assetsDir);
    const jsFile = files.find(f => f.startsWith('index-') && f.endsWith('.js'));
    if (jsFile) {
      currentJsFile = jsFile;
      console.log('Current active JS bundle file is:', currentJsFile);
    }
  }
} catch (e) {
  console.error('Failed to read active assets:', e);
}

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const requestUrl = req.url.split('?')[0];

  // Intercept requests to old index-*.js files and force browser reload
  if (requestUrl.startsWith('/assets/index-') && requestUrl.endsWith('.js')) {
    const requestedFile = path.basename(requestUrl);
    if (currentJsFile && requestedFile !== currentJsFile) {
      console.log(`Intercepting outdated asset request: ${requestedFile}. Forcing client reload.`);
      res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' });
      res.end('console.warn("Outdated bundle detected. Force reloading page..."); window.location.reload(true);');
      return;
    }
  }

  // Handle API Gemini AI Proxy
  if (requestUrl.startsWith('/api/ai') && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { userPrompt, systemInstruction, imageBase64 } = JSON.parse(body);
        let keyToUse = "AQ.Ab8RN6IDw5D9b3S6PTMyaelq41jSqzi7JTM1EjY6qkP-RBKDmQ";
        const keyFilePath = path.resolve(__dirname, 'api_key.txt');
        if (fs.existsSync(keyFilePath)) {
          try {
            const fileKey = fs.readFileSync(keyFilePath, 'utf8').trim();
            if (fileKey) {
              keyToUse = fileKey;
            }
          } catch (e) {
            console.error('Failed to read api_key.txt dynamically:', e);
          }
        }
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${keyToUse}`;
        
        const parts = [{ text: `${systemInstruction}\n\nالسياق/سؤال المستخدم:\n${userPrompt}` }];
        if (imageBase64) {
          const match = imageBase64.match(/^data:(image\/[a-zA-Z0-9.-]+);base64,(.+)$/);
          if (match) {
            parts.push({
              inline_data: {
                mime_type: match[1],
                data: match[2]
              }
            });
          }
        }

        const apiResponse = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{ parts }]
          })
        });

        const data = await apiResponse.json();
        res.writeHead(apiResponse.status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // Diagnostic endpoint to check database status
  if (req.url.startsWith('/api/debug')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    const liveExists = fs.existsSync(DB_PATH);
    const seedExists = fs.existsSync(SEED_DB_PATH);
    let liveSize = 0;
    let liveContentPreview = '';
    if (liveExists) {
      try {
        const content = fs.readFileSync(DB_PATH, 'utf8');
        const parsed = JSON.parse(content);
        liveSize = content.length;
        liveContentPreview = `students: ${parsed?.students?.length || 0}, teachers: ${parsed?.teachers?.length || 0}, classrooms: ${parsed?.classrooms?.length || 0}`;
      } catch (e) {
        liveContentPreview = 'Error: ' + e.message;
      }
    }
    res.end(JSON.stringify({
      liveExists,
      seedExists,
      liveSize,
      liveContentPreview,
      dbPath: DB_PATH,
      seedDbPath: SEED_DB_PATH
    }));
    return;
  }

  // Handle API Database
  if (req.url.startsWith('/api/database')) {
    if (req.method === 'GET') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      
      if (fs.existsSync(DB_PATH)) {
        res.end(fs.readFileSync(DB_PATH, 'utf8'));
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
          // Validate JSON and schema before saving
          const parsed = JSON.parse(body);
          if (parsed && Array.isArray(parsed.students) && parsed.students.length >= 100 && Array.isArray(parsed.teachers)) {
            fs.writeFileSync(DB_PATH, body, 'utf8');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
          } else {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid database structure' }));
          }
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
      });
      return;
    }
  }

  // Serve Static Files from dist directory
  let filePath = path.join(DIST_DIR, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
  
  // Safe path traversal check
  if (!filePath.startsWith(DIST_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Fallback to index.html for SPA routing
      filePath = path.join(DIST_DIR, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (readErr, content) => {
      if (readErr) {
        res.writeHead(500);
        res.end('Server Error');
        return;
      }
      
      const responseHeaders = { 'Content-Type': contentType };
      
      // Prevent browser caching for HTML files so users always get the latest build references
      if (ext === '.html') {
        responseHeaders['Cache-Control'] = 'no-store, no-cache, must-revalidate, proxy-revalidate';
        responseHeaders['Pragma'] = 'no-cache';
        responseHeaders['Expires'] = '0';
      } else {
        // Cache static assets (JS, CSS, images) for up to 1 year since Vite uses unique hashes in filenames
        responseHeaders['Cache-Control'] = 'public, max-age=31536000, immutable';
      }

      res.writeHead(200, responseHeaders);
      res.end(content);
    });
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
});
