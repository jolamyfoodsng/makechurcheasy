# MakeChurchEasy Analytics Worker

Self-hosted analytics endpoint using Cloudflare Workers + KV.

## Setup

```bash
# Install wrangler CLI
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Create KV namespace
wrangler kv namespace create ANALYTICS

# Copy the KV namespace ID into wrangler.toml:
# [[kv_namespaces]]
# binding = "ANALYTICS"
# id = "paste-id-here"

# Set the analytics token (shared secret)
wrangler secret put ANALYTICS_TOKEN
# Paste a random token, e.g.: openssl rand -hex 32

# Deploy
wrangler deploy
```

## Configure the app

Add to your `.env`:

```
VITE_ANALYTICS_ENDPOINT=https://mce-analytics.YOUR_SUBDOMAIN.workers.dev
VITE_ANALYTICS_TOKEN=the-same-token-you-set-above
```

## Dashboard

Visit `https://mce-analytics.YOUR_SUBDOMAIN.workers.dev/` to see:
- Events today
- Unique installs today
- Platform breakdown (Windows/macOS/Linux)
- Feature usage (Bible, Worship, Media, Voice)
- Version distribution

## API

### POST /e — Send event

```bash
curl -X POST https://your-worker.workers.dev/e \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"event":"app_started","properties":{"platform":"macos","app_version":"4.20.0"}}'
```

### GET / — Dashboard

Returns an HTML analytics dashboard.

### GET /health

Returns `ok` if the worker is running.
