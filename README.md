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

### Unlocker API (REST, recommended)

```bash
# Default mode (uses API)
node test-brightdata-proxy.js https://forum.opencart.com/feed/forum/2

# Explicit API mode
node test-brightdata-proxy.js --unlocker-api https://forum.opencart.com/feed/forum/2

# Or use npm script
npm run test:api https://forum.opencart.com/feed/forum/2
```

### Native Proxy Access

```bash
# Native proxy with Unlocker zone
node test-brightdata-proxy.js --unlocker-native https://forum.opencart.com/feed/forum/2

# Or use npm script
npm run test:native https://forum.opencart.com/feed/forum/2
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

## References

- [Bright Data Unlocker API Docs](https://docs.brightdata.com/api-reference/rest-api/unlocker/unlock-website)
- [Bright Data Dashboard](https://brightdata.com/cp/zones)

## License

MIT
