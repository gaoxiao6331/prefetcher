# Prefetcher

基于 Fastify 和 TypeScript 的资源预取服务。捕获网页的 JavaScript 资源，上传到 CDN，并可选地发送通知。

## 🎯 项目目的

通过以下方式帮助优化 Web 应用性能：

1. 使用 Puppeteer 分析网页，捕获加载的 JavaScript 资源
2. 生成按大小排序的资源列表
3. 通过 GitHub 上传资源列表到 jsDelivr CDN
4. 通过飞书 webhook 发送部署通知（可选）

使用场景：
- 为 Web 应用生成 prefetch/preload 提示
- 自动化 CDN 部署流程
- 跟踪资源加载模式

## ✨ 功能特性

- 完整的 TypeScript 支持，使用 Zod 进行模式验证
- 支持并发页面处理和速率限制
- 请求追踪，使用唯一追踪 ID
- Prometheus 指标端点
- 飞书 webhook 通知，支持重试逻辑
- 开发调试模式

## 🚀 快速开始

### 前置要求

- Node.js >= 18
- pnpm 或 npm
- 配置了 SSH 访问的 Git
- 飞书 webhook tokens（可选，用于通知）

### 安装

```bash
git clone <your-repo-url>
cd prefetcher
pnpm install
pnpm build
```

### 配置

根据需要设置环境变量：

```bash
# 可选：指定 Chrome/Chromium 路径（默认使用内置 Chromium）
export PUPPETEER_EXECUTABLE_PATH=/path/to/chrome

# 可选：用于通知
export LARK_BOT_TOKENS=token1,token2,token3
```

在 `src/config/file/dev.ts` 或 `src/config/file/prod.ts` 中配置 CDN 设置：

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

### 运行

```bash
# 开发模式（自动重载）
pnpm dev

# 调试模式（可见浏览器）
pnpm dev:debug

# 生产模式
pnpm run
```

服务默认运行在 `http://localhost:3000`。

## 📖 使用方法

### API 接口

**POST** `/res_gen`

从 URL 捕获资源并部署到 CDN。

#### 请求

```json
{
  "targetUrl": "https://example.com",
  "projectName": "my-project",
  "targetFileName": "prefetch-list.json",
  "template": "window.__PREFETCH_RESOURCES__ = __content_placeholder__;",
  "notifications": ["lark-webhook-token-1"]
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `targetUrl` | string | 是 | 要分析的 URL |
| `projectName` | string | 是 | GitHub 分支名称 |
| `targetFileName` | string | 是 | 输出文件名 |
| `template` | string | 否 | 包含 `__content_placeholder__` 的模板 |
| `notifications` | string[] | 否 | 飞书 webhook tokens |

#### 响应

```json
{
  "url": "https://cdn.jsdelivr.net/gh/namespace/repo@branch/prefetch-list.json"
}
```

### 示例

```bash
curl -X POST http://localhost:3000/res_gen \
  -H "Content-Type: application/json" \
  -d '{
    "targetUrl": "https://example.com",
    "projectName": "production",
    "targetFileName": "resources.json"
  }'
```

## 🏗️ 项目结构

```
src/
├── modules/
│   ├── resource-generator/    # 使用 Puppeteer 捕获资源
│   ├── cdn-updater/           # 管理 GitHub + jsDelivr 部署
│   └── notifier/              # 发送飞书通知
├── plugins/
│   ├── config.ts             # 配置管理
│   ├── logger.ts             # 日志设置
│   ├── monitor.ts            # Prometheus 指标
│   └── alert.ts              # 错误告警
├── utils/                    # 工具函数
├── config/file/              # 环境配置
├── index.ts                  # CLI 入口
└── start.ts                  # 服务器启动
```

### 核心组件

**资源生成器** (`src/modules/resource-generator/`)
- 使用 Puppeteer 拦截网络请求
- 跟踪资源大小和加载时间
- 按大小过滤和排序资源

**CDN 更新器** (`src/modules/cdn-updater/`)
- 管理 git 操作（克隆、提交、推送）
- 更新后清除 jsDelivr 缓存
- 验证内容部署

**通知器** (`src/modules/notifier/`)
- 向飞书 webhook 发送消息
- 失败请求重试，支持退避策略
- 支持多个 webhook tokens

## 🧪 测试

```bash
# 运行所有测试
pnpm test

# 运行特定测试
pnpm test -- path/to/test.ts
```

项目测试覆盖率为 100%。

## 📊 监控

Prometheus 指标可通过 `/metrics` 访问：
- 请求持续时间
- 按状态码统计的请求数
- 活跃请求数

## 🐛 调试模式

```bash
pnpm dev:debug
```

调试模式会显示浏览器窗口并启用详细日志。

## 许可证

ISC
