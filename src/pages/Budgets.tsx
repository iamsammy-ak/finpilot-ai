import { useMemo } from 'react';
import { CircleAlert, CircleCheck, Sparkles, TriangleAlert } from 'lucide-react';
import type { Category } from '../types';
import { EXPENSE_CATEGORIES } from '../types';
import { Card, CategoryTag, Empty, MoneyInput, PageHead, toast } from '../components/ui';
import { dayOf, daysInMonth, monthLabel } from '../lib/dates';
import { currencySymbol, money, pct, plural } from '../lib/format';
import { budgetRecommendations, type BudgetLevel } from '../engine/budgets';
import type { Snapshot } from '../engine/snapshot';
import { useStore } from '../store/useStore';

const LEVEL: Record<BudgetLevel, { label: string; pill: string; fill: string }> = {
  ok: { label: 'On track', pill: 'good', fill: 'ok' },
  warn80: { label: '80% reached', pill: 'warn', fill: 'warn' },
  warn90: { label: '90% reached', pill: 'warn', fill: 'warn' },
  full: { label: 'Fully used', pill: 'info', fill: 'ok' },
  over: { label: 'Over budget', pill: 'bad', fill: 'over' },
};

export default function Budgets({ s }: { s: Snapshot }) {
  const setBudget = useStore((x) => x.setBudget);
  const updateSettings = useStore((x) => x.updateSettings);
  const b = s.budget;
  const month = b.month;
  const sym = currencySymbol();
  const recs = useMemo(() => budgetRecommendations(s.txs, s.budgets, month), [s.txs, s.budgets, month]);

  const spent = new Map(s.monthCategories.map((c) => [c.category, c.amount]));
  const rowFor = new Map(b.rows.map((r) => [r.category, r]));
  const categories = [...EXPENSE_CATEGORIES].sort((x, y) => (s.budgets[y] ?? 0) - (s.budgets[x] ?? 0) || (spent.get(y) ?? 0) - (spent.get(x) ?? 0));
  const alerts = b.rows.filter((r) => r.level !== 'ok').sort((x, y) => y.used - x.used);
  const daysLeft = s.focusInProgress ? daysInMonth(month) - dayOf(s.today) : 0;
  const left = b.monthlyBudget - b.totalSpent;
  const total = LEVEL[b.totalLevel];

  const apply = (category: Category, amount: number) => {
    setBudget(category, amount);
    toast(`${category} budget set to ${money(amount)}`);
  };

  return (
    <div className="page">
      <PageHead
        title="Budgets"
        sub={`Planned against actual spending for ${monthLabel(month)}${s.focusInProgress ? `, ${pct(b.elapsed, 0)} of the month gone` : ''}. Change the month in the date selector.`}
      />
      <div className="grid">
        <Card className="c-8" title="Monthly budget" sub="Your overall spending limit for the month">
          <div className="row wrap" style={{ gap: 28, alignItems: 'flex-end' }}>
            <label className="field" style={{ width: 170 }}>
              <span>Monthly limit</span>
              <MoneyInput value={s.settings.monthlyBudget || null} onCommit={(n) => updateSettings({ monthlyBudget: n ?? 0 })} ariaLabel="Monthly budget" placeholder={String(b.allocated)} symbol={sym} />
            </label>
            <div className="stat">
              <span>Spent</span>
              <b className={`num ${b.totalLevel === 'over' ? 'bad' : ''}`}>{money(b.totalSpent)}</b>
            </div>
            <div className="stat">
              <span>{left >= 0 ? 'Left' : 'Over by'}</span>
              <b className={`num ${left < 0 ? 'bad' : 'good'}`}>{money(Math.abs(left))}</b>
            </div>
            <div className="stat">
              <span>Used</span>
              <b className="num">{pct(b.totalUsed, 0)}</b>
            </div>
            {s.focusInProgress && left > 0 && (
              <div className="stat">
                <span>Per day, {daysLeft} days left</span>
                <b className="num">{money(left / Math.max(1, daysLeft))}</b>
              </div>
            )}
          </div>
          <div className="track tall" style={{ marginTop: 20, overflow: 'visible' }}>
            <div className={`fill ${total.fill}`} style={{ width: `${Math.min(100, b.totalUsed * 100)}%` }} />
            {s.focusInProgress && <span className="mark" style={{ left: `calc(${b.elapsed * 100}% - 1px)` }} title={`${pct(b.elapsed, 0)} of the month gone`} />}
          </div>
          <div className="row between wrap hint" style={{ marginTop: 10 }}>
            <span>
              {s.focusInProgress
                ? b.totalUsed > b.elapsed + 0.05
                  ? `Spending is ahead of the calendar: ${pct(b.totalUsed, 0)} used with ${pct(b.elapsed, 0)} of the month gone (the marker). Fixed bills early in the month often cause this.`
                  : `Spending is in line with the calendar: ${pct(b.totalUsed, 0)} used with ${pct(b.elapsed, 0)} of the month gone (the marker).`
                : `${monthLabel(month)} is complete.`}
            </span>
            <span className="num">
              {money(b.allocated)} allocated to categories ·{' '}
              {b.unallocated >= 0 ? `${money(b.unallocated)} unallocated` : <span className="warn">{money(-b.unallocated)} more than the monthly limit</span>}
            </span>
          </div>
        </Card>

        <Card className="c-4" title="Budget alerts" sub="Raised at 80%, 90% and 100% of each limit" flush>
          {alerts.length ? (
            alerts.map((r) => {
              const over = r.level === 'over';
              return (
                <div className="insight" key={r.category}>
                  <span className={`insight-ico ${over ? 'bad' : 'warn'}`}>{over ? <CircleAlert className="bad" /> : <TriangleAlert className="warn" />}</span>
                  <span className="grow">
                    <span className="insight-title" style={{ display: 'block' }}>
                      {r.category}: {LEVEL[r.level].label.toLowerCase()}
                    </span>
                    <span className="insight-body num">
                      {money(r.spent)} of {money(r.budget)} · {over ? `${money(-r.remaining)} over` : `${money(r.remaining)} left`}
                    </span>
                  </span>
                  <b className={`num ${over ? 'bad' : 'warn'}`}>{pct(r.used, 0)}</b>
                </div>
              );
            })
          ) : (
            <Empty icon={<CircleCheck />} title={b.rows.length ? 'No alerts' : 'No budgets yet'}>
              {b.rows.length ? `All ${plural(b.rows.length, 'budget')} are below 80% for ${monthLabel(month)}.` : 'Set a budget for a category to start getting alerts.'}
            </Empty>
          )}
        </Card>

        <Card className="c-8" title="Category budgets" sub="Type a limit to set or change it. Clear the field to remove a budget." flush>
          <div style={{ padding: '4px 20px 8px' }}>
            {categories.map((c) => {
              const r = rowFor.get(c);
              const amount = spent.get(c) ?? 0;
              const lv = r ? LEVEL[r.level] : null;
              return (
                <div key={c} style={{ padding: '13px 0', borderBottom: '1px solid var(--line-soft)' }}>
                  <div className="row between wrap" style={{ gap: 12 }}>
                    <div className="row" style={{ minWidth: 150 }}>
                      <b>
                        <CategoryTag category={c} />
                      </b>
                    </div>
                    <div className="row wrap" style={{ gap: 12 }}>
                      {lv ? <span className={`pill ${lv.pill}`}>{lv.label}</span> : amount > 0 ? <span className="pill">No budget</span> : null}
                      <span className="num nowrap">
                        <b className={r?.level === 'over' ? 'bad' : ''}>{money(amount)}</b>
                        <span className="muted"> / </span>
                      </span>
                      <div style={{ width: 118 }}>
                        <MoneyInput small value={s.budgets[c] ?? null} onCommit={(n) => setBudget(c, n ?? 0)} placeholder="Set limit" ariaLabel={`${c} budget`} symbol={sym} />
                      </div>
                      <span className="num muted right" style={{ width: 44 }}>
                        {r ? pct(r.used, 0) : '—'}
                      </span>
                    </div>
                  </div>
                  {r && (
                    <>
                      <div className="track" style={{ marginTop: 10, overflow: 'visible' }}>
                        <div className={`fill ${lv!.fill}`} style={{ width: `${Math.min(100, r.used * 100)}%` }} />
                        {s.focusInProgress && <span className="mark" style={{ left: `calc(${b.elapsed * 100}% - 1px)`, opacity: 0.5 }} />}
                      </div>
                      <div className="hint num" style={{ marginTop: 6 }}>
                        {r.remaining >= 0 ? `${money(r.remaining)} left` : `${money(-r.remaining)} over`}
                        {s.focusInProgress && r.remaining > 0 && daysLeft > 0 ? ` · ${money(r.remaining / daysLeft)} a day for ${daysLeft} days` : ''}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        <Card
          className="c-4"
          title="Budget recommendations"
          sub="From your average spending over the previous three months"
          action={
            recs.length > 1 ? (
              <button
                className="btn sm"
                onClick={() => {
                  for (const r of recs) setBudget(r.category, r.suggested);
                  toast(`${plural(recs.length, 'budget')} updated`, 'Recommendations applied.');
                }}
              >
                Apply all
              </button>
            ) : undefined
          }
        >
          {recs.length ? (
            <div className="stack" style={{ gap: 12 }}>
              {recs.map((r) => (
                <div key={r.category} className="answer-block">
                  <div className="row between">
                    <b>
                      <CategoryTag category={r.category} />
                    </b>
                    <span className={`pill ${r.kind === 'raise' ? 'warn' : r.kind === 'lower' ? 'good' : 'info'}`}>{r.kind === 'raise' ? 'Too tight' : r.kind === 'lower' ? 'Too loose' : 'Not set'}</span>
                  </div>
                  <p className="soft" style={{ fontSize: 13, margin: '8px 0 10px' }}>
                    {r.reason}
                  </p>
                  <div className="row between">
                    <span className="num" style={{ fontSize: 13 }}>
                      <span className="muted">avg {money(r.average)} · </span>
                      {r.current > 0 ? `${money(r.current)} → ` : ''}
                      <b>{money(r.suggested)}</b>
                    </span>
                    <button className="btn sm primary" onClick={() => apply(r.category, r.suggested)}>
                      Apply
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty icon={<Sparkles />} title="Your budgets fit your spending">
              Every budget is within 10% above and 25% below your recent average, so there is nothing to adjust.
            </Empty>
          )}
        </Card>
      </div>
    </div>
  );
}
