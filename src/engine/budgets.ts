import type { Budgets, Category, Transaction } from '../types';
import { EXPENSE_CATEGORIES } from '../types';
import { addMonths, dayOf, daysInMonth, monthLabel } from '../lib/dates';
import { round2 } from '../lib/format';
import { byCategory, inMonth, isInProgress } from './metrics';

/** 'full' = exactly at the limit (e.g. rent equal to its budget); 'over' = past it. */
export type BudgetLevel = 'ok' | 'warn80' | 'warn90' | 'full' | 'over';

export interface BudgetRow {
  category: Category;
  budget: number;
  spent: number;
  remaining: number;
  /** spent / budget; 0 when no budget is set. */
  used: number;
  level: BudgetLevel;
  /** Share of the month elapsed minus share of budget used — negative means spending ahead of pace. */
  pace: number;
}

export interface BudgetStatus {
  month: string;
  rows: BudgetRow[];
  /** Categories with spending this month but no budget. */
  unbudgeted: { category: Category; spent: number }[];
  allocated: number;
  monthlyBudget: number;
  unallocated: number;
  totalSpent: number;
  totalUsed: number;
  totalLevel: BudgetLevel;
  /** Sum of amounts above budget across categories. */
  overspend: number;
  elapsed: number;
}

export const levelFor = (used: number): BudgetLevel =>
  used > 1.00001 ? 'over' : used >= 1 ? 'full' : used >= 0.9 ? 'warn90' : used >= 0.8 ? 'warn80' : 'ok';

export function budgetStatus(
  txs: Transaction[],
  budgets: Budgets,
  monthlyBudget: number,
  month: string,
  today: string,
): BudgetStatus {
  const spentBy = new Map(byCategory(inMonth(txs, month)).map((c) => [c.category, c.amount]));
  const elapsed = isInProgress(month, today) ? dayOf(today) / daysInMonth(month) : 1;
  const rows: BudgetRow[] = [];
  const unbudgeted: BudgetStatus['unbudgeted'] = [];
  for (const category of EXPENSE_CATEGORIES) {
    const budget = budgets[category] ?? 0;
    const spent = spentBy.get(category) ?? 0;
    if (budget > 0) {
      const used = spent / budget;
      rows.push({
        category,
        budget,
        spent,
        remaining: round2(budget - spent),
        used,
        level: levelFor(used),
        pace: elapsed - used,
      });
    } else if (spent > 0) {
      unbudgeted.push({ category, spent });
    }
  }
  const allocated = round2(rows.reduce((s, r) => s + r.budget, 0));
  const totalSpent = round2([...spentBy.values()].reduce((s, x) => s + x, 0));
  const limit = monthlyBudget > 0 ? monthlyBudget : allocated;
  const totalUsed = limit > 0 ? totalSpent / limit : 0;
  return {
    month,
    rows,
    unbudgeted,
    allocated,
    monthlyBudget: limit,
    unallocated: round2(limit - allocated),
    totalSpent,
    totalUsed,
    totalLevel: levelFor(totalUsed),
    overspend: round2(rows.reduce((s, r) => s + Math.max(0, r.spent - r.budget), 0)),
    elapsed,
  };
}

export interface BudgetRecommendation {
  category: Category;
  current: number;
  suggested: number;
  average: number;
  reason: string;
  kind: 'raise' | 'lower' | 'new';
}

const roundTo5 = (n: number) => Math.max(5, Math.ceil(n / 5) * 5);

/**
 * Compare each budget with the average of the three months before `month`.
 * Suggest a budget 5% above that average, rounded up to the nearest 5, when
 * the current budget is clearly too tight (average is more than 10% over) or
 * clearly too loose (average is below 75% of it), or when there is none.
 */
export function budgetRecommendations(txs: Transaction[], budgets: Budgets, month: string): BudgetRecommendation[] {
  const basis = [1, 2, 3].map((n) => addMonths(month, -n)).filter((m) => inMonth(txs, m).length > 0);
  if (!basis.length) return [];
  const sums = new Map<Category, number>();
  for (const m of basis) for (const c of byCategory(inMonth(txs, m))) sums.set(c.category, (sums.get(c.category) ?? 0) + c.amount);
  const span = basis.length === 1 ? monthLabel(basis[0]) : `the last ${basis.length} months`;
  const out: BudgetRecommendation[] = [];
  for (const category of EXPENSE_CATEGORIES) {
    const average = round2((sums.get(category) ?? 0) / basis.length);
    const current = budgets[category] ?? 0;
    const suggested = roundTo5(average * 1.05);
    if (current === 0 && average >= 5) {
      out.push({ category, current, suggested, average, kind: 'new', reason: `No budget set, but you averaged this much over ${span}.` });
    } else if (current > 0 && average > current * 1.1) {
      out.push({ category, current, suggested, average, kind: 'raise', reason: `You regularly spend more than this budget (average over ${span}). Raise it to a realistic level, or cut back.` });
    } else if (current > 0 && average < current * 0.75 && current - suggested >= 5) {
      out.push({ category, current, suggested, average, kind: 'lower', reason: `You consistently spend well under this budget (average over ${span}). Lowering it frees money for savings.` });
    }
  }
  return out.sort((a, b) => Math.abs(b.suggested - b.current) - Math.abs(a.suggested - a.current));
}
