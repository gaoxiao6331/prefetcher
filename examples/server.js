/**
 * 静态服务器 - 托管 Site A 和 Site B
 * 使用方法: node server.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3001;

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml'
};

// 带波动的随机延迟
function randomDelay(base = 50, variance = 30) {
    return base + (Math.random() - 0.5) * 2 * variance;
}

const server = http.createServer(async (req, res) => {
    let url = req.url.split('?')[0]; // 移除查询参数

    // 路由处理
    if (url === '/' || url === '/a' || url === '/a/') {
        url = '/a/index.html';
    } else if (url === '/b' || url === '/b/') {
        // 使用 Rsbuild 构建产物作为入口
        url = '/b/dist/index.html';
    } else if (url.startsWith('/assets/')) {
        // 将根路径下的 /assets/* 重写到 Site B 的构建目录下
        // 因为 Rsbuild 生成的 index.html 使用了绝对路径 /assets/...，需要映射到 /b/dist/assets/...
        url = '/b/dist' + url;
    }

    const filePath = path.join(__dirname, url);
    const ext = path.extname(filePath);

    // 检查文件是否存在
    if (!fs.existsSync(filePath)) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found: ' + url);
        console.log(`[${new Date().toISOString()}] 404 ${req.url}`);
        return;
    }

    // 模拟网络延迟（Site B 的 CSS 和 JS 文件添加固定延迟）
    if (url.startsWith('/b/') && (ext === '.css' || ext === '.js')) {
        const delay = 200; // 固定延迟 200ms
        await new Promise(resolve => setTimeout(resolve, delay));
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} (fixed delay: ${delay}ms)`);
    } else {
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    }

    // 读取并返回文件
    try {
        const content = fs.readFileSync(filePath);
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        // 如果是 Site B 的资源文件（JS/CSS），设置较长时间的缓存
        // 这样 prefetch 到缓存后，后续访问 Site B 时才能命中缓存
        if (url.startsWith('/b/') && (ext === '.css' || ext === '.js')) {
            res.writeHead(200, {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=3600', // 缓存 1 小时
                'Access-Control-Allow-Origin': '*'
            });
        } else {
            res.writeHead(200, {
                'Content-Type': contentType,
                'Cache-Control': 'no-cache', // HTML 和其他文件不缓存
                'Access-Control-Allow-Origin': '*'
            });
        }
        res.end(content);
    } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('500 Internal Server Error');
    }
});

server.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║          Prefetch 测试服务器已启动                          ║
╠═══════════════════════════════════════════════════════════╣
║  Site A (无 Prefetch):                                     ║
║    http://localhost:${PORT}/a/                               ║
║                                                            ║
║  Site A (启用 Prefetch):                                   ║
║    http://localhost:${PORT}/a/?prefetch=https://cdn.jsdelivr.net/gh/gaoxiao6331/cdn-test@ex/ex-res3.js    ║
║                                                            ║
║  Site B:                                                   ║
║    http://localhost:${PORT}/b/                               ║
╠═══════════════════════════════════════════════════════════╣
║  测试步骤:                                                  ║
║  1. 访问 Site A (选择启用或禁用 Prefetch)                   ║
║  2. 点击访问 Site B                                         ║
║  3. 返回 Site A 查看性能对比                                ║
║                                                            ║
║  自动化测试:                                                ║
║    node examples/test-prefetch.js [测试次数]                ║
╚═══════════════════════════════════════════════════════════╝
    `);
});
