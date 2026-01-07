/**
 * Lazy Module 3 - 通知模块（模拟懒加载）
 */
console.log('[LazyModule3] 加载通知模块...');

(async function () {
    const container = document.getElementById('notificationsContainer');

    const response = await AppUtils.mockFetch('/api/notifications', { baseDelay: 280, variance: 100 });
    const notifications = response.data;

    const iconMap = {
        success: '✅',
        warning: '⚠️',
        info: 'ℹ️'
    };

    container.innerHTML = notifications.map((item, index) => `
        <div class="notification-item" style="animation-delay: ${index * 0.1}s">
            <div class="notification-icon ${item.type}">${iconMap[item.type]}</div>
            <div class="notification-content">
                <h4>${item.title}</h4>
                <p>${item.message}</p>
                <small style="color: #64748b">${item.time}</small>
            </div>
        </div>
    `).join('');

    console.log('[LazyModule3] 通知渲染完成');
})();
