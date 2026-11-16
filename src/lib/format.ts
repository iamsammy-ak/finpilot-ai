let currency = 'EUR';
let fmt2 = new Intl.NumberFormat('en-IE', { style: 'currency', currency, minimumFractionDigits: 2 });
let fmt0 = new Intl.NumberFormat('en-IE', { style: 'currency', currency, maximumFractionDigits: 0 });

export function setCurrency(code: string) {
  if (code === currency) return;
  currency = code;
  fmt2 = new Intl.NumberFormat('en-IE', { style: 'currency', currency, minimumFractionDigits: 2 });
  fmt0 = new Intl.NumberFormat('en-IE', { style: 'currency', currency, maximumFractionDigits: 0 });
}

export const currencySymbol = () => fmt0.format(0).replace(/[\d\s.,]/g, '') || '€';

/** €1,234.56 */
export const money = (n: number) => fmt2.format(round2(n));
/** €1,235 — for axes, chips and other tight spots. */
export const money0 = (n: number) => fmt0.format(Math.round(n));
/** +€120.00 / −€45.10 */
export const moneySigned = (n: number) => `${n >= 0 ? '+' : '−'}${fmt2.format(Math.abs(round2(n)))}`;
/** Compact axis ticks: €1.2k */
export const moneyAxis = (n: number) => {
  const a = Math.abs(n);
  const s = currencySymbol();
  if (a >= 1000) return `${n < 0 ? '−' : ''}${s}${(a / 1000).toFixed(a >= 10000 ? 0 : 1).replace(/\.0$/, '')}k`;
  return `${n < 0 ? '−' : ''}${s}${Math.round(a)}`;
};

/** 0.243 → 24.3% */
export const pct = (ratio: number, digits = 1) => `${(ratio * 100).toFixed(digits).replace(/\.0$/, '')}%`;
export const pctSigned = (ratio: number, digits = 1) =>
  `${ratio >= 0 ? '+' : '−'}${Math.abs(ratio * 100)
    .toFixed(digits)
    .replace(/\.0$/, '')}%`;

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export const sum = (xs: number[]) => round2(xs.reduce((a, b) => a + b, 0));
export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
export const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
export const stdev = (xs: number[]) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};
export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Relative change; null when the base is zero (nothing meaningful to compare with). */
export const change = (current: number, previous: number): number | null =>
  Math.abs(previous) < 0.005 ? null : (current - previous) / Math.abs(previous);

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const uid = () =>
  `TX-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
