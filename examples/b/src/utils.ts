export type Stats = { users: number; orders: number; revenue: number };
export type TableRow = { id: number; name: string; status: string; amount: number };
export type Notification = { time: string; type: string; title: string; message: string };

export const Utils = {
  formatNumber(num: number): string {
    return new Intl.NumberFormat('zh-CN').format(num);
  },
  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(amount);
  },
  randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  },
  async randomDelay(baseDelay = 300, variance = 150): Promise<void> {
    const delay = baseDelay + Math.random() * variance;
    return new Promise((resolve) => setTimeout(resolve, delay));
  },
  async mockFetch(endpoint: string, opts: { baseDelay?: number; variance?: number } = {}) {
    const { baseDelay = 300, variance = 150 } = opts;
    await this.randomDelay(baseDelay, variance);
    switch (endpoint) {
      case '/api/stats':
        return {
          data: {
            users: this.randomInt(10000, 60000),
            orders: this.randomInt(1000, 8000),
            revenue: this.randomInt(100000, 800000),
          } as Stats,
        };
      case '/api/chart':
        return { data: Array.from({ length: 12 }, () => this.randomInt(100, 1000)) as number[] };
      case '/api/table':
        return {
          data: Array.from({ length: 10 }, (_, i) => ({
            id: i + 1,
            name: `条目-${i + 1}`,
            status: ['进行中', '已完成', '待处理'][this.randomInt(0, 2)],
            amount: this.randomInt(1000, 20000),
          })) as TableRow[],
        };
      case '/api/notifications':
        return {
          data: Array.from({ length: 5 }, () => ({
            time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
            type: ['INFO', 'WARN', 'ERROR'][this.randomInt(0, 2)],
            title: '系统消息',
            message: '这是一条模拟通知，用于性能测试。',
          })) as Notification[],
        };
      default:
        return { data: null };
    }
  },
};