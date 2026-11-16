import type { Budgets, DateRange, ForecastAssumptions, RangeSelection, Settings, Transaction } from '../types';
import { addMonths, monthKey } from '../lib/dates';
import { change, money, round2 } from '../lib/format';
import { categoryDeltas, detectAnomalies, type Anomaly, type CategoryDelta } from './analytics';
import { budgetStatus, levelFor, type BudgetStatus } from './budgets';
import { buildForecast, projectMonth, type Forecast, type MonthProjection } from './forecast';
import { healthScore, type Health } from './health';
import { buildInsights, type Insight } from './insights';
import {
  balanceAt,
  byCategory,
  comparisonFor,
  inMonth,
  inRange,
  isInProgress,
  isSingleMonth,
  monthlySeries,
  resolveRange,
  totals,
  type CategoryTotal,
  type MonthPoint,
  type Totals,
} from './metrics';
import { detectRecurring, upcomingPayments, type Recurring, type Upcoming } from './recurring';

export interface Kpi {
  id: 'balance' | 'income' | 'expenses' | 'net' | 'rate' | 'savings';
  label: string;
  value: number;
  previous: number;
  /** Relative change, or for the savings rate the change in percentage points. null = no basis. */
  change: number | null;
  format: 'money' | 'pct';
  /** Whether an increase is good news. */
  upIsGood: boolean;
  /** Changes are in percentage points rather than percent. */
  points?: boolean;
}

export interface AppNotification {
  id: string;
  tone: 'warn' | 'bad' | 'info';
  title: string;
  body: string;
  page: 'budgets' | 'cashflow' | 'analytics';
}

/**
 * Everything the UI shows, derived in one pass from the same transaction list.
 * Pages never compute their own totals — they read this.
 */
export interface Snapshot {
  today: string;
  txs: Transaction[];
  settings: Settings;
  budgets: Budgets;
  range: DateRange;
  singleMonth: boolean;
  compare: { current: DateRange; previous: DateRange };
  focusMonth: string;
  prevMonth: string;
  focusInProgress: boolean;
  rangeTx: Transaction[];
  previousTx: Transaction[];
  monthTx: Transaction[];
  totals: Totals;
  previousTotals: Totals;
  kpis: Kpi[];
  balanceNow: number;
  monthly: MonthPoint[];
  categories: CategoryTotal[];
  monthCategories: CategoryTotal[];
  /** Range vs comparison period, per category. */
  categoryChanges: CategoryDelta[];
  recurring: Recurring[];
  subscriptions: Recurring[];
  subscriptionMonthly: number;
  upcoming: Upcoming[];
  anomalies: Anomaly[];
  budget: BudgetStatus;
  projection: MonthProjection;
  forecast: Forecast;
  health: Health;
  insights: Insight[];
  notifications: AppNotification[];
}

export interface SnapshotInput {
  transactions: Transaction[];
  budgets: Budgets;
  settings: Settings;
  range: RangeSelection;
  assumptions: ForecastAssumptions;
  today: string;
}

