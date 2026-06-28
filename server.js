import http from 'http';
import https from 'https';
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

// Dynamically read active bundle filenames from dist/assets on every check
const getActiveBundleFiles = () => {
  try {
    const assetsDir = path.resolve(DIST_DIR, 'assets');
    if (!fs.existsSync(assetsDir)) return { js: '', css: '' };
    const files = fs.readdirSync(assetsDir);
    const jsFile = files.find(f => f.startsWith('index-') && f.endsWith('.js')) || '';
    const cssFile = files.find(f => f.startsWith('index-') && f.endsWith('.css')) || '';
    return { js: jsFile, css: cssFile };
  } catch {
    return { js: '', css: '' };
  }
};


// Global in-memory cache for the API key to bypass read-only file systems
let cachedApiKey = '';

const getGeminiApiKey = () => {
  return new Promise((resolve) => {
    if (cachedApiKey) {
      return resolve(cachedApiKey);
    }
    
    // Attempt dynamic read from api_key.txt
    const keyFilePath = path.resolve(__dirname, 'api_key.txt');
    if (fs.existsSync(keyFilePath)) {
      try {
        const fileKey = fs.readFileSync(keyFilePath, 'utf8').trim();
        if (fileKey && fileKey.length > 5) {
          cachedApiKey = fileKey;
          return resolve(cachedApiKey);
        }
      } catch (e) {
        console.error('Failed to read api_key.txt:', e.message);
      }
    }

    // Fallback: Fetch directly from Firebase Realtime Database using REST API
    console.log('Fetching Gemini API Key from Firebase REST API...');
    const dbUrl = 'https://quran-bbede-default-rtdb.firebaseio.com/geminiApiKey.json';
    https.get(dbUrl, (apiRes) => {
      let data = '';
      apiRes.on('data', chunk => { data += chunk; });
      apiRes.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed && typeof parsed === 'string') {
            cachedApiKey = parsed.trim();
            console.log('Successfully fetched and cached Gemini API Key from Firebase REST.');
            resolve(cachedApiKey);
          } else {
            resolve('');
          }
        } catch {
          resolve('');
        }
      });
    }).on('error', (err) => {
      console.error('Failed to fetch api key from Firebase REST:', err.message);
      resolve('');
    });
  });
};


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

  // === Removed: outdated asset interception that caused infinite reload loops on iOS Safari ===

  // Version endpoint: returns current bundle hash (kept for backward compatibility)
  if (requestUrl === '/api/version' && req.method === 'GET') {
    const { js } = getActiveBundleFiles();
    const versionHash = js.replace('index-', '').replace('.js', '') || 'unknown';
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ version: versionHash }));
    return;
  }

  // Handle API Set Key (Admin saves Gemini API Key from UI)
  if (requestUrl === '/api/set-key' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { key, adminPassword } = JSON.parse(body);
        // Simple server-side password check to prevent unauthorized key changes
        if (adminPassword !== 'bonyan2025admin') {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unauthorized' }));
          return;
        }
        if (!key || key.trim().length < 10) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid key' }));
          return;
        }
        cachedApiKey = key.trim();
        // Try writing to disk but ignore errors if read-only filesystem
        try {
          const keyFilePath = path.resolve(__dirname, 'api_key.txt');
          fs.writeFileSync(keyFilePath, key.trim(), 'utf8');
        } catch (diskErr) {
          console.warn('Could not write API key to disk (possibly read-only filesystem):', diskErr.message);
        }
        console.log('Gemini API Key updated in server memory.');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // Handle API Gemini AI Proxy
  if (requestUrl.startsWith('/api/ai') && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { userPrompt, systemInstruction, imageBase64 } = JSON.parse(body);

        // Fetch key from our secure memory / Firebase REST resolver
        const keyToUse = await getGeminiApiKey();

        if (!keyToUse) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No API key configured. Please add your Gemini API key from the admin settings.' }));
          return;
        }

        console.log('Using Gemini key starting with:', keyToUse.substring(0, 8) + '...');

        const parts = [{ text: `${systemInstruction}\n\nالسياق/سؤال المستخدم:\n${userPrompt}` }];
        if (imageBase64) {
          const match = imageBase64.match(/^data:(image\/[a-zA-Z0-9.-]+);base64,(.+)$/);
          if (match) {
            parts.push({
              inline_data: { mime_type: match[1], data: match[2] }
            });
          }
        }

        const postData = JSON.stringify({ contents: [{ parts }] });
        const apiPath = `/v1beta/models/gemini-1.5-flash:generateContent?key=${keyToUse}`;

        const options = {
          hostname: 'generativelanguage.googleapis.com',
          path: apiPath,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
          }
        };

        const apiReq = https.request(options, (apiRes) => {
          let responseData = '';
          apiRes.on('data', chunk => { responseData += chunk; });
          apiRes.on('end', () => {
            try {
              const parsed = JSON.parse(responseData);
              if (apiRes.statusCode !== 200) {
                console.error('Google Gemini API Error:', apiRes.statusCode, responseData.substring(0, 300));
              }
              res.writeHead(apiRes.statusCode, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(parsed));
            } catch (parseErr) {
              console.error('Failed to parse Gemini response:', parseErr.message);
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Failed to parse Gemini response' }));
            }
          });
        });

        apiReq.on('error', (e) => {
          console.error('Gemini HTTPS request error:', e.message);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Network error reaching Gemini: ' + e.message }));
        });

        apiReq.write(postData);
        apiReq.end();

      } catch (e) {
        console.error('AI Proxy parse error:', e.message);
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
      
      // No caching for ANY file - always serve fresh content.
      // This prevents iOS Safari infinite reload loops caused by stale cached JS bundles.
      const responseHeaders = {
        'Content-Type': contentType,
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      };

      res.writeHead(200, responseHeaders);
      res.end(content);
    });
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
});
