/**
 * Shree GuruKrupa — Content Gem Server
 * Works both locally (reads from this file) AND on Render.com (reads from env variable)
 */

const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const url   = require('url');

// Reads from Render environment variable when hosted online,
// OR falls back to the value below when running locally
const GROQ_API_KEY = process.env.GROQ_API_KEY || 'YOUR_GROQ_KEY_HERE';

const PORT = process.env.PORT || 3000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.ico':  'image/x-icon',
};

function corsHeaders() {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function handleGenerate(req, res) {
  let rawBody = '';
  req.on('data', chunk => rawBody += chunk.toString());
  req.on('end', () => {

    if (!GROQ_API_KEY || GROQ_API_KEY === 'ur key goes here') {
      res.writeHead(500, corsHeaders());
      res.end(JSON.stringify({
        error: { message: 'API key missing! Add your free Groq key from console.groq.com' }
      }));
      return;
    }

    let incoming;
    try { incoming = JSON.parse(rawBody); }
    catch(e) {
      res.writeHead(400, corsHeaders());
      res.end(JSON.stringify({ error: { message: 'Bad JSON in request' } }));
      return;
    }

    const hasImage = (incoming.messages || []).some(m =>
      Array.isArray(m.content) && m.content.some(c => c.type === 'image')
    );

    const messages = [];
    if (incoming.system) messages.push({ role: 'system', content: incoming.system });

    for (const msg of (incoming.messages || [])) {
      if (typeof msg.content === 'string') {
        messages.push({ role: msg.role, content: msg.content });
      } else if (Array.isArray(msg.content)) {
        const parts = msg.content.map(block => {
          if (block.type === 'text') return { type: 'text', text: block.text };
          if (block.type === 'image' && block.source) {
            return { type: 'image_url', image_url: { url: `data:${block.source.media_type};base64,${block.source.data}` } };
          }
          return null;
        }).filter(Boolean);
        messages.push({ role: msg.role, content: parts });
      }
    }

    const model = hasImage ? 'meta-llama/llama-4-scout-17b-16e-instruct' : 'llama-3.3-70b-versatile';
    const groqPayload = JSON.stringify({ model, messages, max_tokens: incoming.max_tokens || 1000, temperature: 0.8 });

    const options = {
      hostname: 'api.groq.com',
      path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Length': Buffer.byteLength(groqPayload),
      },
    };

    const apiReq = https.request(options, apiRes => {
      let data = '';
      apiRes.on('data', chunk => data += chunk.toString());
      apiRes.on('end', () => {
        try {
          const groqResp = JSON.parse(data);
          if (groqResp.error) {
            res.writeHead(400, corsHeaders());
            res.end(JSON.stringify({ error: { message: groqResp.error.message || 'Groq API error' } }));
            return;
          }
          const text = groqResp.choices?.[0]?.message?.content || '';
          res.writeHead(200, corsHeaders());
          res.end(JSON.stringify({ content: [{ type: 'text', text }] }));
        } catch(e) {
          res.writeHead(500, corsHeaders());
          res.end(JSON.stringify({ error: { message: 'Parse error: ' + e.message } }));
        }
      });
    });

    apiReq.on('error', err => {
      res.writeHead(502, corsHeaders());
      res.end(JSON.stringify({ error: { message: 'Network error: ' + err.message } }));
    });

    apiReq.write(groqPayload);
    apiReq.end();
  });
}

function serveStatic(filePath, res) {
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'text/plain' });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST,GET,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
    res.end(); return;
  }

  if (req.method === 'POST' && parsed.pathname === '/api/generate') { handleGenerate(req, res); return; }
  if (parsed.pathname === '/' || parsed.pathname === '/index.html') { serveStatic(path.join(__dirname, 'index.html'), res); return; }
  serveStatic(path.join(__dirname, parsed.pathname), res);
});

server.listen(PORT, () => {
  console.log(`\n  ✦ Shree GuruKrupa Content Gem running on port ${PORT}\n`);
  if (!GROQ_API_KEY || GROQ_API_KEY === 'YOUR_GROQ_KEY_HERE') {
    console.log('  ⚠️  API KEY MISSING — get free key at console.groq.com\n');
  } else {
    console.log('  ✅  Groq API key loaded — ready!\n');
  }
});
