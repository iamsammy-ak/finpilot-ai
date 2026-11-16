import { useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowLeftRight,
  Banknote,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Info,
  Landmark,
  Percent,
  PiggyBank,
  Receipt,
  Sparkles,
  TrendingUp,
  TriangleAlert,
  Upload,
  Wallet,
} from 'lucide-react';
import { AXIS, CURSOR_BAR, CURSOR_LINE, GRID, HealthGauge, Legend, SpendingDonut, Tip } from '../components/charts';
import { Card, CategoryTag, Delta, Empty, useUi } from '../components/ui';
import { fmtDayMonth, monthLabel, monthName } from '../lib/dates';
import { SERIES } from '../lib/categories';
import { money, moneyAxis, moneySigned, pct } from '../lib/format';
import { INSIGHT_LABEL, type Insight, type Tone } from '../engine/insights';
import type { Kpi, Snapshot } from '../engine/snapshot';
import { useStore } from '../store/useStore';

const KPI_ICON: Record<Kpi['id'], typeof Wallet> = {
  balance: Landmark,
  income: Banknote,
  expenses: Receipt,
  net: ArrowLeftRight,
  rate: Percent,
  savings: PiggyBank,
};

export const TONE_ICON: Record<Tone, typeof Info> = {
  good: CircleCheck,
  info: Info,
  warn: TriangleAlert,
  bad: CircleAlert,
};

export function InsightRow({ insight }: { insight: Insight }) {
  const navigate = useUi((s) => s.navigate);
  const Icon = TONE_ICON[insight.tone];
  return (
    <button className="insight" onClick={() => navigate(insight.page)}>
      <span className={`insight-ico ${insight.tone}`}>
        <Icon className={insight.tone === 'info' ? '' : insight.tone} />
      </span>
      <span className="grow">
        <span className="insight-type">{INSIGHT_LABEL[insight.type]}</span>
        <span className="insight-title" style={{ display: 'block' }}>
          {insight.title}
        </span>
        <span className="insight-body">{insight.body}</span>
      </span>
      <ChevronRight size={15} className="muted" style={{ flex: 'none', marginTop: 8 }} />
    </button>
  );
}

