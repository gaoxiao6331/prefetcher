/**
 * Automated test script - to test the performance impact of Prefetch
 * Uses Puppeteer to automate browser testing
 * 
 * Usage: node test-prefetch.js [number of tests]
 */

const puppeteer = require('puppeteer');

const BASE_URL = 'http://localhost:3001';
const TEST_ROUNDS = parseInt(process.argv[2]) || 5; // Default to 5 tests per mode

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function getPerformanceMetrics(page) {
    return await page.evaluate(() => {
        const [nav] = performance.getEntriesByType('navigation');
        const paintEntries = performance.getEntriesByType('paint');
        const fcp = paintEntries.find(e => e.name === 'first-contentful-paint');

        // Get LCP
        return new Promise(resolve => {
            let lcp = null;

            // Try to get LCP from existing entries
            const existingLCP = performance.getEntriesByType('largest-contentful-paint');
            if (existingLCP.length > 0) {
                lcp = existingLCP[existingLCP.length - 1].startTime;
            }

            // Also start listening (use buffered: true to get previous events)
            const observer = new PerformanceObserver((list) => {
                const entries = list.getEntries();
                if (entries.length > 0) {
                    lcp = entries[entries.length - 1].startTime;
                }
            });

            try {
                observer.observe({ type: 'largest-contentful-paint', buffered: true });
            } catch (e) {
                // If the type parameter is not supported, fall back to entryTypes
                observer.observe({ entryTypes: ['largest-contentful-paint'] });
            }

            // Return the result after 200ms, as buffered mode usually gets the value quickly
            setTimeout(() => {
                observer.disconnect();
                resolve({
                    ttfb: nav ? nav.responseStart - nav.requestStart : null,
                    fcp: fcp ? fcp.startTime : null,
                    lcp: lcp,
                    loadTime: nav ? nav.loadEventEnd - nav.fetchStart : null
                });
            }, 200);
        });
    });
}

async function runTest(browser, withPrefetch) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();

    // Enable HTTP cache only for prefetch mode to avoid cross-round cache contamination
    await page.setCacheEnabled(!!withPrefetch);

    try {
        // 1. Visit Site A
        const siteAUrl = withPrefetch
            ? `${BASE_URL}/a/?prefetch=https://cdn.jsdelivr.net/gh/gaoxiao6331/cdn-test@examples/ex-res.js`
            : `${BASE_URL}/a/`;

        await page.goto(siteAUrl, { waitUntil: 'networkidle2' });

        // 2. If prefetch is enabled, wait for resources to be preloaded
        if (withPrefetch) {
            await sleep(2000); // Wait for prefetch to complete
        }

        // 3. Set navigation mode flag
        await page.evaluate((mode) => {
            sessionStorage.setItem('navigationMode', mode);
        }, withPrefetch ? 'prefetch' : 'normal');

        // 4. Navigate to Site B
        await page.goto(`${BASE_URL}/b/`, { waitUntil: 'networkidle2' });

        // 5. Wait for the page to fully load and collect performance metrics
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
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║             Prefetch Performance Automation Test             ║');
    console.log('╠══════════════════════════════════════════════════════════════╣');
    console.log(`║  Test rounds per mode: ${TEST_ROUNDS.toString().padEnd(38)}║`);
    console.log('╚══════════════════════════════════════════════════════════════╝');
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
        // Alternate tests to avoid cache impact
        for (let i = 0; i < TEST_ROUNDS; i++) {
            console.log(`\n📊 Running test round ${i + 1}/${TEST_ROUNDS}...`);

            // Normal mode
            console.log('  ├─ Testing Normal mode...');
            const normalResult = await runTest(browser, false);
            results.normal.push(normalResult);
            console.log(`  │  └─ LCP: ${normalResult.lcp?.toFixed(0) || 'N/A'} ms`);

            await sleep(1000);

            // Prefetch mode
            console.log('  └─ Testing Prefetch mode...');
            const prefetchResult = await runTest(browser, true);
            results.prefetch.push(prefetchResult);
            console.log(`     └─ LCP: ${prefetchResult.lcp?.toFixed(0) || 'N/A'} ms`);

            await sleep(1000);
        }

        // Calculate stats
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

        // Output results
        console.log('\n╔══════════════════════════════════════════════════════════╗');
        console.log('║                   Test Results Summary                   ║');
        console.log('╠═══════════════╤═════════════╤═════════════╤══════════════╣');
        console.log('│ Metric        │ Prefetch    │ Normal Mode │ Improvement  │');
        console.log('╟───────────────┼─────────────┼─────────────┼──────────────╢');

        const formatRow = (label, prefetchVal, normalVal) => {
            const pStr = prefetchVal ? `${prefetchVal.toFixed(0)} ms`.padEnd(11) : 'N/A'.padEnd(11);
            const nStr = normalVal ? `${normalVal.toFixed(0)} ms`.padEnd(11) : 'N/A'.padEnd(11);
            const improvement = (prefetchVal && normalVal)
                ? `${((normalVal - prefetchVal) / normalVal * 100).toFixed(1)}%`.padStart(10)
                : 'N/A'.padStart(10);
            console.log(`│ ${label.padEnd(13)} │ ${pStr} │ ${nStr} │ ${improvement}   │`);
        };

        formatRow('TTFB', stats.prefetch.avgTTFB, stats.normal.avgTTFB);
        formatRow('FCP', stats.prefetch.avgFCP, stats.normal.avgFCP);
        formatRow('LCP', stats.prefetch.avgLCP, stats.normal.avgLCP);
        formatRow('Load Time', stats.prefetch.avgLoad, stats.normal.avgLoad);

        console.log('╚═══════════════╧═════════════╧═════════════╧══════════════╝');

        // Summary
        if (stats.prefetch.avgLCP && stats.normal.avgLCP) {
            const lcpImprovement = (stats.normal.avgLCP - stats.prefetch.avgLCP) / stats.normal.avgLCP * 100;
            console.log('');
            if (lcpImprovement > 0) {
                console.log(`✅ Prefetch improved LCP performance by ${lcpImprovement.toFixed(1)}%`);
            } else {
                console.log(`⚠️  Prefetch did not show significant performance improvement (${lcpImprovement.toFixed(1)}%)`);
            }
        }

    } finally {
        await browser.close();
    }
}

main().catch(console.error);
