/**
 * Static server - to host Site A and Site B
 * Usage: node server.js
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

// Random delay with variance
function randomDelay(base = 50, variance = 30) {
    return base + (Math.random() - 0.5) * 2 * variance;
}

const server = http.createServer(async (req, res) => {
    let url = req.url.split('?')[0]; // Remove query parameters

    // Route handling
    if (url === '/' || url === '/a' || url === '/a/') {
        url = '/a/index.html';
    } else if (url === '/b' || url === '/b/') {
        // Use Rsbuild's output as the entry point
        url = '/b/dist/index.html';
    } else if (url.startsWith('/assets/')) {
        // Rewrite /assets/* from the root to Site B's build directory
        // This is because Rsbuild's generated index.html uses absolute paths like /assets/...
        // which need to be mapped to /b/dist/assets/...
        url = '/b/dist' + url;
    }

    const filePath = path.join(__dirname, url);
    const ext = path.extname(filePath);

    // Check if the file exists
    if (!fs.existsSync(filePath)) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found: ' + url);
        console.log(`[${new Date().toISOString()}] 404 ${req.url}`);
        return;
    }

    let delay = 200; // delay 200 ms for js
    if (url.endsWith('css')) { // for css
        delay = 100;
    } else if(!url.endsWith('js')) { // for html and other files
        delay = 50;        
    }

    await new Promise(resolve => setTimeout(resolve, delay));
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} (fixed delay: ${delay}ms)`);

    // Read and return the file
    try {
        const content = fs.readFileSync(filePath);
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        // For Site B's resource files (JS/CSS), set a longer cache duration.
        // This ensures that after prefetching, subsequent visits to Site B will hit the cache.
        if (ext === '.css' || ext === '.js') {
            res.writeHead(200, {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
                'Access-Control-Allow-Origin': '*'
            });
        } else {
            res.writeHead(200, {
                'Content-Type': contentType,
                'Cache-Control': 'no-cache', // Do not cache HTML and other files
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
║          Prefetch Test Server Started                       ║
╠═══════════════════════════════════════════════════════════╣
║  Site A (No Prefetch):                                     ║
║    http://localhost:${PORT}/a/                               ║
║                                                            ║
║  Site A (Prefetch Enabled):                                ║
║    http://localhost:${PORT}/a/?prefetch=https://cdn.jsdelivr.net/gh/gaoxiao6331/cdn-test@examples/ex-res.js║
║                                                            ║
║  Site B:                                                   ║
║    http://localhost:${PORT}/b/                               ║
╠═══════════════════════════════════════════════════════════╣
║  Test Steps:                                               ║
║  1. Visit Site A (with or without Prefetch)                ║
║  2. Click to visit Site B                                  ║
║  3. Return to Site A to see the performance comparison     ║
║                                                            ║
║  Automated Test:                                           ║
║    node examples/test-prefetch.js [number of tests]        ║
╚═══════════════════════════════════════════════════════════╝
    `);
});
