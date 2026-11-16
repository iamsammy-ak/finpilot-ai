import type { Category, DateRange, RangeSelection, Transaction } from '../types';
import {
  addDays,
  addMonths,
  dayOf,
  daysInMonth,
  diffDays,
  eachDay,
  fmtDayMonth,
  monthEnd,
  monthKey,
  monthLabel,
  monthShort,
  monthStart,
  monthsBetween,
} from '../lib/dates';
import { merchantKey } from '../lib/categories';
import { round2 } from '../lib/format';

export interface Totals {
  income: number;
  expenses: number;
  net: number;
  /** net / income, 0 when there is no income. */
  savingsRate: number;
  count: number;
}

export const inRange = (txs: Transaction[], from: string, to: string) =>
  txs.filter((t) => t.date >= from && t.date <= to);

export const inMonth = (txs: Transaction[], mk: string) => txs.filter((t) => t.date.startsWith(mk));

export function totals(txs: Transaction[]): Totals {
  let income = 0;
  let expenses = 0;
  for (const t of txs) {
    if (t.type === 'income') income += t.amount;
    else expenses += t.amount;
  }
  income = round2(income);
  expenses = round2(expenses);
  const net = round2(income - expenses);
  return { income, expenses, net, savingsRate: income > 0 ? net / income : 0, count: txs.length };
}

export interface CategoryTotal {
  category: Category;
  amount: number;
  count: number;
  /** Share of the total for this transaction type, 0–1. */
  share: number;
}

export function byCategory(txs: Transaction[], type: 'expense' | 'income' = 'expense'): CategoryTotal[] {
  const map = new Map<Category, { amount: number; count: number }>();
  let total = 0;
  for (const t of txs) {
    if (t.type !== type) continue;
    const e = map.get(t.category) ?? { amount: 0, count: 0 };
    e.amount += t.amount;
    e.count += 1;
    map.set(t.category, e);
    total += t.amount;
  }
  return [...map.entries()]
    .map(([category, e]) => ({
      category,
      amount: round2(e.amount),
      count: e.count,
      share: total > 0 ? e.amount / total : 0,
    }))
    .sort((a, b) => b.amount - a.amount);
}

export interface MerchantTotal {
  key: string;
  merchant: string;
  category: Category;
  amount: number;
  count: number;
  share: number;
}

export function byMerchant(txs: Transaction[], type: 'expense' | 'income' = 'expense'): MerchantTotal[] {
  const map = new Map<string, MerchantTotal>();
  let total = 0;
  for (const t of txs) {
    if (t.type !== type) continue;
    const key = merchantKey(t.merchant) || t.merchant.toLowerCase();
    const e = map.get(key) ?? { key, merchant: t.merchant, category: t.category, amount: 0, count: 0, share: 0 };
    e.amount += t.amount;
    e.count += 1;
    map.set(key, e);
    total += t.amount;
  }
  return [...map.values()]
    .map((e) => ({ ...e, amount: round2(e.amount), share: total > 0 ? e.amount / total : 0 }))
    .sort((a, b) => b.amount - a.amount);
}

/** Every month from the first transaction to the later of the last transaction and today. */
export function allMonths(txs: Transaction[], today: string): string[] {
  if (!txs.length) return [monthKey(today)];
  let first = txs[0].date;
  let last = txs[0].date;
  for (const t of txs) {
    if (t.date < first) first = t.date;
    if (t.date > last) last = t.date;
  }
  const end = monthKey(last) > monthKey(today) ? monthKey(last) : monthKey(today);
  return monthsBetween(monthKey(first), end);
}

export interface MonthPoint extends Totals {
  month: string;
  label: string;
  opening: number;
  closing: number;
  /** True for the current calendar month while it is still running. */
  inProgress: boolean;
}

export const isInProgress = (mk: string, today: string) => mk === monthKey(today) && today < monthEnd(mk);

export function monthlySeries(txs: Transaction[], openingBalance: number, today: string): MonthPoint[] {
  const months = allMonths(txs, today);
  const buckets = new Map<string, Transaction[]>();
  for (const t of txs) {
    const mk = monthKey(t.date);
    const b = buckets.get(mk);
    if (b) b.push(t);
    else buckets.set(mk, [t]);
  }
  let balance = openingBalance;
  return months.map((month) => {
    const tt = totals(buckets.get(month) ?? []);
    const opening = round2(balance);
    balance = round2(balance + tt.net);
    return {
      month,
      label: monthShort(month),
      ...tt,
      opening,
      closing: balance,
      inProgress: isInProgress(month, today),
    };
  });
}

