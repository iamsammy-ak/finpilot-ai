import type { Category, Transaction } from '../types';
import { addMonths, fmtDayMonth, monthKey, monthLabel } from '../lib/dates';
import { median, money, pct, round2 } from '../lib/format';
import { byCategory, inMonth } from './metrics';
import { recurringKeyOf, type Recurring } from './recurring';

export interface Anomaly {
  id: string;
  kind: 'transaction' | 'category';
  category: Category;
  title: string;
  detail: string;
  /** Amount above the normal level. */
  excess: number;
  date?: string;
  txId?: string;
}

/**
 * Two kinds of anomaly:
 * - a single purchase at least twice the typical (median) purchase in its
 *   category and at least €25 above it, ignoring recurring bills;
 * - a category whose month total is 30%+ (and at least €30) above its average
 *   for the previous three months.
 */
export function detectAnomalies(
  txs: Transaction[],
  from: string,
  to: string,
  focusMonth: string,
  recurring: Recurring[],
): Anomaly[] {
  const recurringKeys = new Set(recurring.map((r) => r.key));
  const pool = new Map<Category, Transaction[]>();
  for (const t of txs) {
    if (t.type !== 'expense' || recurringKeys.has(recurringKeyOf(t))) continue;
    const list = pool.get(t.category);
    if (list) list.push(t);
    else pool.set(t.category, [t]);
  }
  const out: Anomaly[] = [];
  for (const [category, list] of pool) {
    for (const t of list) {
      if (t.date < from || t.date > to) continue;
      const others = list.filter((o) => o.id !== t.id).map((o) => o.amount);
      if (others.length < 3) continue;
      const typical = median(others);
      if (t.amount >= typical * 2 && t.amount - typical >= 25) {
        out.push({
          id: `tx-${t.id}`,
          kind: 'transaction',
          category,
          title: `${t.merchant}: ${money(t.amount)} on ${fmtDayMonth(t.date)}`,
          detail: `${(t.amount / typical).toFixed(1)}× your typical ${category} purchase of ${money(typical)}.`,
          excess: round2(t.amount - typical),
          date: t.date,
          txId: t.id,
        });
      }
    }
  }

  const basis = [1, 2, 3].map((n) => addMonths(focusMonth, -n)).filter((m) => inMonth(txs, m).length > 0);
  if (basis.length && monthKey(to) >= focusMonth) {
    const avg = new Map<Category, number>();
    for (const m of basis) for (const c of byCategory(inMonth(txs, m))) avg.set(c.category, (avg.get(c.category) ?? 0) + c.amount / basis.length);
    for (const c of byCategory(inMonth(txs, focusMonth))) {
      const a = avg.get(c.category) ?? 0;
      if (a > 0 && c.amount >= a * 1.3 && c.amount - a >= 30) {
        out.push({
          id: `cat-${focusMonth}-${c.category}`,
          kind: 'category',
          category: c.category,
          title: `${c.category} is ${pct(c.amount / a - 1, 0)} above normal`,
          detail: `${money(c.amount)} in ${monthLabel(focusMonth)} against an average of ${money(a)} over the previous ${basis.length === 1 ? 'month' : `${basis.length} months`}.`,
          excess: round2(c.amount - a),
        });
      }
    }
  }
  return out.sort((a, b) => b.excess - a.excess);
}

export interface CategoryDelta {
  category: Category;
  current: number;
  previous: number;
  delta: number;
  /** null when there was nothing to compare with. */
  change: number | null;
}

/** Spending per category in two sets of transactions, side by side. */
export function categoryDeltas(current: Transaction[], previous: Transaction[]): CategoryDelta[] {
  const cur = new Map(byCategory(current).map((c) => [c.category, c.amount]));
  const prev = new Map(byCategory(previous).map((c) => [c.category, c.amount]));
  const cats = new Set<Category>([...cur.keys(), ...prev.keys()]);
  return [...cats]
    .map((category) => {
      const c = cur.get(category) ?? 0;
      const p = prev.get(category) ?? 0;
      return { category, current: c, previous: p, delta: round2(c - p), change: p > 0 ? (c - p) / p : null };
    })
    .sort((a, b) => b.current - a.current);
}
