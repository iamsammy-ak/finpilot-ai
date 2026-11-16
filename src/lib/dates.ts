/**
 * Calendar-date helpers. Dates are plain `YYYY-MM-DD` strings and months are
 * `YYYY-MM` strings, so they sort lexicographically and never drift across
 * time zones the way `Date` timestamps do.
 */

const pad = (n: number) => String(n).padStart(2, '0');

export const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayISO = () => toISO(new Date());

export const parseISO = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

export const monthKey = (date: string) => date.slice(0, 7);
export const dayOf = (date: string) => Number(date.slice(8, 10));

export const daysInMonth = (mk: string) => {
  const [y, m] = mk.split('-').map(Number);
  return new Date(y, m, 0).getDate();
};

export const monthStart = (mk: string) => `${mk}-01`;
export const monthEnd = (mk: string) => `${mk}-${pad(daysInMonth(mk))}`;

export const addMonths = (mk: string, n: number) => {
  const [y, m] = mk.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};

export const addDays = (date: string, n: number) => {
  const d = parseISO(date);
  d.setDate(d.getDate() + n);
  return toISO(d);
};

/** Whole days from a to b (b - a). */
export const diffDays = (a: string, b: string) =>
  Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86_400_000);

/** A date in month `mk` on `day`, clamped to the month's length. */
export const dateInMonth = (mk: string, day: number) => `${mk}-${pad(Math.min(Math.max(1, day), daysInMonth(mk)))}`;

/** Inclusive list of months from a to b. */
export const monthsBetween = (a: string, b: string) => {
  const out: string[] = [];
  for (let m = a; m <= b && out.length < 600; m = addMonths(m, 1)) out.push(m);
  return out;
};

export const eachDay = (from: string, to: string) => {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 3700; d = addDays(d, 1)) out.push(d);
  return out;
};

/** 0 = Monday … 6 = Sunday. */
export const weekdayIndex = (date: string) => (parseISO(date).getDay() + 6) % 7;

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export const monthName = (mk: string) => MONTHS_LONG[Number(mk.slice(5, 7)) - 1];
export const monthShort = (mk: string) => MONTHS_SHORT[Number(mk.slice(5, 7)) - 1];
export const monthLabel = (mk: string) => `${monthName(mk)} ${mk.slice(0, 4)}`;
export const monthLabelShort = (mk: string) => `${monthShort(mk)} ${mk.slice(2, 4)}`;

export const fmtDate = (date: string) => `${dayOf(date)} ${monthShort(monthKey(date))} ${date.slice(0, 4)}`;
export const fmtDayMonth = (date: string) => `${dayOf(date)} ${monthShort(monthKey(date))}`;

export const isValidISO = (s: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = parseISO(s);
  return toISO(d) === s;
};
