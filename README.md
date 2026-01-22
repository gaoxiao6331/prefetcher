# Prefetcher

A resource prefetching service built with Fastify and TypeScript. Captures JavaScript resources from web pages, uploads them to CDN, and optionally sends notifications.

## 🎯 Purpose

This service helps optimize web application performance by:

1. Analyzing web pages using Puppeteer to capture loaded JavaScript resources
2. Generating resource lists sorted by size
3. Uploading resource lists to jsDelivr CDN via GitHub
4. Sending deployment notifications via Lark webhooks (optional)

Use cases:
- Generate prefetch/preload hints for web applications
- Automate CDN deployment workflows
- Track resource loading patterns

## ✨ Features

- Full TypeScript support with Zod schema validation
- Concurrent page processing with rate limiting
- Request tracing with unique trace IDs
- Prometheus metrics endpoint
- Lark webhook notifications with retry logic
- Debug mode for development

## 🚀 Quick Start

### Prerequisites

- Node.js >= 18
- pnpm or npm
- Git with SSH access to GitHub
- Lark webhook tokens (optional, for notifications)

### Installation

```bash
git clone <your-repo-url>
cd prefetcher
pnpm install
pnpm build
```

### Configuration

Set environment variables as needed:

```bash
# Optional: specify Chrome/Chromium path (uses bundled Chromium by default)
export PUPPETEER_EXECUTABLE_PATH=/path/to/chrome

# Optional: for notifications
export LARK_BOT_TOKENS=token1,token2,token3
```

Configure CDN settings in `src/config/file/dev.ts` or `src/config/file/prod.ts`:

```typescript
{
  port: 3000,
  cdn: {
    jsDelivr: {
      localPath: "/path/to/local/repo",
      remoteAddr: "git@github.com:user/repo.git",
      git: {
        name: "Your Name",
        email: "your.email@example.com"
      }
    }
  }
}
```

### Running

```bash
# Development mode with auto-reload
pnpm dev

# Debug mode (visible browser)
pnpm dev:debug

# Production mode
pnpm run
```

Server runs on `http://localhost:3000` by default.

## 📖 Usage

### API Endpoint

**POST** `/res_gen`

Captures resources from a URL and deploys to CDN.

#### Request

```json
{
  "targetUrl": "https://example.com",
  "projectName": "my-project",
  "targetFileName": "prefetch-list.json",
  "template": "window.__PREFETCH_RESOURCES__ = __content_placeholder__;",
  "notifications": ["lark-webhook-token-1"]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `targetUrl` | string | Yes | URL to analyze |
| `projectName` | string | Yes | GitHub branch name |
| `targetFileName` | string | Yes | Output filename |
| `template` | string | No | Template with `__content_placeholder__` |
| `notifications` | string[] | No | Lark webhook tokens |

#### Response

```json
{
  "url": "https://cdn.jsdelivr.net/gh/namespace/repo@branch/prefetch-list.json"
}
```

### Example

```bash
curl -X POST http://localhost:3000/res_gen \
  -H "Content-Type: application/json" \
  -d '{
    "targetUrl": "https://example.com",
    "projectName": "production",
    "targetFileName": "resources.json"
  }'
```

## 🏗️ Project Structure

```
src/
├── modules/
│   ├── resource-generator/    # Captures resources using Puppeteer
│   ├── cdn-updater/           # Manages GitHub + jsDelivr deployment
│   └── notifier/              # Sends Lark notifications
├── plugins/
│   ├── config.ts             # Configuration management
│   ├── logger.ts             # Logging setup
│   ├── monitor.ts            # Prometheus metrics
│   └── alert.ts              # Error alerting
├── utils/                    # Utility functions
├── config/file/              # Environment configs
├── index.ts                  # CLI entry
└── start.ts                  # Server bootstrap
```

### Key Components

**Resource Generator** (`src/modules/resource-generator/`)
- Uses Puppeteer to intercept network requests
- Tracks resource size and load time
- Filters and sorts resources by size

**CDN Updater** (`src/modules/cdn-updater/`)
- Manages git operations (clone, commit, push)
- Purges jsDelivr cache after updates
- Verifies content deployment

**Notifier** (`src/modules/notifier/`)
- Sends messages to Lark webhooks
- Retries failed requests with backoff
- Supports multiple webhook tokens

## 🧪 Testing

```bash
# Run all tests
pnpm test

# Run specific test
pnpm test -- path/to/test.ts
```

The project has 100% test coverage.

## 📊 Monitoring

Prometheus metrics are available at `/metrics`:
- Request duration
- Request count by status
- Active requests

## 🐛 Debug Mode

```bash
pnpm dev:debug
```

Debug mode shows the browser window and enables verbose logging.

## License

ISC
