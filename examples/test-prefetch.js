/**
 * 自动化测试脚本 - 测试 Prefetch 对性能的影响
 * 使用 Puppeteer 自动化浏览器进行测试
 * 
 * 使用方法: node test-prefetch.js [测试次数]
 */

const puppeteer = require('puppeteer');

const BASE_URL = 'http://localhost:3000';
const TEST_ROUNDS = parseInt(process.argv[2]) || 5; // 默认每种模式测试5次

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function getPerformanceMetrics(page) {
    return await page.evaluate(() => {
        const [nav] = performance.getEntriesByType('navigation');
        const paintEntries = performance.getEntriesByType('paint');
        const fcp = paintEntries.find(e => e.name === 'first-contentful-paint');

        // 获取 LCP
        return new Promise(resolve => {
            let lcp = null;
            const observer = new PerformanceObserver((list) => {
                const entries = list.getEntries();
                lcp = entries[entries.length - 1]?.startTime;
            });
            observer.observe({ entryTypes: ['largest-contentful-paint'] });

            setTimeout(() => {
                observer.disconnect();
                resolve({
                    ttfb: nav ? nav.responseStart - nav.requestStart : null,
                    fcp: fcp ? fcp.startTime : null,
                    lcp: lcp,
                    loadTime: nav ? nav.loadEventEnd - nav.fetchStart : null
                });
            }, 2000);
        });
    });
}

async function runTest(browser, withPrefetch) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();

    // 禁用缓存
    await page.setCacheEnabled(false);

    try {
        // 1. 访问 Site A
        const siteAUrl = withPrefetch
            ? `${BASE_URL}/a/?prefetch=/prefetch-list.js`
            : `${BASE_URL}/a/`;

        await page.goto(siteAUrl, { waitUntil: 'networkidle0' });

        // 2. 如果启用 prefetch，等待资源预加载完成
        if (withPrefetch) {
            await sleep(2000); // 等待 prefetch 完成
        }

        // 3. 设置导航模式标记
        await page.evaluate((mode) => {
            sessionStorage.setItem('navigationMode', mode);
        }, withPrefetch ? 'prefetch' : 'normal');

        // 4. 导航到 Site B
        await page.goto(`${BASE_URL}/b/`, { waitUntil: 'networkidle0' });

        // 5. 等待页面完全加载并收集性能指标
        await sleep(1000);
        const metrics = await getPerformanceMetrics(page);

        return {
            mode: withPrefetch ? 'prefetch' : 'normal',
            ...metrics
        };
    } finally {
        await context.close();
    }
}

async function main() {
    console.log('╔════════════════════════════════════════════════╗');
    console.log('║       Prefetch 性能自动化测试                    ║');
    console.log('╠════════════════════════════════════════════════╣');
    console.log(`║  每种模式测试次数: ${TEST_ROUNDS}                          ║`);
    console.log('╚════════════════════════════════════════════════╝');
    console.log('');

    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const results = {
        prefetch: [],
        normal: []
    };

    try {
        // 交替测试，避免缓存影响
        for (let i = 0; i < TEST_ROUNDS; i++) {
            console.log(`\n📊 第 ${i + 1}/${TEST_ROUNDS} 轮测试...`);

            // 普通模式
            console.log('  ├─ 测试普通模式...');
            const normalResult = await runTest(browser, false);
            results.normal.push(normalResult);
            console.log(`  │  └─ LCP: ${normalResult.lcp?.toFixed(0) || 'N/A'} ms`);

            await sleep(1000);

            // Prefetch 模式
            console.log('  └─ 测试 Prefetch 模式...');
            const prefetchResult = await runTest(browser, true);
            results.prefetch.push(prefetchResult);
            console.log(`     └─ LCP: ${prefetchResult.lcp?.toFixed(0) || 'N/A'} ms`);

            await sleep(1000);
        }

        // 计算统计数据
        const calcAvg = (arr, key) => {
            const valid = arr.filter(r => r[key] != null);
            return valid.length ? valid.reduce((a, b) => a + b[key], 0) / valid.length : null;
        };

        const stats = {
            prefetch: {
                avgTTFB: calcAvg(results.prefetch, 'ttfb'),
                avgFCP: calcAvg(results.prefetch, 'fcp'),
                avgLCP: calcAvg(results.prefetch, 'lcp'),
                avgLoad: calcAvg(results.prefetch, 'loadTime')
            },
            normal: {
                avgTTFB: calcAvg(results.normal, 'ttfb'),
                avgFCP: calcAvg(results.normal, 'fcp'),
                avgLCP: calcAvg(results.normal, 'lcp'),
                avgLoad: calcAvg(results.normal, 'loadTime')
            }
        };

        // 输出结果
        console.log('\n╔════════════════════════════════════════════════╗');
        console.log('║                  测试结果汇总                    ║');
        console.log('╠════════════════════════════════════════════════╣');
        console.log('│ 指标          │ Prefetch    │ 普通模式    │ 提升   │');
        console.log('├───────────────┼─────────────┼─────────────┼────────┤');

        const formatRow = (label, prefetchVal, normalVal) => {
            const pStr = prefetchVal ? `${prefetchVal.toFixed(0)} ms`.padEnd(11) : 'N/A'.padEnd(11);
            const nStr = normalVal ? `${normalVal.toFixed(0)} ms`.padEnd(11) : 'N/A'.padEnd(11);
            const improvement = (prefetchVal && normalVal)
                ? `${((normalVal - prefetchVal) / normalVal * 100).toFixed(1)}%`
                : 'N/A';
            console.log(`│ ${label.padEnd(13)} │ ${pStr} │ ${nStr} │ ${improvement.padEnd(6)} │`);
        };

        formatRow('TTFB', stats.prefetch.avgTTFB, stats.normal.avgTTFB);
        formatRow('FCP', stats.prefetch.avgFCP, stats.normal.avgFCP);
        formatRow('LCP', stats.prefetch.avgLCP, stats.normal.avgLCP);
        formatRow('Load Time', stats.prefetch.avgLoad, stats.normal.avgLoad);

        console.log('╚════════════════════════════════════════════════╝');

        // 总结
        if (stats.prefetch.avgLCP && stats.normal.avgLCP) {
            const lcpImprovement = (stats.normal.avgLCP - stats.prefetch.avgLCP) / stats.normal.avgLCP * 100;
            console.log('');
            if (lcpImprovement > 0) {
                console.log(`✅ Prefetch 使 LCP 性能提升了 ${lcpImprovement.toFixed(1)}%`);
            } else {
                console.log(`⚠️  Prefetch 未带来明显性能提升 (${lcpImprovement.toFixed(1)}%)`);
            }
        }

    } finally {
        await browser.close();
    }
}

main().catch(console.error);
