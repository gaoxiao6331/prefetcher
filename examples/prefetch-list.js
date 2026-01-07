/**
 * Prefetch List - Site B 的资源列表
 * 这个文件会被 Site A 通过 ?prefetch=/prefetch-list.js 参数加载
 * 加载后会在 window 上挂载 prefetch_list 数组
 */
window.prefetch_list = [
    // CSS 文件
    '/b/css/base.css',
    '/b/css/components.css',
    '/b/css/animations.css',
    // 同步加载的 JS 文件
    '/b/js/vendor.js',
    '/b/js/utils.js',
    '/b/js/main.js',
    // 懒加载的 JS 模块
    '/b/js/lazy-module-1.js',
    '/b/js/lazy-module-2.js',
    '/b/js/lazy-module-3.js'
];

console.log('[prefetch-list.js] 已加载资源列表，共', window.prefetch_list.length, '个资源');
