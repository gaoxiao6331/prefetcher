/**
 * Vendor.js - 模拟第三方库
 * 这个文件模拟了常见的第三方库代码
 */

console.log('[Vendor] 加载第三方库...');

// 模拟一些第三方库初始化
window.VendorLib = {
    version: '1.0.0',

    // 模拟 lodash 风格的工具函数
    debounce: function (fn, delay) {
        let timer = null;
        return function (...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), delay);
        };
    },

    throttle: function (fn, limit) {
        let inThrottle;
        return function (...args) {
            if (!inThrottle) {
                fn.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    },

    // 模拟 axios 风格的请求
    request: async function (options) {
        const { url, method = 'GET', delay = 0 } = options;

        // 模拟网络延迟
        await new Promise(resolve => setTimeout(resolve, delay));

        return {
            status: 200,
            data: { success: true, url, method }
        };
    },

    // 模拟 moment 风格的日期格式化
    formatDate: function (date, format = 'YYYY-MM-DD') {
        const d = new Date(date);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');

        return format
            .replace('YYYY', year)
            .replace('MM', month)
            .replace('DD', day)
            .replace('HH', hours)
            .replace('mm', minutes);
    },

    // 模拟 uuid 生成
    uuid: function () {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
};

// 模拟一些初始化时间
(function () {
    const startTime = performance.now();

    // 模拟一些计算密集型初始化
    let result = 0;
    for (let i = 0; i < 100000; i++) {
        result += Math.sqrt(i);
    }

    const endTime = performance.now();
    console.log(`[Vendor] 初始化完成，耗时: ${(endTime - startTime).toFixed(2)}ms`);
})();
