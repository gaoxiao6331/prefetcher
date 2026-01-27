# Prefetcher

中文 | [English](../README.md)

基于 Fastify 和 TypeScript 的资源预取服务。捕获网页资源并生成核心资源列表，上传到 CDN 供其他站点 Prefetch 使用，以此来减少跳转至该页面的加载时间。

## 🎯 项目目的

通过以下方式帮助优化 Web 应用性能：

1. 使用 Puppeteer 分析网页，捕获加载的资源
2. 基于策略生成核心资源列表，并上传至CDN
3. 其他Web应用获取CDN资源，使用Prefetch预获取核心资源，减少跳转至该页面的加载时间

## 🚀 快速开始

### 前置要求

- Node.js >= 20
- pnpm
- 配置了 SSH 访问的 Git
- 飞书 webhook tokens（可选，用于通知）

### 安装

```bash
git clone https://github.com/gaoxiao6331/prefetcher.git
cd prefetcher
pnpm install
pnpm build
```

### 配置

#### 环境变量

```bash
# 指定 Chrome/Chromium 路径
export PUPPETEER_EXECUTABLE_PATH=/path/to/chrome

# 飞书 webhook tokens，用于发送各类通知（可选）
export LARK_BOT_TOKENS=token1,token2,token3
```

#### CDN 配置

在 `src/config/file/dev.ts` 中配置 CDN 设置：

```typescript
{
  port: 3000,
  cdn: {
    jsDelivr: {
      // 本地仓库存放路径，服务会将远程仓库拉取到这个路径
      localPath: "/path/to/local/repo",
      
      // 上传资源列表的仓库地址，请确保使用 SSH 地址，否则启动时需要登录
      remoteAddr: "git@github.com:user/repo.git",
      
      // Git 提交使用的 name 和 email
      git: {
        name: "Your Name",
        email: "your.email@example.com"
      }
    }
  }
}
```

> **⚠️ 注意：** 配置文件根据 `NODE_ENV` 环境变量读取。例如，配置生产环境时，可以创建 `prod.ts` 文件，并将 `NODE_ENV` 设置为 `prod`。具体逻辑见 `src/plugins/config.ts`。

### 运行

```bash
# 开发模式（自动重载）
pnpm dev

# 调试模式（可见浏览器窗口）
pnpm dev:debug

# 构建生产代码
pnpm build

# 启动服务
pnpm start
```

服务默认运行在 `http://localhost:3000`。

## 📖 使用方法

### API 接口

**POST** `/res_gen`

从指定 URL 捕获资源并部署到 CDN。

#### 请求参数

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
| `targetUrl` | string | 是 | 要分析的目标 URL |
| `projectName` | string | 是 | GitHub 分支名称 |
| `targetFileName` | string | 是 | 输出文件名 |
| `template` | string | 否 | 包含 `__content_placeholder__` 占位符的模板字符串 |
| `notifications` | string[] | 否 | 飞书 webhook tokens 数组 |

#### 响应

```json
{
  "url": "https://cdn.jsdelivr.net/gh/namespace/repo@branch/prefetch-list.json"
}
```

### 使用示例

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
│   ├── resource-generator/    # 使用 Puppeteer 捕获资源，并分析核心资源
│   ├── cdn-updater/           # 将资源上传至CDN，目前仅支持 GitHub + jsDelivr 部署
│   └── notifier/              # 发送通知，目前仅支持飞书 webhook 通知
├── plugins/
│   ├── config.ts             # 配置管理
│   ├── monitor.ts            # Prometheus 指标
│   └── alert.ts              # 错误告警
├── utils/                    # 工具函数
├── config/file/              # 环境配置文件
├── index.ts                  # CLI 入口
└── start.ts                  # 服务器启动
```

### 核心组件

**资源生成器** (`src/modules/resource-generator/`)
- 使用 Puppeteer 拦截网络请求
- 跟踪资源大小和加载时间
- 过滤和排序核心资源

**CDN 更新器** (`src/modules/cdn-updater/`)
- 管理 Git 操作（克隆、提交、推送）
- 更新后清除 jsDelivr 缓存
- 验证内容部署

**通知器** (`src/modules/notifier/`)
- 向飞书 webhook 发送消息
- 失败请求重试，支持指数退避策略
- 支持多个 webhook tokens

## 📋 资源捕获策略

考虑到路由懒加载是常见的性能优化方案，页面会等待直到满足以下条件才认为"加载完成"：

- 网络连接数不超过 2 个
- 这种状态持续至少 500 毫秒

使用 Puppeteer 的 `networkidle2` 事件，而非 `load` 事件。

> 具体实现见 `src/modules/resource-generator/service/base.ts`

## 🎯 核心资源选取策略

目前实现了以下几种策略：

### 1. 全部JS（ALL-JS） 策略
选择捕获的全部 JS 文件，按体积大小降序排序确定优先级。

### 2. 全部JS和CSS（ALL-JS-CSS） 策略
选择捕获的 JS 和 CSS 文件，按体积大小降序排序确定优先级。

### 3. 拦截&白屏检测（INTERCEPTION & BLANK SCREEN DETECTION）策略
每次请求拦截一个文件的加载，判断是否会导致白屏，从而确定是否为关键资源，并按体积大小降序排序确定优先级。

### 4.LCP影响评估（LCP Impact Evaluation）策略
每次请求拦截一个文件的加载，判断是否会导致白屏，从而确定是否为关键资源，并按体积大小降序排序确定优先级。

> **注意：** 实际使用的策略需要结合项目进行抉择，。

## 🧪 测试

```bash
# 运行所有测试
pnpm test

# 运行特定测试
pnpm test -- path/to/test.ts
```

项目测试覆盖率为 **100%** (大部分测试用例为AI生成)。

## 📊 监控

Prometheus 指标可通过 `/metrics` 端点访问：

- 请求持续时间
- 按状态码统计的请求数
- 活跃请求数

## 🐛 调试模式

```bash
pnpm dev:debug
```

调试模式功能：
- 显示浏览器窗口（非无头模式）
- 启用详细日志输出

## 😃 效果验证
在examples目录下，存在两个Demo项目A和B，会测试从A跳转至B，prefetch和未prefetch的性能指标提升
测试步骤
node examples/server.js # 启动一个服务托管A、B项目的静态资源
node test-prefetch.js 20 # 20是循环轮次，可不穿传，默认为5