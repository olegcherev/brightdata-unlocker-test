#!/usr/bin/env node

/**
 * Express web server for Bright Data Unlocker testing
 * 
 * Endpoints:
 *   GET  /health - Health check
 *   POST /test   - Test Unlocker API or native proxy
 *   GET  /test   - Test with query parameters
 */

const express = require('express');
const { PROXY_CONFIG, UNLOCKER_CONFIG } = require('./test-brightdata-proxy');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS headers
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'brightdata-unlocker-test',
    timestamp: new Date().toISOString(),
    config: {
      apiKeyConfigured: !!UNLOCKER_CONFIG.apiKey,
      zone: UNLOCKER_CONFIG.zone,
      proxyUsername: PROXY_CONFIG.username ? PROXY_CONFIG.username.substring(0, 30) + '...' : 'not configured'
    }
  });
});

// Max content size to return (5MB) - configurable via env
const MAX_FULL_CONTENT_SIZE = parseInt(process.env.MAX_CONTENT_SIZE || '5242880', 10);

// Helper to fetch content from URL
async function fetchContent(url, mode) {
  const axios = require('axios');
  
  if (mode === 'api') {
    if (!UNLOCKER_CONFIG.apiKey) {
      throw new Error('BRIGHT_DATA_API_KEY not configured');
    }
    const response = await axios.post(UNLOCKER_CONFIG.apiUrl, {
      zone: UNLOCKER_CONFIG.zone,
      url,
      format: 'raw'
    }, {
      headers: {
        Authorization: `Bearer ${UNLOCKER_CONFIG.apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 120_000,
      validateStatus: () => true,
      responseType: 'text'
    });
    
    let body = response.data;
    if (typeof body !== 'string') {
      if (body && typeof body === 'object') {
        if (body.body) body = body.body;
        else if (body.data) body = body.data;
        else if (body.content) body = body.content;
        else body = JSON.stringify(body);
      }
    }
    return { content: String(body ?? ''), status: response.status };
  } else {
    const { HttpsProxyAgent } = require('https-proxy-agent');
    const proxyUrl = PROXY_CONFIG.proxyUrl;
    const httpsAgent = new HttpsProxyAgent(proxyUrl);
    const originalReject = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    
    const response = await axios.get(url, {
      httpsAgent,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      timeout: 120_000,
      validateStatus: () => true,
      responseType: 'text',
      maxRedirects: 5
    });
    
    if (originalReject !== undefined) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalReject;
    } else {
      delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    }
    
    let body = response.data;
    if (typeof body !== 'string') body = JSON.stringify(body);
    return { content: body, status: response.status };
  }
}

// Fetch endpoint - returns raw full content (for XML feeds, HTML, etc.)
app.all('/fetch', async (req, res) => {
  try {
    const url = req.query.url || req.body?.url;
    const mode = req.query.mode || req.body?.mode || 'api';
    
    if (!url) {
      return res.status(400).json({
        error: 'Missing url parameter',
        usage: 'GET /fetch?url=https://example.com&mode=api'
      });
    }
    
    try {
      new URL(url);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid URL', provided: url });
    }
    
    if (mode !== 'api' && mode !== 'native') {
      return res.status(400).json({ error: 'Invalid mode', allowed: ['api', 'native'] });
    }
    
    const { content, status } = await fetchContent(url, mode);
    
    if (status >= 400) {
      return res.status(status).send(content);
    }
    
    if (content.length > MAX_FULL_CONTENT_SIZE) {
      return res.status(413).json({
        error: 'Content too large',
        contentLength: content.length,
        maxAllowed: MAX_FULL_CONTENT_SIZE,
        message: `Content exceeds ${MAX_FULL_CONTENT_SIZE} bytes. Use /test?full=true for JSON with truncated content.`
      });
    }
    
    // Detect content type for proper response
    const lower = content.toLowerCase().trim();
    if (lower.startsWith('<?xml') || lower.startsWith('<feed') || lower.startsWith('<rss')) {
      res.set('Content-Type', 'application/xml; charset=utf-8');
    } else if (lower.startsWith('<!doctype') || lower.startsWith('<html')) {
      res.set('Content-Type', 'text/html; charset=utf-8');
    } else if (lower.startsWith('{') || lower.startsWith('[')) {
      res.set('Content-Type', 'application/json; charset=utf-8');
    } else {
      res.set('Content-Type', 'text/plain; charset=utf-8');
    }
    
    res.set('X-Content-Length', String(content.length));
    res.set('X-Source-URL', url);
    res.status(200).send(content);
    
  } catch (error) {
    res.status(500).json({
      error: 'Fetch failed',
      message: error.message
    });
  }
});

// Test endpoint - accepts both GET and POST
app.all('/test', async (req, res) => {
  try {
    // Get parameters from query (GET) or body (POST)
    const url = req.query.url || req.body.url || 'https://forum.opencart.com/feed/forum/2';
    const mode = req.query.mode || req.body.mode || 'api'; // 'api' or 'native'
    const fullContent = req.query.full === 'true' || req.query.full === '1' || req.body.full === true || req.body.full === 'true';
    
    if (!url) {
      return res.status(400).json({
        error: 'Missing URL parameter',
        usage: {
          get: '/test?url=https://example.com&mode=api',
          post: { url: 'https://example.com', mode: 'api' }
        }
      });
    }

    // Validate URL
    try {
      new URL(url);
    } catch (e) {
      return res.status(400).json({
        error: 'Invalid URL',
        provided: url
      });
    }

    // Validate mode
    if (mode !== 'api' && mode !== 'native') {
      return res.status(400).json({
        error: 'Invalid mode',
        provided: mode,
        allowed: ['api', 'native']
      });
    }

    // Capture console output
    const logs = [];
    const originalLog = console.log;
    const originalError = console.error;
    
    console.log = (...args) => {
      logs.push({ type: 'log', message: args.join(' ') });
      originalLog(...args);
    };
    
    console.error = (...args) => {
      logs.push({ type: 'error', message: args.join(' ') });
      originalError(...args);
    };

    // Run the test
    let result = {
      success: false,
      status: null,
      contentLength: 0,
      contentPreview: '',
      content: null, // full content when full=true
      isXml: false,
      hasCloudflareChallenge: false,
      logs: []
    };

    try {
      const { content, status } = await fetchContent(url, mode);
      const body = content;

      result.status = status;
      result.contentLength = body.length;
      result.contentPreview = body.substring(0, 500);
      result.success = status >= 200 && status < 300;

      const lower = body.toLowerCase();
      result.isXml = lower.startsWith('<?xml') || lower.startsWith('<feed') || lower.startsWith('<rss');
      result.hasCloudflareChallenge = lower.includes('cloudflare') || 
                                     lower.includes('just a moment') || 
                                     lower.includes('cf-browser-verification');

      // Include full content when requested (with size limit)
      if (fullContent) {
        if (body.length <= MAX_FULL_CONTENT_SIZE) {
          result.content = body;
        } else {
          result.contentTruncated = true;
          result.content = body.substring(0, MAX_FULL_CONTENT_SIZE);
          result.maxContentSize = MAX_FULL_CONTENT_SIZE;
          result.message = `Content truncated at ${MAX_FULL_CONTENT_SIZE} bytes. Use /fetch for raw content (up to ${MAX_FULL_CONTENT_SIZE} bytes).`;
        }
      }

    } catch (error) {
      result.error = error.message;
      if (error.response) {
        result.status = error.response.status;
        let data = error.response.data;
        if (typeof data !== 'string') data = JSON.stringify(data);
        result.errorResponse = data.substring(0, 500);
      }
    } finally {
      // Restore console
      console.log = originalLog;
      console.error = originalError;
      result.logs = logs;
    }

    // Return result
    const statusCode = result.success ? 200 : (result.status || 500);
    res.status(statusCode).json({
      mode,
      url,
      ...result
    });

  } catch (error) {
    res.status(500).json({
      error: 'Internal server error',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Root endpoint - show API documentation
app.get('/', (req, res) => {
  res.json({
    service: 'Bright Data Unlocker Test API',
    version: '1.0.0',
    endpoints: {
      'GET /health': 'Health check endpoint',
      'GET /test': 'Test Unlocker (query: url, mode, full)',
      'POST /test': 'Test Unlocker (body: { url, mode, full })',
      'GET /fetch': 'Fetch full raw content (query: url, mode)',
      'POST /fetch': 'Fetch full raw content (body: { url, mode })'
    },
    fullContent: {
      '/test?full=true': 'Include full content in JSON response (max 5MB)',
      '/fetch': 'Return raw content directly (XML, HTML, etc.) - max 5MB'
    },
    examples: {
      'GET /test?url=https://forum.opencart.com/feed/forum/2&mode=api': 'Test with preview',
      'GET /test?url=...&mode=api&full=true': 'Test with full content in JSON',
      'GET /fetch?url=https://forum.opencart.com/feed/forum/2&mode=api': 'Get full XML/HTML raw'
    },
    modes: {
      api: 'Use Bright Data Unlocker REST API',
      native: 'Use native proxy with Unlocker zone'
    }
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Bright Data Unlocker Test API running on port ${PORT}`);
  console.log(`📡 Health check: http://localhost:${PORT}/health`);
  console.log(`🧪 Test endpoint: http://localhost:${PORT}/test`);
});

module.exports = app;