export function buildSnapshot(input: SnapshotInput): Snapshot {
  const { transactions: txs, budgets, settings, today } = input;
  const range = resolveRange(input.range, txs, today);
  const compare = comparisonFor(range, today);
  const singleMonth = isSingleMonth(range);

  // Month-based features (budgets, health score, projection) follow the month the range ends in.
  const endMonth = monthKey(range.to);
  const focusMonth = endMonth > monthKey(today) ? monthKey(today) : endMonth;
  const prevMonth = addMonths(focusMonth, -1);

  const rangeTx = inRange(txs, range.from, range.to);
  const previousTx = inRange(txs, compare.previous.from, compare.previous.to);
  const monthTx = inMonth(txs, focusMonth);
  const t = totals(rangeTx);
  const pt = totals(previousTx);

  const balance = balanceAt(txs, settings.openingBalance, compare.current.to);
  const balancePrev = balanceAt(txs, settings.openingBalance, compare.previous.to);
  const balanceNow = balanceAt(txs, settings.openingBalance, today);
  const per = singleMonth ? 'Monthly ' : '';
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  const kpis: Kpi[] = [
    { id: 'balance', label: 'Total balance', value: balance, previous: balancePrev, change: change(balance, balancePrev), format: 'money', upIsGood: true },
    { id: 'income', label: cap(`${per}income`), value: t.income, previous: pt.income, change: change(t.income, pt.income), format: 'money', upIsGood: true },
    { id: 'expenses', label: cap(`${per}expenses`), value: t.expenses, previous: pt.expenses, change: change(t.expenses, pt.expenses), format: 'money', upIsGood: false },
    { id: 'net', label: 'Net cash flow', value: t.net, previous: pt.net, change: change(t.net, pt.net), format: 'money', upIsGood: true },
    {
      id: 'rate',
      label: 'Savings rate',
      value: t.savingsRate,
      previous: pt.savingsRate,
      change: pt.income > 0 || t.income > 0 ? t.savingsRate - pt.savingsRate : null,
      format: 'pct',
      upIsGood: true,
      points: true,
    },
    {
      id: 'savings',
      label: cap(`${per}savings`),
      value: Math.max(0, t.net),
      previous: Math.max(0, pt.net),
      change: change(Math.max(0, t.net), Math.max(0, pt.net)),
      format: 'money',
      upIsGood: true,
    },
  ];

  const monthly = monthlySeries(txs, settings.openingBalance, today);
  const recurring = detectRecurring(txs, today);
  const subscriptions = recurring.filter((r) => r.isSubscription && r.nextDate !== null);
  const upcoming = upcomingPayments(recurring, today);
  const anomalies = detectAnomalies(txs, range.from, range.to, focusMonth, recurring);
  const budget = budgetStatus(txs, budgets, settings.monthlyBudget, focusMonth, today);
  const projection = projectMonth(txs, focusMonth, today, recurring);
  const forecast = buildForecast(txs, settings.openingBalance, today, recurring, input.assumptions);
  const health = healthScore(txs, budgets, settings.monthlyBudget, settings.openingBalance, focusMonth, today);

  const snapshot: Snapshot = {
    today,
    txs,
    settings,
    budgets,
    range,
    singleMonth,
    compare,
    focusMonth,
    prevMonth,
    focusInProgress: isInProgress(focusMonth, today),
    rangeTx,
    previousTx,
    monthTx,
    totals: t,
    previousTotals: pt,
    kpis,
    balanceNow,
    monthly,
    categories: byCategory(rangeTx),
    monthCategories: byCategory(monthTx),
    categoryChanges: categoryDeltas(inRange(txs, compare.current.from, compare.current.to), previousTx),
    recurring,
    subscriptions,
    subscriptionMonthly: round2(subscriptions.reduce((s, r) => s + r.amount, 0)),
    upcoming,
    anomalies,
    budget,
    projection,
    forecast,
    health,
    insights: [],
    notifications: [],
  };
  snapshot.insights = buildInsights(snapshot);
  snapshot.notifications = buildNotifications(snapshot);
  return snapshot;
}

/** Alerts for the current calendar month, independent of the range being viewed. */
function buildNotifications(s: Snapshot): AppNotification[] {
  const out: AppNotification[] = [];
  const month = monthKey(s.today);
  const b = s.focusMonth === month ? s.budget : budgetStatus(s.txs, s.budgets, s.settings.monthlyBudget, month, s.today);
  const fmt = (n: number) => `${Math.round(n * 100)}%`;

  const push = (name: string, used: number, spent: number, limit: number) => {
    const level = levelFor(used);
    if (level === 'ok') return;
    const step = level === 'over' ? 101 : level === 'full' ? 100 : level === 'warn90' ? 90 : 80;
    out.push({
      id: `budget:${month}:${name}:${step}`,
      tone: level === 'over' ? 'bad' : 'warn',
      title: level === 'over' ? `${name} budget exceeded` : level === 'full' ? `${name} budget fully used` : `${name} budget ${step}% used`,
      body: `${money(spent)} of ${money(limit)} spent (${fmt(used)}).`,
      page: 'budgets',
    });
  };
  if (b.monthlyBudget > 0) push('Monthly', b.totalUsed, b.totalSpent, b.monthlyBudget);
  for (const r of [...b.rows].sort((x, y) => y.used - x.used)) push(r.category, r.used, r.spent, r.budget);
  out.sort((x, y) => Number(y.tone === 'bad') - Number(x.tone === 'bad'));

  for (const u of s.upcoming.filter((x) => x.daysAway <= 3)) {
    out.push({
      id: `due:${u.key}:${u.nextDate}`,
      tone: 'info',
      title: `${u.merchant} due ${u.daysAway <= 0 ? 'today' : u.daysAway === 1 ? 'tomorrow' : `in ${u.daysAway} days`}`,
      body: `Recurring payment of about ${money(u.amount)}.`,
      page: 'cashflow',
    });
  }
  for (const a of s.anomalies.filter((x) => x.kind === 'transaction' && x.date && monthKey(x.date) === month).slice(0, 3)) {
    out.push({ id: `anomaly:${a.id}`, tone: 'warn', title: `Unusual purchase: ${a.title}`, body: a.detail, page: 'analytics' });
  }
  return out;
}
