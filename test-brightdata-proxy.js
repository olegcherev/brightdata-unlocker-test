#!/usr/bin/env node

/**
 * Node.js script to test Bright Data Unlocker in two ways:
 *
 * 1) Unlocker REST API (recommended for Cloudflare-protected sites)
 * 2) Native proxy-based access with Unlocker zone (axios + HttpsProxyAgent)
 *
 * Usage:
 *   node test-brightdata-proxy.js [options] [url]
 *
 * Options:
 *   --unlocker-api     Use Bright Data Unlocker REST API  (alias: --unlocker)
 *   --unlocker-native  Use native proxy with Unlocker     (alias: --unlocker-axios)
 *   --help             Show help message
 *
 * Examples:
 *   # Unlocker API (REST, no browser)
 *   node test-brightdata-proxy.js --unlocker-api https://forum.opencart.com/feed/forum/2
 *
 *   # Native proxy-based access with Unlocker (axios + HttpsProxyAgent)
 *   node test-brightdata-proxy.js --unlocker-native https://forum.opencart.com/feed/forum/2
 *
 * Native Unlocker proxy (curl example):
 *   curl -i --proxy brd.superproxy.io:33335 \
 *     --proxy-user brd-customer-hl_7342b85c-zone-web_unlocker1:gp2p3zbiz07q -k \
 *     "https://forum.opencart.com/feed/forum/2"
 */

const { HttpsProxyAgent } = require('https-proxy-agent');

// Bright Data Unlocker proxy configuration (native proxy-based access)
const PROXY_CONFIG = {
  host: 'brd.superproxy.io',
  port: '33335',
  username: process.env.BRIGHT_DATA_UNLOCKER_PROXY_USERNAME || 'brd-customer-hl_7342b85c-zone-web_unlocker1',
  password: process.env.BRIGHT_DATA_UNLOCKER_PROXY_PASSWORD || 'gp2p3zbiz07q',
  get proxyUrl() {
    return `http://${this.username}:${this.password}@${this.host}:${this.port}`;
  }
};

// Bright Data Unlocker API configuration (REST API)
// Reference: https://docs.brightdata.com/api-reference/rest-api/unlocker/unlock-website
const UNLOCKER_CONFIG = {
  apiKey: process.env.BRIGHT_DATA_API_KEY || '781e97861dbed1034b628ec08983e7d4e6efcba23757b895cb76d38066221549',
  zone: process.env.BRIGHT_DATA_UNLOCKER_ZONE || 'web_unlocker1',
  apiUrl: 'https://api.brightdata.com/request'
};

// Parse CLI args
const flagNames = [
  '--unlocker',
  '--unlocker-api',
  '--unlocker-native',
  '--unlocker-axios',
  '--help'
];
const urlArg = process.argv.slice(2).find(arg => !flagNames.includes(arg) && !arg.startsWith('--'));
const targetUrl = urlArg || 'https://forum.opencart.com/feed/forum/2';

if (process.argv.includes('--help')) {
  console.log(`
Usage: node test-brightdata-proxy.js [options] [url]

Options:
  --unlocker-api     Use Bright Data Unlocker REST API  (alias: --unlocker)
  --unlocker-native  Use native proxy with Unlocker     (alias: --unlocker-axios)
  --help             Show this help message

Examples:
  # Unlocker API (REST, no browser)
  node test-brightdata-proxy.js --unlocker-api https://forum.opencart.com/feed/forum/2

  # Native proxy-based access with Unlocker (axios + HttpsProxyAgent)
  node test-brightdata-proxy.js --unlocker-native https://forum.opencart.com/feed/forum/2
`);
  process.exit(0);
}

// --- Native proxy-based Unlocker (axios + HttpsProxyAgent) ---

