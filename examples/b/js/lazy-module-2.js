/**
 * Lazy Module 2 - 表格模块（模拟懒加载）
 */
console.log('[LazyModule2] 加载表格模块...');

(async function () {
    const container = document.getElementById('tableContainer');

    const response = await AppUtils.mockFetch('/api/table', { baseDelay: 300, variance: 120 });
    const tableData = response.data;

    const statusColors = {
        active: '#10b981',
        pending: '#f59e0b',
        inactive: '#ef4444'
    };

    const statusLabels = {
        active: '活跃',
        pending: '待处理',
        inactive: '未激活'
    };

    container.innerHTML = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>ID</th>
                    <th>名称</th>
                    <th>状态</th>
                    <th>金额</th>
                </tr>
            </thead>
            <tbody>
                ${tableData.map(row => `
                    <tr>
                        <td>#${row.id}</td>
                        <td>${row.name}</td>
                        <td><span style="color: ${statusColors[row.status]}">${statusLabels[row.status]}</span></td>
                        <td>¥${AppUtils.formatNumber(row.amount)}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;

    console.log('[LazyModule2] 表格渲染完成');
})();
