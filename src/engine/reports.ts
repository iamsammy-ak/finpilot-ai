import type { Budgets, Settings, Transaction } from '../types';
import { addMonths, daysInMonth, fmtDate, monthEnd, monthLabel, monthStart } from '../lib/dates';
import { money, moneySigned, pct, pctSigned, round2 } from '../lib/format';
import { categoryDeltas } from './analytics';
import { budgetStatus } from './budgets';
import { byCategory, byMerchant, dailySeries, inMonth, isInProgress, monthlySeries, totals } from './metrics';

export type ReportId = 'summary' | 'statement' | 'categories' | 'savings' | 'cashflow' | 'budget';

export const REPORTS: { id: ReportId; name: string; blurb: string }[] = [
  { id: 'summary', name: 'Monthly financial summary', blurb: 'Headline figures for the month on one page.' },
  { id: 'statement', name: 'Income and expense statement', blurb: 'Income by source, expenses by category, net result.' },
  { id: 'categories', name: 'Category spending report', blurb: 'Each category against the previous month, with top merchants.' },
  { id: 'savings', name: 'Savings report', blurb: 'Savings and savings rate, month by month.' },
  { id: 'cashflow', name: 'Cash flow report', blurb: 'Opening balance, weekly inflows and outflows, closing balance.' },
  { id: 'budget', name: 'Budget performance report', blurb: 'Planned against actual for every budgeted category.' },
];

export interface ReportRow {
  cells: string[];
  /** Raw values for CSV export (same order as cells). */
  raw: (string | number)[];
  kind?: 'normal' | 'subtotal' | 'total' | 'heading';
}

export interface ReportSection {
  title: string;
  columns: { label: string; align?: 'left' | 'right' }[];
  rows: ReportRow[];
  note?: string;
}

export interface Report {
  id: ReportId;
  title: string;
  period: string;
  preparedFor: string;
  generated: string;
  /** Shown when the month is still running. */
  caveat?: string;
  sections: ReportSection[];
}

const L = { label: '', align: 'left' as const };
const R = (label: string) => ({ label, align: 'right' as const });
const row = (label: string, values: number[], kind: ReportRow['kind'] = 'normal', fmt: (n: number) => string = money): ReportRow => ({
  cells: [label, ...values.map(fmt)],
  raw: [label, ...values.map(round2)],
  kind,
});

