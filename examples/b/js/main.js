/**
 * Main.js - 主应用逻辑
 */
console.log('[Main] 初始化主应用...');

const App = {
    initialized: false,

    async init() {
        if (this.initialized) return;
        console.log('[Main] 开始加载数据...');

        await Promise.all([
            this.loadStats(),
            this.loadLazyModules()
        ]);

        this.initialized = true;
        console.log('[Main] 应用初始化完成');
    },

    async loadStats() {
        const response = await AppUtils.mockFetch('/api/stats', { baseDelay: 400, variance: 200 });
        const { users, orders, revenue } = response.data;

        AppUtils.animateValue(document.getElementById('statUsers'), 0, users, 1500);
        AppUtils.animateValue(document.getElementById('statOrders'), 0, orders, 1200);

        const revenueEl = document.getElementById('statRevenue');
        const startTime = performance.now();
        const animate = (currentTime) => {
            const progress = Math.min((currentTime - startTime) / 1500, 1);
            const current = Math.floor(revenue * (1 - Math.pow(1 - progress, 4)));
            revenueEl.textContent = '¥' + AppUtils.formatNumber(current);
            if (progress < 1) requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
    },

    async loadLazyModules() {
        await Promise.all([
            this.loadModule('chart', '/b/js/lazy-module-1.js'),
            this.loadModule('table', '/b/js/lazy-module-2.js'),
            this.loadModule('notifications', '/b/js/lazy-module-3.js')
        ]);
    },

    loadModule(name, src) {
        return new Promise((resolve) => {
            console.log(`[Main] 懒加载模块: ${name}`);
            const script = document.createElement('script');
            script.src = src;
            script.async = true;
            script.onload = () => { console.log(`[Main] 模块 ${name} 加载完成`); resolve(); };
            script.onerror = () => { console.error(`[Main] 模块 ${name} 加载失败`); resolve(); };
            document.body.appendChild(script);
        });
    }
};

AppUtils.ready(() => App.init());
