if (window.prefetch_list) {
    window.prefetch_list.forEach(function (url) {
        var link = document.createElement('link');
        link.rel = 'prefetch';

        if (url.endsWith('.js')) {
            link.as = 'script';
        } else if (url.endsWith('.css')) {
            link.as = 'style';
        }

        link.crossOrigin = 'anonymous';

        link.href = url;
        document.head.appendChild(link);
    });
}