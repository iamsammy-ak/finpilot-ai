import type { Category, ForecastAssumptions, Transaction } from '../types';
import { addMonths, dayOf, daysInMonth, monthKey, monthLabel, monthShort } from '../lib/dates';
import { clamp, round2 } from '../lib/format';
import { inMonth, isInProgress, monthlySeries, totals, type MonthPoint } from './metrics';
import { recurringKeyOf, type Recurring } from './recurring';

/* ------------------------------------------------------------------ */
/* Month-end projection for a month that is still running              */
/* ------------------------------------------------------------------ */

export interface MonthProjection {
  month: string;
  /** False when the month is complete and these are simply actuals. */
  isProjected: boolean;
  income: number;
  expenses: number;
  net: number;
  savingsRate: number;
  actualIncome: number;
  actualExpenses: number;
  /** Recurring bills expected before month end that have not been charged yet. */
  pendingBills: { merchant: string; amount: number; date: string }[];
  pendingIncome: number;
  /** Average daily non-recurring spend used for the remaining days. */
  dailyVariable: number;
  daysLeft: number;
  variableRemaining: number;
  basis: string;
}

/**
 * Projected month end = what has actually happened so far
 *   + recurring bills still due this month
 *   + (average daily everyday spending) × (days left).
 * The daily average comes from up to three previous complete months; if there
 * is no history it falls back to this month's pace so far.
 */
