/**
 * Utils.js - 通用工具函数
 */

console.log('[Utils] 加载工具模块...');

window.AppUtils = {
    // 格式化数字（添加千分位）
    formatNumber: function (num) {
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    },

    // 格式化货币
    formatCurrency: function (amount, currency = '¥') {
        return currency + this.formatNumber(amount.toFixed(2));
    },

    // 生成随机数
    random: function (min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    },

    // 带波动的延迟（用于模拟真实网络）
    randomDelay: function (base = 200, variance = 100) {
        const delay = base + (Math.random() - 0.5) * 2 * variance;
        return Math.max(50, delay);
    },

    // 模拟 API 请求（带波动延迟）
    mockFetch: async function (endpoint, options = {}) {
        const { baseDelay = 300, variance = 150 } = options;
        const delay = this.randomDelay(baseDelay, variance);

        console.log(`[API] 请求 ${endpoint}，延迟 ${delay.toFixed(0)}ms`);

        await new Promise(resolve => setTimeout(resolve, delay));

        // 根据 endpoint 返回不同的模拟数据
        const mockData = {
            '/api/stats': {
                users: this.random(1000, 5000),
                orders: this.random(100, 500),
                revenue: this.random(50000, 150000)
            },
            '/api/chart': Array.from({ length: 7 }, () => this.random(20, 100)),
            '/api/table': Array.from({ length: 5 }, (_, i) => ({
                id: i + 1,
                name: `用户 ${this.random(1000, 9999)}`,
                status: ['active', 'pending', 'inactive'][this.random(0, 2)],
                amount: this.random(100, 10000)
            })),
            '/api/notifications': [
                { type: 'success', title: '订单完成', message: '订单 #12345 已成功处理', time: '2分钟前' },
                { type: 'warning', title: '库存警告', message: '商品 SKU-789 库存不足', time: '15分钟前' },
                { type: 'info', title: '系统通知', message: '系统将于今晚维护', time: '1小时前' },
                { type: 'success', title: '新用户注册', message: '今日新增 23 名用户', time: '2小时前' },
            ]
        };

        return {
            success: true,
            data: mockData[endpoint] || { message: 'Unknown endpoint' },
            delay: delay
        };
    },

    // 动画数字
    animateValue: function (element, start, end, duration = 1000) {
        const range = end - start;
        const startTime = performance.now();

        const update = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // 使用 easeOutQuart 缓动
            const easeProgress = 1 - Math.pow(1 - progress, 4);
            const current = Math.floor(start + range * easeProgress);

            element.textContent = this.formatNumber(current);

            if (progress < 1) {
                requestAnimationFrame(update);
            }
        };

        requestAnimationFrame(update);
    },

    // DOM 就绪
    ready: function (fn) {
        if (document.readyState !== 'loading') {
            fn();
        } else {
            document.addEventListener('DOMContentLoaded', fn);
        }
    }
};

console.log('[Utils] 工具模块加载完成');
