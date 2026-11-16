import type { Budgets, Transaction } from '../types';
import { addMonths, monthEnd, monthLabel } from '../lib/dates';
import { clamp, mean, money, pct, round2, stdev } from '../lib/format';
import { budgetStatus } from './budgets';
import { byCategory, inMonth, monthlySeries } from './metrics';
import { projectMonth } from './forecast';
import { detectRecurring } from './recurring';

export type ComponentId = 'savings' | 'budget' | 'cashflow' | 'consistency';

export interface HealthComponent {
  id: ComponentId;
  label: string;
  /** 0–100 for this component. */
  score: number;
  /** Contribution to the total: score × 25%. */
  points: number;
  /** Short measured value, e.g. "20.9% savings rate". */
  value: string;
  /** How the component score is calculated. */
  method: string;
}

export interface HealthResult {
  month: string;
  score: number;
  grade: string;
  components: HealthComponent[];
  isProjected: boolean;
  /** Facts used by recommendations. */
  facts: {
    savingsRate: number;
    income: number;
    net: number;
    overspend: number;
    overCategories: { category: string; spent: number; budget: number }[];
    negativeMonths: number;
    months: number;
    netCv: number;
    expenseCv: number;
  };
}

export interface Health extends HealthResult {
  previous: HealthResult | null;
  changes: { label: string; delta: number; text: string }[];
  recommendations: string[];
}

export const WEIGHT = 0.25;
/** Savings rate that earns full marks. */
export const FULL_MARKS_SAVINGS_RATE = 0.3;

export const gradeFor = (score: number) =>
  score >= 85 ? 'Excellent' : score >= 70 ? 'Strong' : score >= 55 ? 'Fair' : score >= 40 ? 'Needs attention' : 'At risk';

export function scoreMonth(
  allTxs: Transaction[],
  budgets: Budgets,
  monthlyBudget: number,
  openingBalance: number,
  month: string,
  today: string,
): HealthResult {
  // Only what was known by the end of this month counts towards its score.
  const txs = allTxs.filter((t) => t.date <= monthEnd(month));
  const recurring = detectRecurring(txs, today < monthEnd(month) ? today : monthEnd(month));
  const proj = projectMonth(txs, month, today, recurring);

  // 1. Savings rate
  const savingsScore = clamp(proj.savingsRate / FULL_MARKS_SAVINGS_RATE, 0, 1) * 100;

  // 2. Budget adherence
  const b = budgetStatus(txs, budgets, monthlyBudget, month, today);
  const over = b.rows.filter((r) => r.spent > r.budget);
  const budgetScore = b.allocated > 0 ? clamp(100 - (b.overspend / b.allocated) * 400, 0, 100) : 50;

  // 3 & 4. History: up to five earlier months with data, plus this month (projected if still running).
  const earlier = monthlySeries(txs, openingBalance, today)
    .filter((m) => m.month < month && m.count > 0)
    .slice(-5);
  const nets = [...earlier.map((m) => m.net), proj.net];
  const expenses = [...earlier.map((m) => m.expenses), proj.expenses];
  const n = nets.length;
  const positive = nets.filter((x) => x > 0).length;
  const posShare = positive / n;
  const netMean = mean(nets);
  const netCv = n >= 2 ? (netMean > 0 ? stdev(nets) / netMean : 1) : 0;
  const steadiness = n >= 2 ? 1 - clamp(netCv, 0, 1) : posShare;
  const cashScore = 60 * posShare + 40 * steadiness;

  const expMean = mean(expenses);
  const expenseCv = n >= 2 && expMean > 0 ? stdev(expenses) / expMean : 0;
  const consistencyScore = n >= 2 ? clamp(100 - expenseCv * 300, 0, 100) : 70;

  const mk = (id: ComponentId, label: string, score: number, value: string, method: string): HealthComponent => ({
    id,
    label,
    score: round2(score),
    points: round2(score * WEIGHT),
    value,
    method,
  });

  const components: HealthComponent[] = [
    mk(
      'savings',
      'Savings rate',
      savingsScore,
      `${pct(proj.savingsRate)} savings rate${proj.isProjected ? ' (projected)' : ''}`,
      `Savings rate ÷ ${pct(FULL_MARKS_SAVINGS_RATE, 0)} target, capped at 100. Saving ${pct(FULL_MARKS_SAVINGS_RATE, 0)} or more of income earns full marks.`,
    ),
    mk(
      'budget',
      'Budget adherence',
      budgetScore,
      b.allocated === 0
        ? 'no budgets set'
        : b.overspend > 0
          ? `${money(b.overspend)} over budget in ${over.length} ${over.length === 1 ? 'category' : 'categories'}`
          : 'all categories within budget',
      'Starts at 100 and loses 4 points for every 1% of your total category budgets that you overspend. With no budgets set it stays at a neutral 50.',
    ),
    mk(
      'cashflow',
      'Cash flow stability',
      cashScore,
      n >= 2
        ? `${positive} of ${n} months positive, net varies ±${pct(netCv, 0)}`
        : positive
          ? 'positive net cash flow, one month of data'
          : 'negative net cash flow, one month of data',
      'Up to 60 points for the share of months (last six) where income exceeded spending, plus up to 40 for how little your monthly net varies (standard deviation ÷ average).',
    ),
    mk(
      'consistency',
      'Spending consistency',
      consistencyScore,
      n >= 2 ? `monthly spending varies ±${pct(expenseCv)}` : 'not enough history yet',
      'Starts at 100 and loses 3 points for every 1% of month-to-month variation in total spending (last six months). With a single month of data it stays at a neutral 70.',
    ),
  ];

  const score = Math.round(components.reduce((s, c) => s + c.points, 0));
  return {
    month,
    score,
    grade: gradeFor(score),
    components,
    isProjected: proj.isProjected,
    facts: {
      savingsRate: proj.savingsRate,
      income: proj.income,
      net: proj.net,
      overspend: b.overspend,
      overCategories: over
        .map((r) => ({ category: r.category, spent: r.spent, budget: r.budget }))
        .sort((x, y) => y.spent - y.budget - (x.spent - x.budget)),
      negativeMonths: n - positive,
      months: n,
      netCv,
      expenseCv,
    },
  };
}

