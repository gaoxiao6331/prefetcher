# Prefetcher

[中文](./docs/README_zh.md) | English

A resource prefetching service built with Fastify and TypeScript. Captures web page resources to generate core resource lists, uploads them to CDN for other sites to use with Prefetch, and optionally sends notifications.

## 🎯 Project Purpose

Helps optimize web application performance by:

1. Analyzing web pages using Puppeteer to capture loaded resources
2. Generating core resource lists based on strategies and uploading them to CDN
3. Other web applications fetch CDN resources and use Prefetch to pre-acquire core resources, reducing the loading time when navigating to the page

## 🚀 Quick Start

### Prerequisites

- Node.js >= 20
- pnpm
- Git with SSH access
- Lark webhook tokens (optional, for notifications)

### Installation

```bash
pnpm install
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

### Docker Running

```bash
# Build image
./build.sh

# Start container
docker run -p 3000:3000 prefetcher
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

### Core Components

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

Since modern web applications (e.g., React/Vue) widely adopt route lazy loading and dynamic imports, simply listening to the `load` event cannot capture all critical resources required for page rendering.

This service uses Puppeteer's `networkidle0` strategy to ensure the integrity of resource capture:
- **networkidle0**: Considers page load complete when the number of network connections stays at 0 for at least 500ms.
- Compared to `networkidle2` (which allows 2 connections), this strategy is more stringent and reliably captures asynchronous resources triggered immediately after the first screen rendering.

> For the core implementation, please refer to [base.ts](file:///Users/go/Code/prefetcher/src/modules/resource-generator/service/base.ts)

## 🎯 Core Resource Selection Strategies

To avoid bandwidth waste from blind prefetching, the project implements the following selection strategies:

### 1. ALL-JS
- **Principle**: Captures all JavaScript files loaded by the page.
- **Applicability**: Best for projects where rendering is primarily driven by JS.

### 2. ALL-JS-CSS
- **Principle**: Captures both JS and CSS resources.
- **Applicability**: Best for projects with heavy style dependencies where CSS has a direct impact on the first screen.

### 3. Interception & Blank Screen Detection
- **Principle**: Uses an elimination method. Simulates page loads while intercepting candidate resources one by one. If intercepting a resource leads to a long blank screen or rendering failure, it is marked as a "core resource."
- **Applicability**: Scenarios requiring extremely high precision for critical resources.

### 4. LCP Impact Evaluation
- **Principle**: Quantifies resource importance. Simulates delayed loading for specific resources and measures the impact on LCP (Largest Contentful Paint). If delaying a resource causes LCP to increase significantly or exceed a threshold (e.g., 10s), it is considered core.
- **Advantage**: Based on real-user performance metrics, making the optimization results most aligned with performance goals.

> **Tip**: Choose the most suitable strategy based on the complexity of your business scenario.

## 🧪 Testing

```bash
# Run all tests
pnpm test

# Run a specific module test
pnpm test src/modules/resource-generator/service/__tests__/lcp-impact-evaluation-service.test.ts
```

The project uses Jest for rigorous unit and integration testing, achieving **100% branch coverage** to ensure the robustness of core logic.

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

## 😃 Performance Verification

The project provides automation scripts in the `script` directory to quantify the performance improvements brought by prefetching.

### Verification Logic
The script compares key metrics when navigating from Page A to Page B under two conditions: "Cold Start" (no prefetch) and "Prefetch Start" (with prefetched resources):
- **TTFB** (Time to First Byte)
- **FCP** (First Contentful Paint)
- **LCP** (Largest Contentful Paint)
- **Load Time** (Total page load time)

### Running Verification
```bash
# Run the automation verification script
# [rounds] is the number of test rounds, default is 5
node script/test-prefetch.js [rounds]
```

Upon completion, the terminal will display a comparison table showing the improvement percentage for each metric.
