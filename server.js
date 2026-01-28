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
const { testUnlockerAPI, testUnlockerNative, PROXY_CONFIG, UNLOCKER_CONFIG } = require('./test-brightdata-proxy');

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

// Test endpoint - accepts both GET and POST
app.all('/test', async (req, res) => {
  try {
    // Get parameters from query (GET) or body (POST)
    const url = req.query.url || req.body.url || 'https://forum.opencart.com/feed/forum/2';
    const mode = req.query.mode || req.body.mode || 'api'; // 'api' or 'native'
    
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
      isXml: false,
      hasCloudflareChallenge: false,
      logs: []
    };

    try {
      if (mode === 'api') {
        // For API mode, we need to capture the response
        const axios = require('axios');
        
        if (!UNLOCKER_CONFIG.apiKey) {
          throw new Error('BRIGHT_DATA_API_KEY not configured');
        }

        const payload = {
          zone: UNLOCKER_CONFIG.zone,
          url,
          format: 'raw'
        };

        const response = await axios.post(UNLOCKER_CONFIG.apiUrl, payload, {
          headers: {
            Authorization: `Bearer ${UNLOCKER_CONFIG.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 120_000,
          validateStatus: () => true
        });

        result.status = response.status;
        
        let body = response.data;
        if (typeof body !== 'string') {
          if (body && typeof body === 'object') {
            if (body.body) body = body.body;
            else if (body.data) body = body.data;
            else if (body.content) body = body.content;
            else body = JSON.stringify(body);
          }
        }
        if (typeof body !== 'string') body = String(body ?? '');

        result.contentLength = body.length;
        result.contentPreview = body.substring(0, 500);
        result.success = response.status >= 200 && response.status < 300;

        const lower = body.toLowerCase();
        result.isXml = lower.startsWith('<?xml') || lower.startsWith('<feed') || lower.startsWith('<rss');
        result.hasCloudflareChallenge = lower.includes('cloudflare') || 
                                       lower.includes('just a moment') || 
                                       lower.includes('cf-browser-verification');

      } else if (mode === 'native') {
        // For native mode, use axios with proxy
        const axios = require('axios');
        const { HttpsProxyAgent } = require('https-proxy-agent');

        const proxyUrl = PROXY_CONFIG.proxyUrl;
        const httpsAgent = new HttpsProxyAgent(proxyUrl);

        const originalReject = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

        const response = await axios.get(url, {
          httpsAgent,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'Accept-Language': 'en-US,en;q=0.9'
          },
          timeout: 120_000,
          validateStatus: () => true,
          maxRedirects: 5
        });

        if (originalReject !== undefined) {
          process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalReject;
        } else {
          delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
        }

        result.status = response.status;
        
        let body = response.data;
        if (typeof body !== 'string') {
          body = JSON.stringify(body);
        }

        result.contentLength = body.length;
        result.contentPreview = body.substring(0, 500);
        result.success = response.status >= 200 && response.status < 300;

        const lower = body.toLowerCase();
        result.isXml = lower.startsWith('<?xml') || lower.startsWith('<feed') || lower.startsWith('<rss');
        result.hasCloudflareChallenge = lower.includes('cloudflare') || 
                                       lower.includes('just a moment') || 
                                       lower.includes('cf-browser-verification');
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
      'GET /test': 'Test Unlocker (query params: url, mode)',
      'POST /test': 'Test Unlocker (body: { url, mode })'
    },
    examples: {
      'GET /test?url=https://forum.opencart.com/feed/forum/2&mode=api': 'Test with Unlocker API',
      'GET /test?url=https://forum.opencart.com/feed/forum/2&mode=native': 'Test with native proxy',
      'POST /test': {
        url: 'https://forum.opencart.com/feed/forum/2',
        mode: 'api'
      }
    },
    modes: {
      api: 'Use Bright Data Unlocker REST API',
      native: 'Use native proxy with Unlocker zone (axios + HttpsProxyAgent)'
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
