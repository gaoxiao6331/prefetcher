# Prefetcher

[中文](./docs/README_zh.md) | English

A resource prefetching service built with Fastify and TypeScript. Captures web page resources to generate core resource lists, uploads them to CDN for other sites to use with Prefetch, and optionally sends notifications.

## 🎯 Purpose

This service helps optimize web application performance by:

1. Analyzing web pages using Puppeteer to capture loaded resources
2. Generating core resource lists based on strategies
3. Uploading resource lists to jsDelivr CDN via GitHub
4. Sending deployment notifications via Lark webhooks (optional)

**Use Cases:**
- Generate prefetch/preload resource lists for web applications
- Automate CDN deployment workflows

## ✨ Features

- Full TypeScript support with Zod schema validation
- Concurrent page processing with rate limiting
- Request tracing with unique trace IDs
- Prometheus metrics endpoint
- Lark webhook notifications with retry logic
- Debug mode for development

## 🚀 Quick Start

### Prerequisites

- Node.js >= 20
- pnpm
- Git with SSH access
- Lark webhook tokens (optional, for notifications)

### Installation

```bash
git clone https://github.com/gaoxiao6331/prefetcher.git
cd prefetcher
pnpm install
pnpm build
```

### Configuration

#### Environment Variables

```bash
# Specify Chrome/Chromium path
export PUPPETEER_EXECUTABLE_PATH=/path/to/chrome

# Lark webhook tokens for notifications (optional)
export LARK_BOT_TOKENS=token1,token2,token3
```

#### CDN Configuration

Configure CDN settings in `src/config/file/dev.ts`:

```typescript
{
  port: 3000,
  cdn: {
    jsDelivr: {
      // Local repository path, service will clone remote repo to this path
      localPath: "/path/to/local/repo",
      
      // Repository address for uploading resource lists, ensure using SSH address to avoid login
      remoteAddr: "git@github.com:user/repo.git",
      
      // Git commit name and email
      git: {
        name: "Your Name",
        email: "your.email@example.com"
      }
    }
  }
}
```

> **⚠️ Note:** Configuration files are loaded based on the `NODE_ENV` environment variable. For example, to configure production, create `prod.ts` and set `NODE_ENV` to `prod`. See `src/plugins/config.ts` for details.

### Running

```bash
# Development mode (auto-reload)
pnpm dev

# Debug mode (visible browser)
pnpm dev:debug

# Build production code
pnpm build

# Start service
pnpm start
```

Server runs on `http://localhost:3000` by default.

## 📖 Usage

### API Endpoint

**POST** `/res_gen`

Captures resources from a URL and deploys to CDN.

#### Request Parameters

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
| `targetUrl` | string | Yes | Target URL to analyze |
| `projectName` | string | Yes | GitHub branch name |
| `targetFileName` | string | Yes | Output filename |
| `template` | string | No | Template string with `__content_placeholder__` |
| `notifications` | string[] | No | Array of Lark webhook tokens |

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
- Filters and sorts core resources

**CDN Updater** (`src/modules/cdn-updater/`)
- Manages Git operations (clone, commit, push)
- Purges jsDelivr cache after updates
- Verifies content deployment

**Notifier** (`src/modules/notifier/`)
- Sends messages to Lark webhooks
- Retries failed requests with exponential backoff
- Supports multiple webhook tokens

## 📋 Resource Capture Strategy

Considering that route lazy loading is a common performance optimization, the page waits until the following conditions are met before being considered "loaded":

- No more than 2 network connections
- This state persists for at least 500 milliseconds

Uses Puppeteer's `networkidle2` event instead of the `load` event.

> See implementation in `src/modules/resource-generator/service/base.ts`

## 🎯 Core Resource Selection Strategies

Currently implements 3 strategies:

### 1. ALL-JS Strategy
Selects all captured JS files and sorts them by size in descending order to determine priority.

### 2. ALL-JS-CSS Strategy
Selects captured JS and CSS files and sorts them by size in descending order to determine priority.

### 3. INTERCEPTION & BLANK SCREEN DETECTION Strategy
Intercepts the loading of one file at a time to determine if it causes a blank screen, thus identifying critical resources, and sorts by size in descending order to determine priority.

> **Note:** The current code implements the ALL-JS strategy.

## 🧪 Testing

```bash
# Run all tests
pnpm test

# Run specific test
pnpm test -- path/to/test.ts
```

The project has **100%** test coverage.

## 📊 Monitoring

Prometheus metrics are available at `/metrics`:

- Request duration
- Request count by status code
- Active requests

## 🐛 Debug Mode

```bash
pnpm dev:debug
```

Debug mode features:
- Shows browser window (non-headless mode)
- Enables verbose logging