/** Account balance at the end of `date` (inclusive). */
export function balanceAt(txs: Transaction[], openingBalance: number, date: string): number {
  let b = openingBalance;
  for (const t of txs) if (t.date <= date) b += t.type === 'income' ? t.amount : -t.amount;
  return round2(b);
}

export interface DayPoint {
  date: string;
  day: number;
  income: number;
  expenses: number;
  balance: number;
}

export function dailySeries(txs: Transaction[], openingBalance: number, from: string, to: string): DayPoint[] {
  const inc = new Map<string, number>();
  const exp = new Map<string, number>();
  let balance = openingBalance;
  for (const t of txs) {
    if (t.date < from) balance += t.type === 'income' ? t.amount : -t.amount;
    else if (t.date <= to) {
      const m = t.type === 'income' ? inc : exp;
      m.set(t.date, (m.get(t.date) ?? 0) + t.amount);
    }
  }
  return eachDay(from, to).map((date) => {
    const income = round2(inc.get(date) ?? 0);
    const expenses = round2(exp.get(date) ?? 0);
    balance = round2(balance + income - expenses);
    return { date, day: dayOf(date), income, expenses, balance };
  });
}

/* ------------------------------------------------------------------ */
/* Date ranges                                                         */
/* ------------------------------------------------------------------ */

export function resolveRange(sel: RangeSelection, txs: Transaction[], today: string): DateRange {
  const cur = monthKey(today);
  switch (sel.preset) {
    case 'month': {
      const mk = sel.month ?? cur;
      return { from: monthStart(mk), to: monthEnd(mk), label: monthLabel(mk) };
    }
    case 'last3':
      return { from: monthStart(addMonths(cur, -2)), to: monthEnd(cur), label: 'Last 3 months' };
    case 'last6':
      return { from: monthStart(addMonths(cur, -5)), to: monthEnd(cur), label: 'Last 6 months' };
    case 'ytd':
      return { from: `${cur.slice(0, 4)}-01-01`, to: monthEnd(cur), label: 'Year to date' };
    case 'custom': {
      const from = sel.from ?? monthStart(cur);
      const to = sel.to ?? today;
      return from <= to
        ? { from, to, label: `${fmtDayMonth(from)} – ${fmtDayMonth(to)}` }
        : { from: to, to: from, label: `${fmtDayMonth(to)} – ${fmtDayMonth(from)}` };
    }
    case 'all':
    default: {
      const months = allMonths(txs, today);
      return { from: monthStart(months[0]), to: monthEnd(months[months.length - 1]), label: 'All time' };
    }
  }
}

/** True when the range is exactly one calendar month. */
export const isSingleMonth = (r: DateRange) =>
  monthKey(r.from) === monthKey(r.to) && r.from === monthStart(monthKey(r.from)) && r.to === monthEnd(monthKey(r.to));

/**
 * The period a range is compared against.
 * - A calendar month compares with the month before it. If the month is still
 *   running, both sides are cut at the same day so the comparison is fair.
 * - Anything else compares with the same number of days immediately before.
 */
export function comparisonFor(range: DateRange, today: string): { current: DateRange; previous: DateRange } {
  if (isSingleMonth(range)) {
    const mk = monthKey(range.from);
    const prev = addMonths(mk, -1);
    if (isInProgress(mk, today)) {
      const day = Math.min(dayOf(today), daysInMonth(prev));
      const prevTo = `${prev}-${String(day).padStart(2, '0')}`;
      return {
        current: { from: range.from, to: today, label: `${monthShort(mk)} 1–${dayOf(today)}` },
        previous: { from: monthStart(prev), to: prevTo, label: `1–${day} ${monthShort(prev)}` },
      };
    }
    return { current: range, previous: { from: monthStart(prev), to: monthEnd(prev), label: monthShort(prev) } };
  }
  const to = range.to > today && range.from <= today ? today : range.to;
  const len = diffDays(range.from, to) + 1;
  const prevTo = addDays(range.from, -1);
  return {
    current: { ...range, to },
    previous: { from: addDays(prevTo, -(len - 1)), to: prevTo, label: `previous ${len} days` },
  };
}
