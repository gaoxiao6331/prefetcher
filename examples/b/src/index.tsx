import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Utils } from './utils';
import type { TableRow, Notification } from './utils';
import './styles.css';

function StatNumber({ label, endpoint, duration = 1200 }: { label: string; endpoint: string; duration?: number }) {
  const [value, setValue] = useState<number | null>(null);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      const res = await Utils.mockFetch(endpoint, { baseDelay: 200 });
      // Decide the target value based on the returned data type and label, ensuring it's a number
      const data = res.data;
      const target: number = typeof data === 'number' ? data : ((data as Record<string, number>)?.[label] ?? 0);
      const startValue = 0;
      const startTime = performance.now();

      const step = (t: number) => {
        const progress = Math.min((t - startTime) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 4);
        const current = Math.floor(startValue + (target - startValue) * eased);
        if (isMounted) setValue(current);
        if (progress < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    })();
    return () => { isMounted = false; };
  }, [endpoint, label, duration]);

  return (
    <div className="stat-item">
      <span className="stat-value">{value === null ? '--' : Utils.formatNumber(value)}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

function Dashboard() {
  const [chartData, setChartData] = useState<number[] | null>(null);
  const [tableData, setTableData] = useState<TableRow[] | null>(null);
  const [notifications, setNotifications] = useState<Notification[] | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [chartRes, tableRes, notifRes] = await Promise.all([
        Utils.mockFetch('/api/chart', { baseDelay: 300 }),
        Utils.mockFetch('/api/table', { baseDelay: 350 }),
        Utils.mockFetch('/api/notifications', { baseDelay: 250 }),
      ]);
      if (!alive) return;
      setChartData(chartRes.data as number[]);
      setTableData(tableRes.data as TableRow[]);
      setNotifications(notifRes.data as Notification[]);

      // Lazy-load non-critical analytics when chart data is available
      if (chartRes.data && Array.isArray(chartRes.data)) {
        import('./nc-analytics').then(mod => {
          mod.initAnalytics(chartRes.data as number[]);
        }).catch(() => {});
      }
    })();
    return () => { alive = false; };
  }, []);

  return (
    <section className="dashboard">
      <div className="card card-chart">
        <h3>📈 Data Chart</h3>
        <div className="chart-placeholder">
          {chartData ? (
            <div>Chart: {chartData.join(', ')}</div>
          ) : (
            <div className="loading-spinner" />
          )}
        </div>
      </div>
      <div className="card card-table">
        <h3>📋 Data List</h3>
        <div className="table-placeholder">
          {tableData ? (
            <ul>
              {tableData.map((row) => (
                <li key={row.id}>{`${row.name} - ${row.status} - ${Utils.formatCurrency(row.amount)}`}</li>
              ))}
            </ul>
          ) : (
            <div className="loading-spinner" />
          )}
        </div>
      </div>
      <div className="card card-notifications">
        <h3>🔔 Notification Center</h3>
        <div className="notifications-placeholder">
          {notifications ? (
            <ul>
              {notifications.map((n, i) => (
                <li key={i}>{`${n.time} - [${n.type}] ${n.title}: ${n.message}`}</li>
              ))}
            </ul>
          ) : (
            <div className="loading-spinner" />
          )}
        </div>
      </div>
    </section>
  );
}

