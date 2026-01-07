/**
 * Lazy Module 1 - 图表模块（模拟懒加载）
 */
console.log('[LazyModule1] 加载图表模块...');

(async function () {
    const container = document.getElementById('chartContainer');

    // 模拟 API 请求获取图表数据
    const response = await AppUtils.mockFetch('/api/chart', { baseDelay: 350, variance: 150 });
    const chartData = response.data;

    // 渲染图表
    container.innerHTML = '<div class="chart-bars"></div>';
    const barsContainer = container.querySelector('.chart-bars');

    chartData.forEach((value, index) => {
        const bar = document.createElement('div');
        bar.className = 'chart-bar';
        bar.style.height = `${value * 1.8}px`;
        bar.style.animationDelay = `${index * 0.1}s`;
        bar.title = `数值: ${value}`;
        barsContainer.appendChild(bar);
    });

    console.log('[LazyModule1] 图表渲染完成');
})();
