# 效果验证

## 🧪 验证环境与 Demo

### Demo 站点
我们准备了两个 AI 生成的 Demo 项目，并部署在 GitHub Pages 上：
- **[Demo 仓库地址](https://github.com/gaoxiao6331/prefetcher-examples)**
- **站点 A (入口页)**：一个静态 HTML 页面。它会根据 URL 中的 `prefetch` 参数决定是否开启预取功能。
- **站点 B (目标页)**：一个基于 React + Rsbuild 构建的现代 Web 应用。当站点 A 开启预取时，会提前加载站点 B 的关键资源。

| 站点 A (入口) | 站点 B (目标) |
| :---: | :---: |
| ![站点 A](./img/site-a.jpg) | ![站点 B](./img/site-b.jpg) |

### 测试机配置
- **设备**：MacBook Pro 2019 (16-inch, 32GB RAM)
- **环境**：Node.js v20.18.1

---

## 🚀 执行验证流程

验证流程分为两步：首先生成最新的资源列表，然后运行自动化测试脚本对比性能数据。

### 1. 生成关键资源列表
在 `script` 目录下运行 `res_gen.sh`，该脚本会调用预取服务分析站点 B，并将核心资源列表上传至 CDN。
```bash
cd script
./res_gen.sh
```

### 2. 运行自动化验证
使用 `test-prefetch.js` 进行多次循环测试。脚本会自动模拟“无预取”和“有预取”两种场景，并统计各项指标。

> **关于等待延迟 (Delay)**：在“有预取”场景下，脚本在站点 A 触发预取后会等待一段时间（由参数控制），以确保预取资源在跳转到站点 B 之前已完全加载，从而真实反映预取带来的性能收益。

#### 标准测试 (默认 2000ms 等待时间)
执行 20 轮测试以获取稳定的平均值，默认等待 2000ms 以确保资源预取完成：
```bash
node test-prefetch.js 20
```
**预期结果示例：**
![结果](./img/result.jpg)

#### 缩短等待时间测试 (100ms 等待时间)
测试极端场景下，预取资源加载时间较短的情况。
```bash
# 参数 1: 测试轮次 (20)
# 参数 2: 跳转前的等待延迟 (100ms)
node test-prefetch.js 20 100
```
**预期结果示例：**
![结果](./img/result-delay-100.jpg)

---

## 📊 指标说明

脚本主要对比以下关键性能指标 (KPIs)：
- **TTFB (Time to First Byte)**：首字节时间。
- **FCP (First Contentful Paint)**：首次内容绘制时间。
- **LCP (Largest Contentful Paint)**：最大内容绘制时间。
- **Load Time**：页面完全加载完成的时间。

通过对比表格，你可以直观地看到开启预取后，各项指标（尤其是 LCP 和 Load Time）的显著提升百分比。