function Briefing({ s }: { s: Snapshot }) {
  const navigate = useUi((x) => x.navigate);
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const first = s.settings.name.trim().split(/\s+/)[0];
  const t = s.totals;
  const live = s.singleMonth && s.focusInProgress;
  // "in November", "over the last 3 months", "across all time"…
  const label = s.range.label;
  const where = s.singleMonth
    ? `in ${monthName(s.focusMonth)}`
    : label === 'All time'
      ? 'across all time'
      : label === 'Year to date'
        ? 'this year to date'
        : label.startsWith('Last')
          ? `over the ${label.toLowerCase()}`
          : `between ${label}`;

  let headline: string;
  if (!s.txs.length) headline = 'Add your first transactions to see where you stand.';
  else if (t.count === 0) headline = `No transactions are recorded ${where}.`;
  else if (t.net >= 0 && t.income > 0)
    headline = `You have kept ${money(t.net)} of the ${money(t.income)} you earned ${live ? 'so far ' : ''}${where}.`;
  else if (t.income === 0) headline = `You have spent ${money(t.expenses)} ${where} with no income recorded yet.`;
  else headline = `You have spent ${money(Math.abs(t.net))} more than you earned ${where}.`;

  const p = s.projection;
  const points: { tone: Tone; text: string }[] = [];
  if (live && p.isProjected && s.txs.length) {
    points.push({
      tone: p.net >= 0 ? 'info' : 'bad',
      text: `At your usual pace ${monthName(s.focusMonth)} ends with ${money(p.net)} ${p.net >= 0 ? 'saved' : 'overspent'} (${pct(p.savingsRate)} savings rate). That figure is an estimate.`,
    });
  }
  for (const i of s.insights.filter((x) => x.tone === 'bad' || x.tone === 'warn').slice(0, live ? 2 : 3)) {
    points.push({ tone: i.tone, text: `${i.title}. ${i.body}` });
  }
  if (!points.length && s.txs.length) points.push({ tone: 'good', text: 'Nothing needs your attention right now: budgets, cash flow and spending patterns all look normal.' });

  const h = s.health;
  const diff = h.previous ? h.score - h.previous.score : null;
  return (
    <section className="briefing">
      <div className="briefing-main">
        <div className="briefing-kicker">
          <span>
            {hello}
            {first ? `, ${first}` : ''}
          </span>
          <span className="pill violet">{s.range.label}</span>
          {live && <span className="pill est">Month in progress</span>}
        </div>
        <h1>{headline}</h1>
        <div className="briefing-points">
          {points.map((pt, i) => {
            const Icon = TONE_ICON[pt.tone];
            return (
              <div key={i}>
                <Icon className={pt.tone === 'info' ? 'soft' : pt.tone} />
                <span>{pt.text}</span>
              </div>
            );
          })}
        </div>
        <div className="row wrap" style={{ marginTop: 20 }}>
          <button className="btn primary" onClick={() => navigate('advisor')}>
            <Sparkles /> Ask your AI CFO
          </button>
          <button className="btn" onClick={() => navigate('forecast')}>
            <TrendingUp /> See the forecast
          </button>
        </div>
      </div>
      <div className="briefing-side">
        <div className="card-sub" style={{ marginBottom: 6 }}>
          Financial health · {monthLabel(h.month)}
        </div>
        <HealthGauge score={h.score} />
        <div className="row" style={{ marginTop: 10 }}>
          <span className={`pill ${h.score >= 70 ? 'good' : h.score >= 55 ? 'warn' : 'bad'}`}>{h.grade}</span>
          {diff !== null && (
            <span className="muted" style={{ fontSize: 12.5 }}>
              <b className={diff >= 0 ? 'good' : 'bad'}>{diff >= 0 ? '+' : '−'}{Math.abs(diff)}</b> vs {monthName(h.previous!.month)}
            </span>
          )}
        </div>
        {h.isProjected && (
          <div className="hint" style={{ marginTop: 8, textAlign: 'center' }}>
            Uses projected month-end figures
          </div>
        )}
        <a className="link" href="#health" style={{ marginTop: 10 }} onClick={(e) => { e.preventDefault(); document.getElementById('health')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
          How this score is calculated
        </a>
      </div>
    </section>
  );
}

function KpiStrip({ s }: { s: Snapshot }) {
  const target = s.settings.savingsRateTarget;
  return (
    <section className="kpis" aria-label="Key figures">
      {s.kpis.map((k) => {
        const Icon = KPI_ICON[k.id];
        const fmt = k.format === 'pct' ? (n: number) => pct(n) : money;
        return (
          <div className="kpi" key={k.id}>
            <div className="kpi-label">
              <Icon />
              {k.label}
            </div>
            <div className={`kpi-value num ${k.id === 'net' && k.value < 0 ? 'bad' : ''}`}>{k.id === 'net' ? moneySigned(k.value) : fmt(k.value)}</div>
            <div className="kpi-foot">
              <Delta value={k.change} upIsGood={k.upIsGood} points={k.points} />
              <span className="num">
                {k.id === 'rate' ? `target ${pct(target, 0)}` : k.change === null ? 'no earlier period' : `was ${fmt(k.previous)}`}
              </span>
            </div>
          </div>
        );
      })}
    </section>
  );
}

function HealthDetail({ s }: { s: Snapshot }) {
  const [showMethod, setShowMethod] = useState(false);
  const h = s.health;
  return (
    <Card
      className="c-12"
      title="Financial health score"
      sub={`${monthLabel(h.month)} · four components, 25 points each${h.isProjected ? ' · month still running, so savings and cash flow use projected month-end figures' : ''}`}
      action={
        <button className="btn sm" onClick={() => setShowMethod(!showMethod)} aria-expanded={showMethod}>
          {showMethod ? 'Hide' : 'Show'} methodology
        </button>
      }
    >
      <div className="grid" id="health" style={{ scrollMarginTop: 90 }}>
        <div className="c-5">
          {h.components.map((c) => (
            <div className="score-comp" key={c.id}>
              <div>
                <b>{c.label}</b>
                <div className="muted" style={{ fontSize: 12.5 }}>
                  {c.value}
                </div>
              </div>
              <div className="right">
                <b className="num">{c.points.toFixed(1)}</b>
                <span className="muted"> / 25</span>
              </div>
              <div className="track" style={{ gridColumn: '1 / -1', marginTop: 4 }}>
                <div className={`fill ${c.score >= 70 ? 'ok' : c.score >= 45 ? 'warn' : 'over'}`} style={{ width: `${c.score}%` }} />
              </div>
              {showMethod && (
                <div className="hint" style={{ gridColumn: '1 / -1', marginTop: 4 }}>
                  {c.method}
                </div>
              )}
            </div>
          ))}
          <div className="row between" style={{ paddingTop: 12 }}>
            <b>Total</b>
            <span>
              <b className="num" style={{ fontSize: 18 }}>
                {h.score}
              </b>
              <span className="muted"> / 100 · {h.grade}</span>
            </span>
          </div>
        </div>
        <div className="c-7 stack">
          <div>
            <div className="label" style={{ marginBottom: 8 }}>
              {h.previous ? `Why it ${h.score >= h.previous.score ? 'rose' : 'fell'} from ${h.previous.score} in ${monthLabel(h.previous.month)}` : 'Change since last month'}
            </div>
            {h.changes.length === 0 && <p className="soft">{h.previous ? 'No component moved by more than a tenth of a point.' : 'There is no earlier month to compare with yet.'}</p>}
            {h.changes.map((c) => (
              <div className="num-row" key={c.label}>
                <span>
                  <b style={{ color: 'var(--text)' }}>{c.label}</b> · {c.text}
                </span>
                <b className={`num ${c.delta >= 0 ? 'good' : 'bad'}`}>
                  {c.delta >= 0 ? '+' : '−'}
                  {Math.abs(c.delta).toFixed(1)} pts
                </b>
              </div>
            ))}
          </div>
          <div>
            <div className="label" style={{ marginBottom: 8 }}>
              How to raise it
            </div>
            <div className="stack" style={{ gap: 8 }}>
              {h.recommendations.map((r, i) => (
                <div className="callout" key={i}>
                  <Sparkles />
                  <span>{r}</span>
                </div>
              ))}
            </div>
          </div>
          {showMethod && (
            <div className="callout">
              <Info />
              <span>
                Score = savings rate + budget adherence + cash flow stability + spending consistency, each scored 0–100 and weighted 25%. Bands: 85+ excellent, 70+ strong, 55+ fair, 40+ needs attention. Every input is calculated from your recorded transactions and budgets; nothing is estimated except the remainder of a month that is still running.
              </span>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

export default function Overview({ s }: { s: Snapshot }) {
  const navigate = useUi((x) => x.navigate);
  const isDemo = useStore((x) => x.isDemo);
  const months = s.monthly.slice(-6).map((m) => ({ ...m, name: m.inProgress ? `${m.label}*` : m.label }));
  const hasRunning = months.some((m) => m.inProgress);
  const recent = [...s.rangeTx].reverse().slice(0, 7);
  const budgets = [...s.budget.rows].sort((a, b) => b.used - a.used).slice(0, 6);
  const last = s.monthly[s.monthly.length - 1];

  return (
    <div className="page">
      {isDemo && (
        <div className="banner">
          <Info />
          <span className="grow">
            You are exploring demo data for a sample user. Every figure on this page is calculated from the {s.txs.length} demo transactions.
          </span>
          <button className="btn sm" onClick={() => navigate('transactions')}>
            <Upload /> Import your own
          </button>
        </div>
      )}
      <div className="stack">
        <Briefing s={s} />
        <KpiStrip s={s} />
        <div className="hint" style={{ marginTop: -8 }}>
          Changes compare {s.compare.current.label} with {s.compare.previous.label}.
        </div>

        <div className="grid">
          <Card
            className="c-7"
            title="Cash flow overview"
            sub={`Income against expenses by month${hasRunning ? ' · * month in progress' : ''}`}
            action={<Legend items={[{ label: 'Income', color: SERIES.income }, { label: 'Expenses', color: SERIES.expense }]} />}
          >
            <div className="chart" style={{ height: 270 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={months} barGap={3} barCategoryGap="28%" margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="name" {...AXIS} />
                  <YAxis {...AXIS} tickFormatter={moneyAxis} width={52} />
                  <Tooltip
                    cursor={CURSOR_BAR}
                    content={(p) => (
                      <Tip
                        {...p}
                        title={(_, row) => monthLabel(String(row?.month)) + (row?.inProgress ? ' (so far)' : '')}
                        footer={(row) => `Net ${moneySigned(Number(row?.net ?? 0))}`}
                      />
                    )}
                  />
                  <Bar animationDuration={500} dataKey="income" name="Income" fill={SERIES.income} radius={[4, 4, 0, 0]} maxBarSize={26} />
                  <Bar animationDuration={500} dataKey="expenses" name="Expenses" fill={SERIES.expense} radius={[4, 4, 0, 0]} maxBarSize={26} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="c-5" title="Spending breakdown" sub={`${s.range.label} by category`}>
            {s.categories.length ? (
              <SpendingDonut categories={s.categories} total={s.totals.expenses} />
            ) : (
              <Empty icon={<Receipt />} title="No spending in this period">
                Pick another period in the date selector.
              </Empty>
            )}
          </Card>

          <Card className="c-6" title="Financial trends" sub="Month-end balance and monthly savings">
            <div className="grid" style={{ gap: 20 }}>
              {(
                [
                  { key: 'closing', label: 'Balance', color: SERIES.blue, value: money(last?.closing ?? 0) },
                  { key: 'net', label: 'Saved per month', color: SERIES.income, value: moneySigned(last?.net ?? 0) },
                ] as const
              ).map((c) => (
                <div className="half" key={c.key}>
                  <div className="mini-title">
                    <span>{c.label}</span>
                    <b className="num" style={{ color: 'var(--text)' }}>
                      {c.value}
                      {last?.inProgress ? ' so far' : ''}
                    </b>
                  </div>
                  <div className="chart" style={{ height: 170 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={months} margin={{ top: 10, right: 8, left: -10, bottom: 0 }}>
                        <defs>
                          <linearGradient id={`g-${c.key}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0" stopColor={c.color} stopOpacity={0.28} />
                            <stop offset="1" stopColor={c.color} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid {...GRID} />
                        <XAxis dataKey="name" {...AXIS} />
                        <YAxis {...AXIS} tickFormatter={moneyAxis} width={50} domain={c.key === 'closing' ? ['auto', 'auto'] : [(min: number) => Math.min(0, min), 'auto']} />
                        <Tooltip cursor={CURSOR_LINE} content={(p) => <Tip {...p} title={(_, row) => monthLabel(String(row?.month)) + (row?.inProgress ? ' (so far)' : '')} />} />
                        <Area animationDuration={600} type="monotone" dataKey={c.key} name={c.label} stroke={c.color} strokeWidth={2} fill={`url(#g-${c.key})`} dot={{ r: 3, fill: c.color, strokeWidth: 0 }} activeDot={{ r: 5, stroke: '#10162a', strokeWidth: 2 }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card
            className="c-6"
            title="Monthly budget performance"
            sub={`${monthLabel(s.budget.month)} · ${money(s.budget.totalSpent)} of ${money(s.budget.monthlyBudget)} used${s.focusInProgress ? ` · ${pct(s.budget.elapsed, 0)} of the month gone` : ''}`}
            action={
              <button className="link" onClick={() => navigate('budgets')}>
                Manage budgets
              </button>
            }
          >
            {budgets.length ? (
              <div className="barlist">
                {budgets.map((r) => (
                  <div key={r.category}>
                    <div className="barlist-top">
                      <CategoryTag category={r.category} />
                      <span className="num">
                        <b className={r.level === 'over' ? 'bad' : ''}>{money(r.spent)}</b>
                        <span className="muted"> / {money(r.budget)}</span>
                      </span>
                    </div>
                    <div className="track">
                      <div className={`fill ${r.level === 'over' ? 'over' : r.level === 'ok' || r.level === 'full' ? 'ok' : 'warn'}`} style={{ width: `${Math.min(100, r.used * 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Empty icon={<Wallet />} title="No budgets set">
                Set category budgets to track planned against actual spending.
                <div>
                  <button className="btn primary" onClick={() => navigate('budgets')}>
                    Set budgets
                  </button>
                </div>
              </Empty>
            )}
          </Card>

          <Card className="c-5" title="AI CFO insights" sub="Calculated from your transactions, budgets and history" flush>
            {s.insights.slice(0, 7).map((i) => (
              <InsightRow key={i.id} insight={i} />
            ))}
          </Card>

          <Card
            className="c-7"
            title="Recent transactions"
            sub={s.range.label}
            flush
            action={
              <button className="link" onClick={() => navigate('transactions')}>
                View all
              </button>
            }
          >
            {recent.length ? (
              <div className="table-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Merchant</th>
                      <th>Category</th>
                      <th>Date</th>
                      <th className="right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map((t) => (
                      <tr key={t.id}>
                        <td>
                          <div className="row">
                            <span className="merchant-ico">{t.merchant.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2).toUpperCase()}</span>
                            <div>
                              <div className="tx-merchant">{t.merchant}</div>
                              <div className="tx-desc">{t.description || t.method}</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <CategoryTag category={t.category} />
                        </td>
                        <td className="muted nowrap">{fmtDayMonth(t.date)}</td>
                        <td className={`right num nowrap ${t.type === 'income' ? 'good' : ''}`}>
                          <b>
                            {t.type === 'income' ? '+' : '−'}
                            {money(t.amount)}
                          </b>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty icon={<ArrowLeftRight />} title="No transactions in this period">
                Add one manually or import a CSV statement.
              </Empty>
            )}
          </Card>

          <HealthDetail s={s} />
        </div>
      </div>
    </div>
  );
}