export function projectMonth(txs: Transaction[], month: string, today: string, recurring: Recurring[]): MonthProjection {
  const monthTx = inMonth(txs, month);
  const actual = totals(monthTx);
  const base = {
    month,
    actualIncome: actual.income,
    actualExpenses: actual.expenses,
  };
  if (!isInProgress(month, today)) {
    return {
      ...base,
      isProjected: false,
      income: actual.income,
      expenses: actual.expenses,
      net: actual.net,
      savingsRate: actual.savingsRate,
      pendingBills: [],
      pendingIncome: 0,
      dailyVariable: 0,
      daysLeft: 0,
      variableRemaining: 0,
      basis: 'Actual figures — the month is complete.',
    };
  }

  const recurringKeys = new Set(recurring.map((r) => r.key));
  const paidKeys = new Set(monthTx.map(recurringKeyOf));
  const pending = recurring.filter(
    (r) => r.nextDate !== null && monthKey(r.nextDate) === month && !paidKeys.has(r.key),
  );
  const pendingBills = pending
    .filter((r) => r.type === 'expense')
    .map((r) => ({ merchant: r.merchant, amount: r.amount, date: r.nextDate as string }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const pendingIncome = round2(pending.filter((r) => r.type === 'income').reduce((s, r) => s + r.amount, 0));

  // Everyday (non-recurring) spending pace.
  const variable = (list: Transaction[]) =>
    list.filter((t) => t.type === 'expense' && !recurringKeys.has(recurringKeyOf(t))).reduce((s, t) => s + t.amount, 0);
  const prior = [1, 2, 3].map((n) => addMonths(month, -n)).filter((m) => inMonth(txs, m).length > 0);
  let dailyVariable: number;
  let basis: string;
  if (prior.length) {
    const spent = prior.reduce((s, m) => s + variable(inMonth(txs, m)), 0);
    const days = prior.reduce((s, m) => s + daysInMonth(m), 0);
    dailyVariable = spent / days;
    basis = `Everyday spending pace from ${prior.length === 1 ? monthLabel(prior[0]) : `the last ${prior.length} complete months`}, plus recurring bills still due.`;
  } else {
    dailyVariable = variable(monthTx) / Math.max(1, dayOf(today));
    basis = 'This month’s spending pace so far (no earlier months to learn from), plus recurring bills still due.';
  }
  const daysLeft = daysInMonth(month) - dayOf(today);
  const variableRemaining = round2(dailyVariable * daysLeft);
  const income = round2(actual.income + pendingIncome);
  const expenses = round2(actual.expenses + pendingBills.reduce((s, b) => s + b.amount, 0) + variableRemaining);
  const net = round2(income - expenses);
  return {
    ...base,
    isProjected: true,
    income,
    expenses,
    net,
    savingsRate: income > 0 ? net / income : 0,
    pendingBills,
    pendingIncome,
    dailyVariable: round2(dailyVariable),
    daysLeft,
    variableRemaining,
    basis,
  };
}

/* ------------------------------------------------------------------ */
/* Next-month forecast                                                 */
/* ------------------------------------------------------------------ */

export type ScenarioId = 'conservative' | 'expected' | 'optimistic';

export interface Scenario {
  id: ScenarioId;
  label: string;
  note: string;
  income: number;
  expenses: number;
  savings: number;
  savingsRate: number;
  endBalance: number;
  meetsTarget: boolean;
  /** Savings minus the savings target. */
  gap: number;
}

export interface CategoryForecast {
  category: Category;
  /** Model estimate before any manual override. */
  model: number;
  /** Estimate after scaling to the user's expense assumption. */
  amount: number;
  /** Plain average of the basis months. */
  average: number;
  /** Most recent basis month. */
  last: number;
}

export interface Forecast {
  targetMonth: string;
  targetLabel: string;
  basisMonths: string[];
  /** True when there was no complete month and the running month's projection was used instead. */
  thinHistory: boolean;
  modelIncome: number;
  modelExpenses: number;
  income: number;
  expenses: number;
  categories: CategoryForecast[];
  scenarios: Scenario[];
  /** Balance at the start of the target month. */
  startBalance: number;
  startIsProjected: boolean;
  /** Monthly history plus the forecast month, for charts. */
  history: MonthPoint[];
  path: {
    month: string;
    label: string;
    actual?: number;
    conservative?: number;
    expected?: number;
    optimistic?: number;
  }[];
}

/** Recency-weighted average (newest month counts most) plus half of the recent monthly trend. */
export function trendEstimate(valuesOldestFirst: number[]): number {
  const v = valuesOldestFirst;
  if (!v.length) return 0;
  if (v.length === 1) return round2(v[0]);
  let wSum = 0;
  let acc = 0;
  v.forEach((x, i) => {
    const w = i + 1;
    acc += x * w;
    wSum += w;
  });
  const wma = acc / wSum;
  const slope = (v[v.length - 1] - v[0]) / (v.length - 1);
  // Damp the trend and keep the estimate inside a sane band around what was actually observed.
  const lo = Math.min(...v) * 0.9;
  const hi = Math.max(...v) * 1.1;
  return round2(clamp(wma + 0.5 * slope, lo, hi));
}

export const SCENARIO_RULES: Record<ScenarioId, { label: string; income: number; expenses: number; buffer: number; note: string }> = {
  conservative: {
    label: 'Conservative',
    income: 0.97,
    expenses: 1.1,
    buffer: 2,
    note: 'Income 3% lower, spending 10% higher, unexpected costs counted twice.',
  },
  expected: {
    label: 'Expected',
    income: 1,
    expenses: 1,
    buffer: 1,
    note: 'Income and spending as estimated, unexpected costs counted once.',
  },
  optimistic: {
    label: 'Optimistic',
    income: 1.02,
    expenses: 0.92,
    buffer: 0,
    note: 'Income 2% higher, spending 8% lower, no unexpected costs.',
  },
};

export function buildForecast(
  txs: Transaction[],
  openingBalance: number,
  today: string,
  recurring: Recurring[],
  a: ForecastAssumptions,
): Forecast {
  const history = monthlySeries(txs, openingBalance, today);
  const withData = history.filter((m) => m.count > 0);
  const lastData = withData.length ? withData[withData.length - 1].month : monthKey(today);
  const current = monthKey(today);
  const running = lastData >= current && isInProgress(current, today);
  const targetMonth = addMonths(lastData >= current ? current : lastData, 1);

  // Basis: up to three most recent complete months that contain data.
  const complete = withData.filter((m) => m.month < targetMonth && !(running && m.month === current));
  let basis = complete.slice(-3);
  let thinHistory = false;
  const projection = running ? projectMonth(txs, current, today, recurring) : null;

  let incomeSeries: number[];
  let catSeries: Map<Category, number[]>;
  const cats = new Set<Category>();

  if (basis.length) {
    incomeSeries = basis.map((m) => m.income);
    catSeries = new Map();
    basis.forEach((m, i) => {
      for (const t of inMonth(txs, m.month)) {
        if (t.type !== 'expense') continue;
        cats.add(t.category);
        const arr = catSeries.get(t.category) ?? basis.map(() => 0);
        arr[i] += t.amount;
        catSeries.set(t.category, arr);
      }
    });
  } else {
    // Only a running month exists: scale its categories up to the projected month-end total.
    thinHistory = true;
    basis = withData.slice(-1);
    const monthTx = inMonth(txs, lastData);
    const actual = totals(monthTx);
    const scale = projection && actual.expenses > 0 ? projection.expenses / actual.expenses : 1;
    incomeSeries = [projection ? projection.income : actual.income];
    catSeries = new Map();
    for (const t of monthTx) {
      if (t.type !== 'expense') continue;
      cats.add(t.category);
      const arr = catSeries.get(t.category) ?? [0];
      arr[0] += t.amount * scale;
      catSeries.set(t.category, arr);
    }
  }

  const modelIncome = trendEstimate(incomeSeries);
  const modelCats = [...cats].map((category) => {
    const series = catSeries.get(category) ?? [];
    return {
      category,
      model: trendEstimate(series),
      average: round2(series.reduce((s, x) => s + x, 0) / Math.max(1, series.length)),
      last: round2(series[series.length - 1] ?? 0),
    };
  });
  const modelExpenses = round2(modelCats.reduce((s, c) => s + c.model, 0));

  const income = a.income ?? modelIncome;
  const expenses = a.expenses ?? modelExpenses;
  const scale = modelExpenses > 0 ? expenses / modelExpenses : 1;
  const categories: CategoryForecast[] = modelCats
    .map((c) => ({ ...c, amount: round2(c.model * scale) }))
    .sort((x, y) => y.amount - x.amount);

  // Balance at the start of the forecast month.
  const lastPoint = history.filter((m) => m.month < targetMonth).slice(-1)[0];
  const balanceNow = lastPoint ? lastPoint.closing : openingBalance;
  const startBalance = projection
    ? round2(balanceNow + (projection.net - (projection.actualIncome - projection.actualExpenses)))
    : balanceNow;

  const scenarios: Scenario[] = (Object.keys(SCENARIO_RULES) as ScenarioId[]).map((id) => {
    const r = SCENARIO_RULES[id];
    const inc = round2(income * r.income);
    const exp = round2(expenses * r.expenses + a.unexpected * r.buffer);
    const savings = round2(inc - exp);
    return {
      id,
      label: r.label,
      note: r.note,
      income: inc,
      expenses: exp,
      savings,
      savingsRate: inc > 0 ? savings / inc : 0,
      endBalance: round2(startBalance + savings),
      meetsTarget: savings >= a.savingsTarget,
      gap: round2(savings - a.savingsTarget),
    };
  });

  // Balance path: actual month-end balances, then three projected months per scenario.
  const past = history.filter((m) => m.month < targetMonth).slice(-5);
  // The actual line stops at the last complete month; a running month is already an estimate.
  const path: Forecast['path'] = past.map((m, i) => {
    const isLast = i === past.length - 1;
    const label = monthShort(m.month);
    if (isLast && projection) {
      return { month: m.month, label, conservative: startBalance, expected: startBalance, optimistic: startBalance };
    }
    const join = projection ? i === past.length - 2 : isLast;
    return {
      month: m.month,
      label,
      actual: m.closing,
      ...(join ? { conservative: m.closing, expected: m.closing, optimistic: m.closing } : {}),
    };
  });
  for (let i = 0; i < 3; i++) {
    const mk = addMonths(targetMonth, i);
    const point: Forecast['path'][number] = { month: mk, label: monthShort(mk) };
    for (const s of scenarios) point[s.id] = round2(startBalance + s.savings * (i + 1));
    path.push(point);
  }

  return {
    targetMonth,
    targetLabel: monthLabel(targetMonth),
    basisMonths: basis.map((m) => m.month),
    thinHistory,
    modelIncome,
    modelExpenses,
    income: round2(income),
    expenses: round2(expenses),
    categories,
    scenarios,
    startBalance,
    startIsProjected: !!projection,
    history,
    path,
  };
}
