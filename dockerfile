# --- 第一阶段：构建阶段 ---
    FROM node:18-bullseye-slim AS builder

    RUN corepack enable && corepack prepare pnpm@latest --activate
    WORKDIR /app
    
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
    
    # 1. 核心环境变量
    # 官方镜像已经安装了浏览器，通常在 /usr/bin/google-chrome
    ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome
    
    WORKDIR /app
    
    # 2. 复制产物
    # 官方镜像默认创建了 pptruser 用户（UID 1000），直接使用即可
    COPY --from=builder --chown=pptruser:pptruser /app/node_modules ./node_modules
    COPY --from=builder --chown=pptruser:pptruser /app/dist ./dist
    COPY --from=builder --chown=pptruser:pptruser /app/package.json ./package.json
    
    # 3. 字体处理（可选）
    # 官方镜像自带了基础中文字体。如果你有特殊的字体需求，可以额外安装，
    # 但对于一般的中文网页渲染，官方镜像已经足够。
    
    # 4. 切换用户
    # 官方镜像默认就是 pptruser，但为了确保权限正确，我们显式指定一次
    USER pptruser
    
    EXPOSE 3000
    
    CMD ["node", "dist/index.js", "start"]