function PerfPanel() {
  const [metrics, setMetrics] = useState<{ ttfb: number | null; fcp: number | null; lcp: number | null; fid: number | null; cls: number | null; loadTime: number | null }>({ ttfb: null, fcp: null, lcp: null, fid: null, cls: null, loadTime: null });

  useEffect(() => {
    const perfMetrics: { ttfb: number | null; fcp: number | null; lcp: number | null; fid: number | null; cls: number | null; loadTime: number | null } = { ttfb: null, fcp: null, lcp: null, fid: null, cls: null, loadTime: null };

    function getNavigationTiming() {
      const [entry] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
      if (entry) {
        perfMetrics.ttfb = entry.responseStart - entry.requestStart;
        perfMetrics.loadTime = entry.loadEventEnd - entry.fetchStart;
        setMetrics({ ...perfMetrics });
      }
    }

    const fcpObserver = new PerformanceObserver((entryList) => {
      const entries = entryList.getEntries();
      const fcp = entries.find((e) => e.name === 'first-contentful-paint');
      if (fcp) {
        perfMetrics.fcp = fcp.startTime;
        setMetrics({ ...perfMetrics });
      }
    });
    fcpObserver.observe({ entryTypes: ['paint'] });

    const lcpObserver = new PerformanceObserver((entryList) => {
      const entries = entryList.getEntries();
      const lastEntry = entries[entries.length - 1];
      perfMetrics.lcp = lastEntry.startTime;
      setMetrics({ ...perfMetrics });
    });
    lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });

    const fidObserver = new PerformanceObserver((entryList) => {
      const entries = entryList.getEntries();
      if (entries.length > 0) {
        // @ts-ignore
        perfMetrics.fid = entries[0].processingStart - entries[0].startTime;
        setMetrics({ ...perfMetrics });
      }
    });
    fidObserver.observe({ entryTypes: ['first-input'] });

    let clsValue = 0;
    const clsObserver = new PerformanceObserver((entryList) => {
      for (const entry of entryList.getEntries() as (PerformanceEntry & {
        hadRecentInput?: boolean;
        value?: number;
      })[]) {
        if (!entry.hadRecentInput) {
          clsValue += entry.value ?? 0;
        }
      }
      perfMetrics.cls = clsValue;
      setMetrics({ ...perfMetrics });
    });
    clsObserver.observe({ entryTypes: ['layout-shift'] });

    window.addEventListener('load', () => {
      setTimeout(getNavigationTiming, 0);
    });

    return () => {
      fcpObserver.disconnect();
      lcpObserver.disconnect();
      fidObserver.disconnect();
      clsObserver.disconnect();
    };
  }, []);

  const saveMetrics = () => {
    const mode = sessionStorage.getItem('navigationMode') || 'normal';
    const history = JSON.parse(localStorage.getItem('performanceHistory') || '[]');
    history.unshift({ timestamp: Date.now(), mode, ...metrics });
    if (history.length > 20) history.pop();
    localStorage.setItem('performanceHistory', JSON.stringify(history));
    alert('✅ Performance metrics saved! Return to Site A to see the comparison.');
  };

  const items = ['TTFB', 'FCP', 'LCP', 'FID', 'CLS', 'Total Load Time'] as const;
  const keys: (keyof typeof metrics)[] = ['ttfb', 'fcp', 'lcp', 'fid', 'cls', 'loadTime'];

  return (
    <section className="performance-panel">
      <h2>⚡ Page Performance Metrics</h2>
      <div className="perf-grid">
        {items.map((label, i) => {
          const key = keys[i];
          const val = metrics[key];
          const display = val === null ? 'Calculating...' : key === 'cls' ? (val as number).toFixed(3) : `${(val as number).toFixed(0)} ms`;
          return (
            <div className="perf-item" key={String(key)}>
              <span className="perf-label">{label}</span>
              <span className="perf-value">{display}</span>
            </div>
          );
        })}
      </div>
      <button className="save-btn" onClick={saveMetrics}>💾 Save to Site A</button>
    </section>
  );
}

function App() {
  // Lazy-load non-critical helpers after initial paint
  useEffect(() => {
    const timer = window.setTimeout(() => {
      import('./nc-helpers').then(mod => {
        mod.logEnvironment();
        if (mod.supportsWebGL()) {
          console.debug('[nc] WebGL supported; fancy format demo:', mod.fancyFormat('hello world from site b'));
        }
      }).catch(() => {});
    }, 1200);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <>
      <nav className="navbar">
        <div className="nav-brand">🎯 Site B</div>
        <div className="nav-links">
          <a href="#dashboard">Dashboard</a>
          <a href="#analytics">Analytics</a>
          <a href="#settings">Settings</a>
        </div>
        <a
          className="back-btn"
          onClick={() => history.back()}
        >← Back to Site A</a>
      </nav>
      <main className="main-content">
        <section className="hero">
          <h1>Welcome to Site B</h1>
          <p className="hero-subtitle">This is a complex page with multiple JS/CSS files and simulated API requests</p>
          <div className="hero-stats">
            <StatNumber label="users" endpoint="/api/stats" duration={1500} />
            <StatNumber label="orders" endpoint="/api/stats" duration={1200} />
            <StatNumber label="revenue" endpoint="/api/stats" duration={1500} />
          </div>
        </section>
        <Dashboard />
        <PerfPanel />
      </main>
      <footer className="footer">
        <p>Site B - Prefetch Performance Test Page</p>
      </footer>
    </>
  );
}

const rootEl = document.getElementById('root');
if (rootEl) {
  const root = createRoot(rootEl);
  root.render(<App />);
}


// Remove trailing lazy-load code placed outside of component (moved into App)