export function healthScore(
  txs: Transaction[],
  budgets: Budgets,
  monthlyBudget: number,
  openingBalance: number,
  month: string,
  today: string,
): Health {
  const current = scoreMonth(txs, budgets, monthlyBudget, openingBalance, month, today);
  const prevMonth = addMonths(month, -1);
  const previous = inMonth(txs, prevMonth).length
    ? scoreMonth(txs, budgets, monthlyBudget, openingBalance, prevMonth, today)
    : null;

  const changes = previous
    ? current.components
        .map((c, i) => {
          const p = previous.components[i];
          const delta = round2(c.points - p.points);
          return { label: c.label, delta, text: `${p.value} → ${c.value}` };
        })
        .filter((c) => Math.abs(c.delta) >= 0.1)
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    : [];

  const f = current.facts;
  const rec: string[] = [];
  const get = (id: ComponentId) => current.components.find((c) => c.id === id)!;

  if (get('savings').score < 100 && f.income > 0) {
    const gap = round2(FULL_MARKS_SAVINGS_RATE * f.income - f.net);
    const flexible = byCategory(inMonth(txs, month)).filter(
      (c) => !['Housing', 'Utilities', 'Healthcare', 'Education'].includes(c.category),
    )[0];
    rec.push(
      `Save ${money(gap)} more this month to reach a ${pct(FULL_MARKS_SAVINGS_RATE, 0)} savings rate (worth up to ${round2(25 - get('savings').points)} more points).` +
        (flexible ? ` Your largest flexible category is ${flexible.category} at ${money(flexible.amount)}.` : ''),
    );
  }
  if (f.overCategories.length) {
    const top = f.overCategories.slice(0, 2);
    rec.push(
      `Bring ${top.map((c) => `${c.category} (${money(c.spent)} of ${money(c.budget)})`).join(' and ')} back within budget — overspending is costing ${round2(25 - get('budget').points)} points.`,
    );
  } else if (get('budget').score === 50) {
    rec.push('Set category budgets so adherence can be measured — until then this component is held at a neutral 50.');
  }
  if (f.negativeMonths > 0) {
    rec.push(
      `You spent more than you earned in ${f.negativeMonths} of the last ${f.months} months. Each month back in the black restores cash flow stability points.`,
    );
  } else if (f.months >= 2 && f.netCv > 0.2) {
    rec.push(
      `Your monthly surplus swings by ±${pct(f.netCv, 0)}. Spreading large one-off purchases across months would steady it.`,
    );
  }
  if (f.months >= 2 && f.expenseCv > 0.05) {
    rec.push(
      `Total spending varies ±${pct(f.expenseCv)} month to month. Keeping discretionary categories near their budgets each month raises spending consistency.`,
    );
  }
  if (!rec.length) rec.push(`All four components are near full marks for ${monthLabel(month)}. Keep doing what you are doing.`);

  return { ...current, previous, changes, recommendations: rec };
}
