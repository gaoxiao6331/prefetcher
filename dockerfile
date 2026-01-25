# --- Stage 1: Build stage ---
    FROM node:18-bullseye-slim AS builder

    RUN corepack enable && corepack prepare pnpm@latest --activate
    WORKDIR /app

    # Set environment variables to prevent downloading redundant browsers during the build phase (saves space and time)
    ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
    
    # Cache dependency layer
    COPY package.json pnpm-lock.yaml ./
    RUN pnpm install --frozen-lockfile
    
    # Copy source code and build
    COPY . .
    RUN pnpm build
    
    # --- Stage 2: Runtime stage ---
    # Directly use the official Puppeteer image, which is based on Debian and comes pre-installed with the latest Chrome and all necessary dependencies
    # This image includes Node.js and dumb-init by default
    FROM ghcr.io/puppeteer/puppeteer:latest
    
    WORKDIR /app

    # 1. Automatically find the Chrome path included in the image
    # The Chrome in the official image is installed at /home/pptruser/.cache/puppeteer/...
    # We use the find command to dynamically locate it to avoid failure due to version number changes
    USER root
    RUN CHROME_BIN=$(find /home/pptruser/.cache/puppeteer -name chrome -type f | head -n 1) && \
        ln -s "$CHROME_BIN" /usr/bin/google-chrome-stable

    # 2. Set environment variables to let the Puppeteer library use this path directly
    ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable
    
    # 3. Copy artifacts
    # The official image creates the pptruser user (UID 1000) by default; just use it
    COPY --from=builder --chown=pptruser:pptruser /app/node_modules ./node_modules
    COPY --from=builder --chown=pptruser:pptruser /app/dist ./dist
    COPY --from=builder --chown=pptruser:pptruser /app/package.json ./package.json
    
    # 4. Switch user
    # The official image defaults to pptruser, but we explicitly specify it to ensure correct permissions
    USER pptruser
    
    EXPOSE 3000
    
    CMD ["node", "dist/index.js", "start"]