# --- 第一阶段：构建阶段 ---
    FROM node:18-bullseye-slim AS builder

    RUN corepack enable && corepack prepare pnpm@latest --activate
    WORKDIR /app

    # 设置环境变量，防止在构建阶段下载多余的浏览器（节省空间和时间）
    ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
    
    # 缓存依赖层
    COPY package.json pnpm-lock.yaml ./
    RUN pnpm install --frozen-lockfile
    
    # 复制源码并构建
    COPY . .
    RUN pnpm build
    
    # --- 第二阶段：运行阶段 ---
    # 直接使用 Puppeteer 官方镜像，它基于 Debian 并预装了最新的 Chrome 和所有必需的依赖
    # 这个镜像本身就包含 Node.js 18/20 以及 dumb-init
    FROM ghcr.io/puppeteer/puppeteer:latest
    
    WORKDIR /app

    # 1. 自动寻找镜像中自带的 Chrome 路径
    # 官方镜像的 Chrome 安装在 /home/pptruser/.cache/puppeteer/...
    # 我们用 find 命令动态定位它，避免版本号变动导致失效
    USER root
    RUN CHROME_BIN=$(find /home/pptruser/.cache/puppeteer -name chrome -type f | head -n 1) && \
        ln -s "$CHROME_BIN" /usr/bin/google-chrome-stable

    # 2. 设置环境变量，让 Puppeteer 库直接使用这个路径
    ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable
    
    # 3. 复制产物
    # 官方镜像默认创建了 pptruser 用户（UID 1000），直接使用即可
    COPY --from=builder --chown=pptruser:pptruser /app/node_modules ./node_modules
    COPY --from=builder --chown=pptruser:pptruser /app/dist ./dist
    COPY --from=builder --chown=pptruser:pptruser /app/package.json ./package.json
    
    # 4. 切换用户
    # 官方镜像默认就是 pptruser，但为了确保权限正确，我们显式指定一次
    USER pptruser
    
    EXPOSE 3000
    
    CMD ["node", "dist/index.js", "start"]