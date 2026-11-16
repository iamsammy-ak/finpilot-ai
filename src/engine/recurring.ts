import type { Category, Transaction, TxType } from '../types';
import { addMonths, dateInMonth, dayOf, diffDays, monthKey, monthsBetween } from '../lib/dates';
import { merchantKey } from '../lib/categories';
import { median, round2 } from '../lib/format';

export interface Recurring {
  key: string;
  merchant: string;
  description: string;
  category: Category;
  type: TxType;
  /** Typical amount (median of past charges). */
  amount: number;
  /** Typical day of month. */
  day: number;
  occurrences: number;
  lastDate: string;
  /** Next expected booking date, or null if the series looks finished. */
  nextDate: string | null;
  paidThisMonth: boolean;
  isSubscription: boolean;
}

/**
 * A merchant is treated as recurring when it charges roughly once a month, in
 * at least two consecutive months with no gaps, for a stable amount (within
 * 10%) on a stable day (within 4 days). Anything in the Subscriptions
 * category seen at least once is also tracked.
 */
export function detectRecurring(txs: Transaction[], today: string): Recurring[] {
  const groups = new Map<string, Transaction[]>();
  for (const t of txs) {
    const key = `${t.type}:${merchantKey(t.merchant)}`;
    const g = groups.get(key);
    if (g) g.push(t);
    else groups.set(key, [t]);
  }
  const cur = monthKey(today);
  const out: Recurring[] = [];
  for (const [key, list] of groups) {
    list.sort((a, b) => a.date.localeCompare(b.date));
    const months = new Set(list.map((t) => monthKey(t.date)));
    const amounts = list.map((t) => t.amount);
    const days = list.map((t) => dayOf(t.date));
    const med = median(amounts);
    const last = list[list.length - 1];
    const isSub = last.category === 'Subscriptions';

    const span = monthsBetween(monthKey(list[0].date), monthKey(last.date)).length;
    const monthly = months.size >= 2 && months.size === span && list.length <= Math.ceil(months.size * 1.34);
    const stableAmount = med > 0 && (Math.max(...amounts) - Math.min(...amounts)) / med <= 0.1;
    const stableDay = Math.max(...days) - Math.min(...days) <= 4;
    const qualifies = (monthly && stableAmount && stableDay) || (isSub && list.length <= Math.ceil(months.size * 1.34));
    if (!qualifies) continue;

    const day = Math.round(median(days));
    const paidThisMonth = monthKey(last.date) === cur;
    // A series is "active" if it was charged in this or the previous month.
    const active = diffDays(last.date, today) <= 45;
    let nextDate: string | null = null;
    if (active) {
      const candidate = dateInMonth(cur, day);
      if (paidThisMonth) nextDate = dateInMonth(addMonths(cur, 1), day);
      else if (diffDays(candidate, today) <= 5) nextDate = candidate; // due, or a few days late
      else nextDate = dateInMonth(addMonths(cur, 1), day);
    }
    out.push({
      key,
      merchant: last.merchant,
      description: last.description,
      category: last.category,
      type: last.type,
      amount: round2(med),
      day,
      occurrences: list.length,
      lastDate: last.date,
      nextDate,
      paidThisMonth,
      isSubscription: isSub,
    });
  }
  return out.sort((a, b) => b.amount - a.amount);
}

export const recurringKeyOf = (t: Transaction) => `${t.type}:${merchantKey(t.merchant)}`;

export interface Upcoming extends Recurring {
  nextDate: string;
  daysAway: number;
}

/** Recurring payments expected within `horizon` days. */
export function upcomingPayments(recurring: Recurring[], today: string, horizon = 35): Upcoming[] {
  return recurring
    .filter((r): r is Recurring & { nextDate: string } => r.type === 'expense' && r.nextDate !== null)
    .map((r) => ({ ...r, daysAway: diffDays(today, r.nextDate) }))
    .filter((r) => r.daysAway <= horizon)
    .sort((a, b) => a.nextDate.localeCompare(b.nextDate));
}