export function buildReport(
  id: ReportId,
  txs: Transaction[],
  budgets: Budgets,
  settings: Settings,
  month: string,
  today: string,
): Report {
  const monthTx = inMonth(txs, month);
  const prev = addMonths(month, -1);
  const prevTx = inMonth(txs, prev);
  const t = totals(monthTx);
  const pt = totals(prevTx);
  const series = monthlySeries(txs, settings.openingBalance, today);
  const point = series.find((m) => m.month === month);
  const opening = point?.opening ?? settings.openingBalance;
  const closing = point?.closing ?? opening;
  const running = isInProgress(month, today);
  const meta = REPORTS.find((r) => r.id === id)!;
  const head = {
    id,
    title: meta.name,
    period: monthLabel(month),
    preparedFor: settings.name || 'Account holder',
    generated: fmtDate(today),
    caveat: running ? `${monthLabel(month)} is still in progress. Figures cover transactions booked up to ${fmtDate(today)}.` : undefined,
  };
  const cols3 = [{ ...L, label: 'Item' }, R(monthLabel(month)), R(monthLabel(prev)), R('Change')];
  const cmp = (label: string, a: number, b: number, kind: ReportRow['kind'] = 'normal'): ReportRow => ({
    cells: [label, money(a), money(b), moneySigned(a - b)],
    raw: [label, round2(a), round2(b), round2(a - b)],
    kind,
  });

  const incomeRows = () => {
    const cur = byCategory(monthTx, 'income');
    const old = new Map(byCategory(prevTx, 'income').map((c) => [c.category, c.amount]));
    const names = new Set([...cur.map((c) => c.category), ...old.keys()]);
    return [...names].map((n) => cmp(n, cur.find((c) => c.category === n)?.amount ?? 0, old.get(n) ?? 0));
  };
  const expenseRows = () => categoryDeltas(monthTx, prevTx).map((c) => cmp(c.category, c.current, c.previous));

  switch (id) {
    case 'summary': {
      const b = budgetStatus(txs, budgets, settings.monthlyBudget, month, today);
      const top = byCategory(monthTx).slice(0, 5);
      const days = running ? Number(today.slice(8, 10)) : daysInMonth(month);
      return {
        ...head,
        sections: [
          {
            title: 'Key figures',
            columns: cols3,
            rows: [
              cmp('Total income', t.income, pt.income),
              cmp('Total expenses', t.expenses, pt.expenses),
              cmp('Net cash flow', t.net, pt.net, 'subtotal'),
              { cells: ['Savings rate', pct(t.savingsRate), pct(pt.savingsRate), `${pctSigned(t.savingsRate - pt.savingsRate)} pts`], raw: ['Savings rate', round2(t.savingsRate * 100), round2(pt.savingsRate * 100), round2((t.savingsRate - pt.savingsRate) * 100)] },
              cmp('Closing balance', closing, opening, 'total'),
            ],
            note: 'For closing balance, the comparison column shows the opening balance of the month.',
          },
          {
            title: 'Activity',
            columns: [{ ...L, label: 'Measure' }, R('Value')],
            rows: [
              { cells: ['Transactions', String(t.count)], raw: ['Transactions', t.count] },
              row('Average daily spending', [t.expenses / Math.max(1, days)]),
              { cells: ['Budget used', b.monthlyBudget > 0 ? `${pct(b.totalUsed, 0)} of ${money(b.monthlyBudget)}` : 'No budget set'], raw: ['Budget used (%)', round2(b.totalUsed * 100)] },
              { cells: ['Categories over budget', String(b.rows.filter((r) => r.level === 'over').length)], raw: ['Categories over budget', b.rows.filter((r) => r.level === 'over').length] },
            ],
          },
          {
            title: 'Top spending categories',
            columns: [{ ...L, label: 'Category' }, R('Amount'), R('Share of spending')],
            rows: top.map((c) => ({ cells: [c.category, money(c.amount), pct(c.share)], raw: [c.category, c.amount, round2(c.share * 100)] })),
          },
        ],
      };
    }

    case 'statement':
      return {
        ...head,
        sections: [
          { title: 'Income', columns: cols3, rows: [...incomeRows(), cmp('Total income', t.income, pt.income, 'subtotal')] },
          { title: 'Expenses', columns: cols3, rows: [...expenseRows(), cmp('Total expenses', t.expenses, pt.expenses, 'subtotal')] },
          {
            title: 'Result',
            columns: cols3,
            rows: [
              cmp('Net income (income − expenses)', t.net, pt.net, 'total'),
              { cells: ['Savings rate', pct(t.savingsRate), pct(pt.savingsRate), `${pctSigned(t.savingsRate - pt.savingsRate)} pts`], raw: ['Savings rate (%)', round2(t.savingsRate * 100), round2(pt.savingsRate * 100), round2((t.savingsRate - pt.savingsRate) * 100)] },
            ],
          },
        ],
      };

    case 'categories': {
      const deltas = categoryDeltas(monthTx, prevTx);
      const shares = new Map(byCategory(monthTx).map((c) => [c.category, c]));
      return {
        ...head,
        sections: [
          {
            title: 'Spending by category',
            columns: [{ ...L, label: 'Category' }, R(monthLabel(month)), R('Share'), R('Purchases'), R(monthLabel(prev)), R('Change')],
            rows: [
              ...deltas.map((c) => ({
                cells: [c.category, money(c.current), pct(shares.get(c.category)?.share ?? 0), String(shares.get(c.category)?.count ?? 0), money(c.previous), c.change === null ? '—' : pctSigned(c.change)],
                raw: [c.category, c.current, round2((shares.get(c.category)?.share ?? 0) * 100), shares.get(c.category)?.count ?? 0, c.previous, c.change === null ? '' : round2(c.change * 100)],
              })),
              { cells: ['Total', money(t.expenses), '100%', String(monthTx.filter((x) => x.type === 'expense').length), money(pt.expenses), pt.expenses > 0 ? pctSigned((t.expenses - pt.expenses) / pt.expenses) : '—'], raw: ['Total', t.expenses, 100, monthTx.filter((x) => x.type === 'expense').length, pt.expenses, pt.expenses > 0 ? round2(((t.expenses - pt.expenses) / pt.expenses) * 100) : ''], kind: 'total' as const },
            ],
          },
          {
            title: 'Top merchants',
            columns: [{ ...L, label: 'Merchant' }, { ...L, label: 'Category' }, R('Purchases'), R('Amount')],
            rows: byMerchant(monthTx)
              .slice(0, 10)
              .map((x) => ({ cells: [x.merchant, x.category, String(x.count), money(x.amount)], raw: [x.merchant, x.category, x.count, x.amount] })),
          },
        ],
      };
    }

    case 'savings': {
      const months = series.filter((m) => m.month <= month && m.count > 0).slice(-6);
      const target = settings.savingsRateTarget;
      const cumulative = round2(months.reduce((s, m) => s + m.net, 0));
      return {
        ...head,
        sections: [
          {
            title: 'Savings by month',
            columns: [{ ...L, label: 'Month' }, R('Income'), R('Expenses'), R('Saved'), R('Savings rate'), R(`Against ${pct(target, 0)} target`)],
            rows: [
              ...months.map((m) => ({
                cells: [monthLabel(m.month) + (m.inProgress ? ' (in progress)' : ''), money(m.income), money(m.expenses), moneySigned(m.net), pct(m.savingsRate), moneySigned(m.net - target * m.income)],
                raw: [monthLabel(m.month), m.income, m.expenses, m.net, round2(m.savingsRate * 100), round2(m.net - target * m.income)],
              })),
              {
                cells: ['Total', money(months.reduce((s, m) => s + m.income, 0)), money(months.reduce((s, m) => s + m.expenses, 0)), moneySigned(cumulative), pct(months.reduce((s, m) => s + m.income, 0) > 0 ? cumulative / months.reduce((s, m) => s + m.income, 0) : 0), ''],
                raw: ['Total', round2(months.reduce((s, m) => s + m.income, 0)), round2(months.reduce((s, m) => s + m.expenses, 0)), cumulative, '', ''],
                kind: 'total' as const,
              },
            ],
          },
          {
            title: `${monthLabel(month)} in detail`,
            columns: [{ ...L, label: 'Measure' }, R('Value')],
            rows: [
              row('Saved this month', [t.net]),
              { cells: ['Savings rate', pct(t.savingsRate)], raw: ['Savings rate (%)', round2(t.savingsRate * 100)] },
              row(`Target (${pct(target, 0)} of income)`, [target * t.income]),
              row('Above / below target', [t.net - target * t.income], 'subtotal', moneySigned),
            ],
          },
        ],
      };
    }

    case 'cashflow': {
      const days = dailySeries(txs, settings.openingBalance, monthStart(month), monthEnd(month));
      const weeks: ReportRow[] = [];
      for (let i = 0; i < days.length; i += 7) {
        const chunk = days.slice(i, i + 7);
        const inc = chunk.reduce((s, d) => s + d.income, 0);
        const exp = chunk.reduce((s, d) => s + d.expenses, 0);
        const label = `${chunk[0].day}–${chunk[chunk.length - 1].day} ${monthLabel(month).split(' ')[0]}`;
        weeks.push({ cells: [label, money(inc), money(exp), moneySigned(inc - exp), money(chunk[chunk.length - 1].balance)], raw: [label, round2(inc), round2(exp), round2(inc - exp), chunk[chunk.length - 1].balance] });
      }
      return {
        ...head,
        sections: [
          {
            title: 'Cash position',
            columns: [{ ...L, label: 'Item' }, R('Amount')],
            rows: [row('Opening balance', [opening]), row('Total inflows', [t.income]), row('Total outflows', [-t.expenses], 'normal', moneySigned), row('Net cash flow', [t.net], 'subtotal', moneySigned), row('Closing balance', [closing], 'total')],
          },
          { title: 'Inflows by source', columns: [{ ...L, label: 'Source' }, R('Amount')], rows: byCategory(monthTx, 'income').map((c) => row(c.category, [c.amount])) },
          { title: 'Outflows by category', columns: [{ ...L, label: 'Category' }, R('Amount')], rows: byCategory(monthTx).map((c) => row(c.category, [c.amount])) },
          { title: 'Weekly movement', columns: [{ ...L, label: 'Days' }, R('Inflows'), R('Outflows'), R('Net'), R('Balance at end')], rows: weeks },
        ],
      };
    }

    case 'budget':
    default: {
      const b = budgetStatus(txs, budgets, settings.monthlyBudget, month, today);
      const status = (used: number) => (used > 1.00001 ? 'Over budget' : used >= 1 ? 'Fully used' : used >= 0.9 ? 'Above 90%' : used >= 0.8 ? 'Above 80%' : 'On track');
      return {
        ...head,
        sections: [
          {
            title: 'Planned against actual',
            columns: [{ ...L, label: 'Category' }, R('Budget'), R('Actual'), R('Variance'), R('Used'), { ...L, label: 'Status' }],
            rows: [
              ...b.rows.map((r) => ({
                cells: [r.category, money(r.budget), money(r.spent), moneySigned(r.remaining), pct(r.used, 0), status(r.used)],
                raw: [r.category, r.budget, r.spent, r.remaining, round2(r.used * 100), status(r.used)],
              })),
              ...b.unbudgeted.map((u) => ({ cells: [u.category, '—', money(u.spent), '—', '—', 'No budget'], raw: [u.category, '', u.spent, '', '', 'No budget'] })),
              {
                cells: ['Total', money(b.monthlyBudget), money(b.totalSpent), moneySigned(b.monthlyBudget - b.totalSpent), pct(b.totalUsed, 0), status(b.totalUsed)],
                raw: ['Total', b.monthlyBudget, b.totalSpent, round2(b.monthlyBudget - b.totalSpent), round2(b.totalUsed * 100), status(b.totalUsed)],
                kind: 'total' as const,
              },
            ],
            note: 'Variance is budget minus actual: a positive figure is money left, a negative figure is overspending. The total row uses your overall monthly budget.',
          },
        ],
      };
    }
  }
}
