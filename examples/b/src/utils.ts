export type Stats = { users: number; orders: number; revenue: number };
export type TableRow = { id: number; name: string; status: string; amount: number };
export type Notification = { time: string; type: string; title: string; message: string };

export const Utils = {
  formatNumber(num: number): string {
    return new Intl.NumberFormat('en-US').format(num);
  },
  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  },
  async delay(ms = 100): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  },
  async mockFetch(endpoint: string, opts: { baseDelay?: number } = {}) {
    const { baseDelay = 100 } = opts; // variance is now ignored
    await this.delay(baseDelay);

    const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

    switch (endpoint) {
      case '/api/stats':
        return {
          data: {
            users: randomInt(10000, 60000),
            orders: randomInt(1000, 8000),
            revenue: randomInt(100000, 800000),
          } as Stats,
        };
      case '/api/chart':
        return { data: Array.from({ length: 12 }, () => randomInt(100, 1000)) as number[] };
      case '/api/table':
        return {
          data: Array.from({ length: 10 }, (_, i) => ({
            id: i + 1,
            name: `Item-${i + 1}`,
            status: ['In Progress', 'Completed', 'Pending'][randomInt(0, 2)],
            amount: randomInt(1000, 20000),
          })) as TableRow[],
        };
      case '/api/notifications':
        return {
          data: Array.from({ length: 5 }, () => ({
            time: new Date().toLocaleTimeString('en-US', { hour12: false }),
            type: ['INFO', 'WARN', 'ERROR'][randomInt(0, 2)],
            title: 'System Message',
            message: 'This is a mock notification for performance testing.',
          })) as Notification[],
        };
      default:
        return { data: null };
    }
  },
};