async function testUnlockerNative(url) {
  const axios = require('axios');

  console.log('🚀 Testing Unlocker native proxy (axios + HttpsProxyAgent)...');
  console.log(`📡 Proxy: ${PROXY_CONFIG.host}:${PROXY_CONFIG.port}`);
  console.log(`👤 Zone (from username): ${PROXY_CONFIG.username}`);
  console.log(`🌐 Target URL: ${url}`);
  console.log('');

  const proxyUrl = PROXY_CONFIG.proxyUrl;
  const httpsAgent = new HttpsProxyAgent(proxyUrl);

  // Allow self-signed / MITM certs on the proxy connection if needed
  const originalReject = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

  try {
    const response = await axios.get(url, {
      httpsAgent,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept':
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      timeout: 120_000,
      validateStatus: () => true,
      maxRedirects: 5
    });

    // restore TLS setting
    if (originalReject !== undefined) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalReject;
    } else {
      delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    }

    console.log(`✅ HTTP Status: ${response.status}`);

    let body = response.data;
    if (typeof body !== 'string') {
      body = JSON.stringify(body);
    }

    console.log(`📊 Content length: ${body.length} chars`);

    const preview = body.substring(0, 500);
    console.log('📝 Content preview (first 500 chars):');
    console.log(preview);

    // Simple XML/feed detection
    const lower = body.toLowerCase();
    if (
      lower.startsWith('<?xml') ||
      lower.startsWith('<feed') ||
      lower.startsWith('<rss')
    ) {
      console.log('✅ Looks like XML/RSS feed via native Unlocker proxy.');
    } else if (
      lower.includes('cloudflare') ||
      lower.includes('just a moment') ||
      lower.includes('cf-browser-verification')
    ) {
      console.log('⚠️ Cloudflare challenge still present in native proxy response.');
    }
  } catch (error) {
    console.error('❌ Native Unlocker proxy error:', error.message);
    if (error.response) {
      let data = error.response.data;
      if (typeof data !== 'string') data = JSON.stringify(data);
      console.error(`Status: ${error.response.status}`);
      console.error('Response preview:', data.substring(0, 500));
    }
  }
}

// --- Unlocker REST API ---

async function testUnlockerAPI(url) {
  const axios = require('axios');

  if (!UNLOCKER_CONFIG.apiKey) {
    console.error('❌ BRIGHT_DATA_API_KEY not configured.');
    console.error('   Set it via environment variable: BRIGHT_DATA_API_KEY=your_key');
    return;
  }

  console.log('🚀 Testing Bright Data Unlocker API (REST)...');
  console.log(`🔑 Zone: ${UNLOCKER_CONFIG.zone}`);
  console.log(`🌐 Target URL: ${url}`);
  console.log(`🔐 API key prefix: ${UNLOCKER_CONFIG.apiKey.substring(0, 8)}...`);
  console.log('');

  try {
    const payload = {
      zone: UNLOCKER_CONFIG.zone,
      url,
      // For feeds/HTML we want raw content
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

    console.log(`✅ HTTP Status: ${response.status}`);

    let body = response.data;
    if (typeof body !== 'string') {
      // If Unlocker wraps content in JSON, unwrap common fields
      if (body && typeof body === 'object') {
        if (body.body) body = body.body;
        else if (body.data) body = body.data;
        else if (body.content) body = body.content;
        else body = JSON.stringify(body);
      }
    }

    if (typeof body !== 'string') body = String(body ?? '');

    console.log(`📊 Content length: ${body.length} chars`);
    console.log('📝 Content preview (first 500 chars):');
    console.log(body.substring(0, 500));

    const lower = body.toLowerCase();
    if (
      lower.startsWith('<?xml') ||
      lower.startsWith('<feed') ||
      lower.startsWith('<rss')
    ) {
      console.log('✅ Looks like XML/RSS feed via Unlocker API.');
    } else if (
      lower.includes('cloudflare') ||
      lower.includes('just a moment') ||
      lower.includes('cf-browser-verification')
    ) {
      console.log('⚠️ Cloudflare challenge text detected in Unlocker API response.');
    }
  } catch (error) {
    console.error('❌ Unlocker API error:', error.message);
    if (error.response) {
      let data = error.response.data;
      if (typeof data !== 'string') data = JSON.stringify(data);
      console.error(`Status: ${error.response.status}`);
      console.error('Response preview:', data.substring(0, 500));
    }
  }
}

// --- Main ---

async function main() {
  const useApi =
    process.argv.includes('--unlocker-api') || process.argv.includes('--unlocker');
  const useNative =
    process.argv.includes('--unlocker-native') ||
    process.argv.includes('--unlocker-axios');

  // Default: Unlocker API
  if (!useApi && !useNative) {
    await testUnlockerAPI(targetUrl);
    return;
  }

  if (useApi) {
    await testUnlockerAPI(targetUrl);
  } else if (useNative) {
    await testUnlockerNative(targetUrl);
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('❌ Unhandled error:', err);
    process.exit(1);
  });
}

module.exports = {
  testUnlockerAPI,
  testUnlockerNative,
  PROXY_CONFIG,
  UNLOCKER_CONFIG
};
