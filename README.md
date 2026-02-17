# Prefetcher

English | [中文](./docs/README_zh.md) 

A resource prefetching service built with Fastify and TypeScript. It captures web page resources to generate core resource lists, uploads them to a CDN for use by other sites via Prefetch, thereby reducing load times when navigating to the target pages.

## 🎯 Project Purpose

Helps optimize web application performance by:

1. Analyzing web pages using Puppeteer to capture loaded resources
2. Generating core resource lists based on strategies and uploading them to a CDN
3. Allowing other web applications to fetch these resources from the CDN and use Prefetch to pre-load core assets, reducing load times when navigating to the target page

## 🚀 Quick Start

### Prerequisites

- Node.js >= 20
- pnpm >= 10
- GitHub repository with SSH access (for uploading resources)
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
      
      // Repository address for uploading resource lists; ensure the SSH address is used to avoid interactive authentication during startup
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

# Specify environment (reads config files under config/file)
NODE_ENV=your-env

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

Server runs on `http://localhost:3000` by default. See `script/docker_run.sh` for a sample using Docker.

## 📖 Usage

### API Endpoint

**POST** `/res_gen`

Captures resources from a URL and deploys them to the CDN.

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
| `targetUrl` | string | Yes | The target URL to analyze. |
| `projectName` | string | Yes | GitHub branch name (used to isolate resource lists for different projects). |
| `targetFileName` | string | Yes | Output filename (e.g., `prefetch-resources.js`). |
| `template` | string | No | Template string containing `__content_placeholder__`. Example: `window.RESOURCES = __content_placeholder__;`. |
| `notifications` | string[] | No | List of Lark Webhook tokens to receive notifications upon deployment completion. |

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
├── script/                   # Automation tests and utility scripts
├── src/
│   ├── modules/
│   │   ├── resource-generator/    # Captures resources using Puppeteer and analyzes core assets
│   │   ├── cdn-updater/           # Manages GitHub + jsDelivr deployment (currently only supports this combination)
│   │   └── notifier/              # Sends Lark notifications via webhooks (currently only supports Lark)
│   ├── plugins/
│   │   ├── config.ts             # Configuration management
│   │   ├── monitor.ts            # Prometheus metrics
│   │   └── alert.ts              # Error alerting
│   ├── utils/                    # Utility functions
│   ├── config/file/              # Environment configs
│   ├── index.ts                  # CLI entry
│   └── start.ts                  # Server bootstrap
└── global.d.ts               # Global type definitions
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

Since modern web applications (e.g., React/Vue) widely adopt route lazy loading and dynamic imports, simply listening for the `load` event is insufficient to capture all critical resources required for page rendering.

This service uses Puppeteer's `networkidle0` strategy to ensure comprehensive resource capture:
- **networkidle0**: Considers page load complete when the number of network connections stays at 0 for at least 500ms.
- Compared to `networkidle2` (which allows 2 connections), this strategy is stricter and more reliably captures asynchronous resources triggered immediately after the first screen rendering.

> For the core implementation, please refer to [base.ts](file:///Users/go/Code/prefetcher/src/modules/resource-generator/service/base.ts)

## 🎯 Core Resource Selection Strategies

To avoid bandwidth waste from blind prefetching, the project implements the following selection strategies:

### 1. ALL-JS
- **Principle**: Captures all JavaScript files loaded by the page.
- **Applicability**: Best for projects where rendering is primarily JS-driven.

### 2. ALL-JS-CSS
- **Principle**: Captures both JS and CSS resources.
- **Applicability**: Best for projects with heavy styling where CSS directly impacts the first paint.

### 3. Interception & Blank Screen Detection
- **Principle**: Uses an elimination method: simulates page loads while intercepting candidate resources one by one. If intercepting a resource leads to a long blank screen or rendering failure, it is marked as a "core resource."
- **Applicability**: Scenarios requiring extremely high precision for critical resources.

### 4. LCP Impact Evaluation
- **Principle**: Quantifies resource importance. Simulates delayed loading for specific resources and measures the impact on LCP (Largest Contentful Paint). If delaying a resource causes LCP to increase significantly or exceed a threshold (e.g., 10s), it is considered core.
- **Advantage**: Based on real-user performance metrics, aligning optimization results closely with performance goals.

> **Tip**: Choose the most suitable strategy based on the complexity of your business scenario.

## 🧪 Testing

```bash
# Run all tests
pnpm test

# Run a specific module test
pnpm test src/modules/resource-generator/service/__tests__/lcp-impact-evaluation-service.test.ts
```

The project uses Jest for rigorous unit and integration testing, achieving **100% branch coverage**, though most test cases are AI-generated and may have certain limitations.

![Coverage Screenshot](./docs/img/coverage.jpg)

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

The project provides automation scripts in the `script` directory to quantify the performance improvements achieved by prefetching.

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
# [delay] is the prefetch delay time, default is 2000ms
node script/test-prefetch.js [rounds] [delay]
```

Upon completion, the terminal will display a comparison table showing the improvement percentage for each metric.

See the effect in a DEMO project [here](./docs/VERIFY.md).
