# Bright Data Unlocker Test

Test script for Bright Data Unlocker in two modes:
1. **Unlocker REST API** - Recommended for Cloudflare-protected sites
2. **Native proxy-based access** - Using Unlocker zone with axios + HttpsProxyAgent

## Installation

```bash
npm install
```

## Configuration

Set environment variables (or use defaults in the script):

```bash
# For Unlocker API
export BRIGHT_DATA_API_KEY="your_api_key"
export BRIGHT_DATA_UNLOCKER_ZONE="web_unlocker1"

# For native proxy access
export BRIGHT_DATA_UNLOCKER_PROXY_USERNAME="brd-customer-ACCOUNT_ID-zone-ZONE_NAME"
export BRIGHT_DATA_UNLOCKER_PROXY_PASSWORD="your_password"
```

## Usage

### CLI Mode

#### Unlocker API (REST, recommended)

```bash
# Default mode (uses API)
node test-brightdata-proxy.js https://forum.opencart.com/feed/forum/2

# Explicit API mode
node test-brightdata-proxy.js --unlocker-api https://forum.opencart.com/feed/forum/2

# Or use npm script
npm run test:api https://forum.opencart.com/feed/forum/2
```

#### Native Proxy Access

```bash
# Native proxy with Unlocker zone
node test-brightdata-proxy.js --unlocker-native https://forum.opencart.com/feed/forum/2

# Or use npm script
npm run test:native https://forum.opencart.com/feed/forum/2
```

### Web Service Mode (for Render.com)

Start the server:

```bash
npm start
```

The server will run on port 3000 (or PORT environment variable).

#### API Endpoints

**Health Check:**
```bash
GET /health
```

**Test Endpoint (GET):**
```bash
GET /test?url=https://forum.opencart.com/feed/forum/2&mode=api
GET /test?url=https://forum.opencart.com/feed/forum/2&mode=native
```

**Test Endpoint (POST):**
```bash
POST /test
Content-Type: application/json

{
  "url": "https://forum.opencart.com/feed/forum/2",
  "mode": "api"
}
```

#### Example Requests

**Using curl:**
```bash
# Health check
curl https://your-render-url.onrender.com/health

# Test with API mode
curl "https://your-render-url.onrender.com/test?url=https://forum.opencart.com/feed/forum/2&mode=api"

# Test with native proxy mode
curl "https://your-render-url.onrender.com/test?url=https://forum.opencart.com/feed/forum/2&mode=native"

# POST request
curl -X POST https://your-render-url.onrender.com/test \
  -H "Content-Type: application/json" \
  -d '{"url": "https://forum.opencart.com/feed/forum/2", "mode": "api"}'
```

**Using browser:**
```
https://your-render-url.onrender.com/test?url=https://forum.opencart.com/feed/forum/2&mode=api
```

## Response Format

```json
{
  "mode": "api",
  "url": "https://forum.opencart.com/feed/forum/2",
  "success": true,
  "status": 200,
  "contentLength": 12345,
  "contentPreview": "<?xml version=\"1.0\"...",
  "isXml": true,
  "hasCloudflareChallenge": false,
  "logs": [...]
}
```

## Options

- `--unlocker-api` or `--unlocker` - Use Bright Data Unlocker REST API
- `--unlocker-native` or `--unlocker-axios` - Use native proxy with Unlocker zone
- `--help` - Show help message

## Examples

### Test with Unlocker API

```bash
node test-brightdata-proxy.js --unlocker-api https://forum.opencart.com/feed/forum/2
```

### Test with Native Proxy

```bash
node test-brightdata-proxy.js --unlocker-native https://forum.opencart.com/feed/forum/2
```

### Using curl (native proxy)

```bash
curl -i --proxy brd.superproxy.io:33335 \
  --proxy-user brd-customer-hl_7342b85c-zone-web_unlocker1:gp2p3zbiz07q -k \
  "https://forum.opencart.com/feed/forum/2"
```

## Deployment to Render.com

1. Connect your GitHub repository to Render
2. Set environment variables in Render dashboard:
   - `BRIGHT_DATA_API_KEY`
   - `BRIGHT_DATA_UNLOCKER_ZONE` (optional, defaults to `web_unlocker1`)
   - `BRIGHT_DATA_UNLOCKER_PROXY_USERNAME` (for native mode)
   - `BRIGHT_DATA_UNLOCKER_PROXY_PASSWORD` (for native mode)
3. Render will automatically detect `package.json` and run `npm start`
4. Your service will be available at `https://your-service.onrender.com`

## References

- [Bright Data Unlocker API Docs](https://docs.brightdata.com/api-reference/rest-api/unlocker/unlock-website)
- [Bright Data Dashboard](https://brightdata.com/cp/zones)

## License

MIT
