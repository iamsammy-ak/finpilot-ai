import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CalendarClock, ChevronLeft, ChevronRight, CircleCheck, Receipt, Repeat, Sparkles, TriangleAlert } from 'lucide-react';
import { AXIS, CURSOR_BAR, GRID, Legend, Tip } from '../components/charts';
import { Card, CategoryTag, Delta, Empty, PageHead, Segmented, useUi } from '../components/ui';
import { CATEGORY_COLOR, SERIES } from '../lib/categories';
import {
  dayOf,
  diffDays,
  eachDay,
  fmtDate,
  fmtDayMonth,
  monthEnd,
  monthKey,
  monthLabel,
  monthStart,
  monthsBetween,
  weekdayIndex,
} from '../lib/dates';
import { money, moneyAxis, moneySigned, pct, plural, round2 } from '../lib/format';
import { overlappingSubscriptions } from '../engine/insights';
import { byMerchant } from '../engine/metrics';
import { recurringKeyOf } from '../engine/recurring';
import type { Snapshot } from '../engine/snapshot';

const HEAT = ['#182039', '#3a2f7c', '#5a45b8', '#7658e8', '#a995ff'];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Plain-language findings for the selected period. Each one is computed, not templated filler. */
function autoInsights(s: Snapshot, daily: { date: string; amount: number }[]): string[] {
  const out: string[] = [];
  const vs = s.compare.previous.label;
  const movers = s.categoryChanges.filter((c) => c.change !== null && c.previous >= 20 && Math.abs(c.delta) >= 10);
  const up = [...movers].sort((a, b) => (b.change as number) - (a.change as number))[0];
  const down = [...movers].sort((a, b) => (a.change as number) - (b.change as number))[0];
  if (up && (up.change as number) > 0.05) out.push(`You spent ${pct(up.change as number, 0)} more on ${up.category.toLowerCase()} compared to ${vs}: ${money(up.current)} against ${money(up.previous)}.`);
  if (down && (down.change as number) < -0.05) out.push(`You spent ${pct(Math.abs(down.change as number), 0)} less on ${down.category.toLowerCase()} compared to ${vs}, a saving of ${money(Math.abs(down.delta))}.`);
  const top = s.categories[0];
  if (top) out.push(`${top.category} accounts for ${pct(top.share, 0)} of your total spending in ${s.range.label} (${money(top.amount)}).`);
  const transport = s.categories.find((c) => c.category === 'Transportation');
  if (transport && transport !== top) out.push(`Transportation expenses account for ${pct(transport.share, 0)} of your total spending.`);
  if (s.subscriptions.length) out.push(`Your subscription expenses total ${money(s.subscriptionMonthly)} per month across ${plural(s.subscriptions.length, 'service')} — ${money(s.subscriptionMonthly * 12)} a year.`);
  const spendDays = daily.filter((d) => d.amount > 0);
  if (spendDays.length) {
    const total = daily.reduce((a, d) => a + d.amount, 0);
    const weekend = daily.filter((d) => weekdayIndex(d.date) >= 5).reduce((a, d) => a + d.amount, 0);
    const peak = [...spendDays].sort((a, b) => b.amount - a.amount)[0];
    out.push(`You spent money on ${spendDays.length} of ${daily.length} days, averaging ${money(total / daily.length)} a day. Your most expensive day was ${fmtDayMonth(peak.date)} at ${money(peak.amount)}.`);
    if (total > 0) out.push(`Weekends (Saturday and Sunday) take ${pct(weekend / total, 0)} of your spending; they are ${pct(daily.filter((d) => weekdayIndex(d.date) >= 5).length / daily.length, 0)} of the days.`);
  }
  return out;
}

function Heatmap({ s, expenseByDay }: { s: Snapshot; expenseByDay: Map<string, number> }) {
  const months = monthsBetween(monthKey(s.range.from), monthKey(s.range.to > s.today ? s.today : s.range.to)).filter((m) => m <= monthKey(s.today) || s.txs.some((t) => t.date.startsWith(m)));
  const [idx, setIdx] = useState(months.length - 1);
  const month = months[Math.min(idx, months.length - 1)] ?? s.focusMonth;
  const days = eachDay(monthStart(month), monthEnd(month));
  const amounts = days.map((d) => expenseByDay.get(d) ?? 0);
  const nonZero = amounts.filter((a) => a > 0).sort((a, b) => a - b);
  const q = (p: number) => nonZero[Math.min(nonZero.length - 1, Math.floor(p * nonZero.length))] ?? 0;
  const cuts = [q(0.25), q(0.5), q(0.75)];
  const level = (a: number) => (a <= 0 ? 0 : a <= cuts[0] ? 1 : a <= cuts[1] ? 2 : a <= cuts[2] ? 3 : 4);
  const lead = weekdayIndex(days[0]);
  const cells: (string | null)[] = [...Array<null>(lead).fill(null), ...days];
  while (cells.length % 7) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
  const byWeekday = WEEKDAYS.map((_, w) => {
    const ds = days.filter((d) => weekdayIndex(d) === w && d <= s.today);
    return ds.length ? ds.reduce((a, d) => a + (expenseByDay.get(d) ?? 0), 0) / ds.length : 0;
  });
  const busiest = byWeekday.indexOf(Math.max(...byWeekday));

  return (
    <Card
      className="c-6"
      title="Spending heatmap"
      sub={`${monthLabel(month)} · brighter days cost more`}
      action={
        months.length > 1 ? (
          <div className="row" style={{ gap: 4 }}>
            <button className="icon-btn bare" aria-label="Previous month" disabled={idx <= 0} onClick={() => setIdx(Math.max(0, idx - 1))}>
              <ChevronLeft />
            </button>
            <button className="icon-btn bare" aria-label="Next month" disabled={idx >= months.length - 1} onClick={() => setIdx(Math.min(months.length - 1, idx + 1))}>
              <ChevronRight />
            </button>
          </div>
        ) : undefined
      }
    >
      <div className="heat" role="table" aria-label={`Daily spending for ${monthLabel(month)}`}>
        <div />
        {WEEKDAYS.map((w) => (
          <div className="heat-head" key={w}>
            {w}
          </div>
        ))}
        {weeks.map((week, wi) => (
          <div key={wi} style={{ display: 'contents' }}>
            <div className="heat-week">W{wi + 1}</div>
            {week.map((d, di) => {
              if (!d) return <div key={di} className="heat-cell empty" />;
              const a = expenseByDay.get(d) ?? 0;
              if (d > s.today) return <div key={di} className="heat-cell future" title={`${fmtDate(d)} · not yet`}>{dayOf(d)}</div>;
              const lv = level(a);
              return (
                <div key={di} className="heat-cell num" style={{ background: HEAT[lv], color: lv === 4 ? '#150f33' : undefined }} title={`${fmtDate(d)} · ${a > 0 ? money(a) : 'no spending'}`}>
                  {dayOf(d)}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="row between wrap" style={{ marginTop: 14 }}>
        <div className="heat-scale">
          <span>No spend</span>
          {HEAT.map((c, i) => (
            <i key={c} style={{ background: c }} title={i === 0 ? 'no spending' : i === 4 ? `over ${money(cuts[2])}` : `up to ${money(cuts[i - 1])}`} />
          ))}
          <span className="num">{nonZero.length ? `over ${money(cuts[2])}` : 'More'}</span>
        </div>
        {Math.max(...byWeekday) > 0 && (
          <span className="hint">
            Costliest weekday: <b style={{ color: 'var(--text)' }}>{WEEKDAYS[busiest]}</b>, averaging {money(byWeekday[busiest])}
          </span>
        )}
      </div>
    </Card>
  );
}

export default function Analytics({ s }: { s: Snapshot }) {
  const navigate = useUi((x) => x.navigate);
  const setTxQuery = useUi((x) => x.setTxQuery);
  const [scope, setScope] = useState<'all' | 'everyday'>('all');
  const recurringKeys = useMemo(() => new Set(s.recurring.map((r) => r.key)), [s.recurring]);
  const end = s.range.to > s.today && s.range.from <= s.today ? s.today : s.range.to;

  const expenseByDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of s.txs) if (t.type === 'expense') m.set(t.date, round2((m.get(t.date) ?? 0) + t.amount));
    return m;
  }, [s.txs]);

  const daily = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of s.rangeTx) {
      if (t.type !== 'expense') continue;
      if (scope === 'everyday' && recurringKeys.has(recurringKeyOf(t))) continue;
      m.set(t.date, (m.get(t.date) ?? 0) + t.amount);
    }
    return eachDay(s.range.from, end).map((date) => ({ date, amount: round2(m.get(date) ?? 0) }));
  }, [s.rangeTx, s.range.from, end, scope, recurringKeys]);

  // Long periods are grouped by week so the bars stay readable.
  const weekly = daily.length > 62;
  const trend = useMemo(() => {
    if (!weekly) return daily.map((d) => ({ ...d, label: String(dayOf(d.date)), title: fmtDate(d.date) }));
    const out: { date: string; amount: number; label: string; title: string }[] = [];
    for (let i = 0; i < daily.length; i += 7) {
      const chunk = daily.slice(i, i + 7);
      out.push({ date: chunk[0].date, amount: round2(chunk.reduce((a, d) => a + d.amount, 0)), label: fmtDayMonth(chunk[0].date), title: `${fmtDayMonth(chunk[0].date)} – ${fmtDayMonth(chunk[chunk.length - 1].date)}` });
    }
    return out;
  }, [daily, weekly]);
  const avg = trend.length ? trend.reduce((a, d) => a + d.amount, 0) / trend.length : 0;

  const insights = useMemo(() => autoInsights(s, daily), [s, daily]);
  const merchants = byMerchant(s.rangeTx).slice(0, 8);
  const mom = s.categoryChanges.slice(0, 8).map((c) => ({ ...c, name: c.category }));
  const recurring = s.recurring.filter((r) => r.type === 'expense');
  const recurringTotal = round2(recurring.filter((r) => r.nextDate).reduce((a, r) => a + r.amount, 0));
  const overlaps = overlappingSubscriptions(s);
  const typicalSpend = s.forecast.modelExpenses || s.totals.expenses;
  const maxCat = s.categories[0]?.amount ?? 1;
  const maxMerchant = merchants[0]?.amount ?? 1;
  const span = diffDays(s.range.from, end) + 1;

  if (!s.rangeTx.some((t) => t.type === 'expense')) {
    return (
      <div className="page">
        <PageHead title="Spending analytics" sub={s.range.label} />
        <Card>
          <Empty icon={<Receipt />} title="No spending recorded in this period">
            Choose a different period in the date selector, or add transactions.
            <div>
              <button className="btn primary" onClick={() => navigate('transactions')}>
                Go to transactions
              </button>
            </div>
          </Empty>
        </Card>
      </div>
    );
  }

  return (
    <div className="page">
      <PageHead
        title="Spending analytics"
        sub={`${s.range.label} · ${money(s.totals.expenses)} across ${plural(s.rangeTx.filter((t) => t.type === 'expense').length, 'purchase')} · compared with ${s.compare.previous.label}`}
      />
      <div className="grid">
        <Card className="c-12" title="What stands out" sub="Written from your figures for this period">
          <div className="grid" style={{ gap: 10 }}>
            {insights.map((text, i) => (
              <div className="callout c-6" key={i}>
                <Sparkles />
                <span>{text}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="c-6" title="Category-wise spending" sub="Share of total and number of purchases">
          <div className="barlist">
            {s.categories.map((c) => (
              <div key={c.category}>
                <div className="barlist-top">
                  <CategoryTag category={c.category} />
                  <span className="num nowrap">
                    <b>{money(c.amount)}</b>
                    <span className="muted">
                      {' '}
                      · {pct(c.share, 0)} · {c.count}×
                    </span>
                  </span>
                </div>
                <div className="track">
                  <div className="fill" style={{ width: `${(c.amount / maxCat) * 100}%`, background: CATEGORY_COLOR[c.category] }} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card
          className="c-6"
          title="Month-over-month comparison"
          sub={`${s.compare.current.label} against ${s.compare.previous.label}`}
          action={<Legend items={[{ label: s.compare.current.label, color: SERIES.expense }, { label: s.compare.previous.label, color: SERIES.neutral }]} />}
        >
          <div className="chart" style={{ height: Math.max(220, mom.length * 44) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={mom} layout="vertical" barGap={2} barCategoryGap="24%" margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#1d2540" horizontal={false} />
                <XAxis type="number" {...AXIS} tickFormatter={moneyAxis} />
                <YAxis type="category" dataKey="name" {...AXIS} width={104} tick={{ fill: '#a9b2ca', fontSize: 12 }} />
                <Tooltip
                  cursor={CURSOR_BAR}
                  content={(p) => (
                    <Tip
                      {...p}
                      footer={(row) => {
                        const ch = row?.change as number | null | undefined;
                        return `Change ${moneySigned(Number(row?.delta ?? 0))}${ch === null || ch === undefined ? '' : ` (${ch >= 0 ? '+' : '−'}${pct(Math.abs(ch), 0)})`}`;
                      }}
                    />
                  )}
                />
                <Bar animationDuration={500} dataKey="current" name={s.compare.current.label} fill={SERIES.expense} radius={[0, 4, 4, 0]} maxBarSize={12} />
                <Bar animationDuration={500} dataKey="previous" name={s.compare.previous.label} fill={SERIES.neutral} radius={[0, 4, 4, 0]} maxBarSize={12} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card
          className="c-8"
          title={weekly ? 'Weekly spending trend' : 'Daily spending trend'}
          sub={`${weekly ? 'Each bar is one week' : 'Each bar is one day'} · dashed line is the average, ${money(avg)}`}
          action={
            <Segmented
              label="Which spending to show"
              value={scope}
              onChange={setScope}
              options={[
                { value: 'all', label: 'All spending' },
                { value: 'everyday', label: 'Without recurring bills' },
              ]}
            />
          }
        >
          <div className="chart" style={{ height: 250 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trend} margin={{ top: 8, right: 4, left: -8, bottom: 0 }} barCategoryGap={span > 40 ? '12%' : '22%'}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="label" {...AXIS} interval={weekly ? 0 : trend.length > 20 ? 2 : 0} />
                <YAxis {...AXIS} tickFormatter={moneyAxis} width={52} />
                <Tooltip cursor={CURSOR_BAR} content={(p) => <Tip {...p} title={(_, row) => String(row?.title)} />} />
                <ReferenceLine y={avg} stroke="#76819f" strokeDasharray="4 4" />
                <Bar animationDuration={500} dataKey="amount" name="Spent" fill={SERIES.expense} radius={[4, 4, 0, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="c-4" title="Highest spending merchants" sub="Select a merchant to see its transactions">
          <div className="barlist">
            {merchants.map((m) => (
              <button
                key={m.key}
                style={{ textAlign: 'left' }}
                onClick={() => {
                  setTxQuery(m.merchant);
                  navigate('transactions');
                }}
              >
                <div className="barlist-top">
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <b>{m.merchant}</b> <span className="muted">· {m.count}×</span>
                  </span>
                  <b className="num">{money(m.amount)}</b>
                </div>
                <div className="track">
                  <div className="fill" style={{ width: `${(m.amount / maxMerchant) * 100}%`, background: CATEGORY_COLOR[m.category] }} />
                </div>
              </button>
            ))}
          </div>
        </Card>

        <Heatmap s={s} expenseByDay={expenseByDay} />

        <Card className="c-6" title="Spending anomalies" sub="Purchases and categories that break your normal pattern" flush>
          {s.anomalies.length ? (
            s.anomalies.map((a) => (
              <div className="insight" key={a.id}>
                <span className="insight-ico warn">
                  <TriangleAlert className="warn" />
                </span>
                <span className="grow">
                  <span className="insight-type">{a.kind === 'transaction' ? 'Unusual purchase' : 'Unusual category total'} · {a.category}</span>
                  <span className="insight-title" style={{ display: 'block' }}>
                    {a.title}
                  </span>
                  <span className="insight-body">{a.detail}</span>
                </span>
                <b className="num bad nowrap">{moneySigned(a.excess)}</b>
              </div>
            ))
          ) : (
            <Empty icon={<CircleCheck />} title="Nothing unusual in this period">
              A purchase is flagged at twice your typical purchase in its category; a category at 30% above its three-month average.
            </Empty>
          )}
        </Card>

        <Card
          className="c-6"
          title="Recurring expenses"
          sub={`${plural(recurring.filter((r) => r.nextDate).length, 'active payment')} · ${money(recurringTotal)} a month · ${typicalSpend > 0 ? pct(recurringTotal / typicalSpend, 0) : '0%'} of a typical month`}
          flush
        >
          {recurring.length ? (
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Merchant</th>
                    <th>Category</th>
                    <th>Usual day</th>
                    <th>Next</th>
                    <th className="right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {recurring.map((r) => (
                    <tr key={r.key}>
                      <td className="tx-merchant">{r.merchant}</td>
                      <td>
                        <CategoryTag category={r.category} />
                      </td>
                      <td className="soft num">{r.day}.</td>
                      <td className="soft nowrap">{r.nextDate ? fmtDayMonth(r.nextDate) : <span className="pill">Ended</span>}</td>
                      <td className="right num">
                        <b>{money(r.amount)}</b>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty icon={<Repeat />} title="No recurring payments detected yet">
              A payment is recognised once the same merchant charges a similar amount in two consecutive months.
            </Empty>
          )}
        </Card>

        <Card
          className="c-6"
          title="Subscription analysis"
          sub={s.subscriptions.length ? `${money(s.subscriptionMonthly)} a month · ${money(s.subscriptionMonthly * 12)} a year` : 'No active subscriptions found'}
        >
          {s.subscriptions.length ? (
            <div className="stack" style={{ gap: 12 }}>
              {s.subscriptions.map((r) => (
                <div className="row between" key={r.key}>
                  <div className="row">
                    <span className="merchant-ico">{r.merchant.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2).toUpperCase()}</span>
                    <div>
                      <b>{r.merchant}</b>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {r.description || 'Subscription'} · next {r.nextDate ? fmtDayMonth(r.nextDate) : '—'}
                      </div>
                    </div>
                  </div>
                  <div className="right">
                    <b className="num">{money(r.amount)}</b>
                    <div className="muted num" style={{ fontSize: 12 }}>
                      {money(r.amount * 12)} / yr
                    </div>
                  </div>
                </div>
              ))}
              {overlaps.map((g) => {
                const drop = g.items[g.items.length - 1];
                return (
                  <div className="callout" key={g.kind}>
                    <Sparkles />
                    <span>
                      You pay for {g.items.length} {g.kind} services. Cancelling {drop.merchant} would save {money(drop.amount)} a month ({money(drop.amount * 12)} a year). FinPilot sees what you pay, not how much you watch — that part is your call.
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <Empty icon={<CalendarClock />} title="No subscriptions found">
              Transactions in the Subscriptions category appear here with their yearly cost.
            </Empty>
          )}
        </Card>

        <Card className="c-12" title="Category changes" sub={`${s.compare.current.label} against ${s.compare.previous.label}`} flush>
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Category</th>
                  <th className="right">This period</th>
                  <th className="right">Previous</th>
                  <th className="right">Difference</th>
                  <th className="right">Change</th>
                </tr>
              </thead>
              <tbody>
                {s.categoryChanges.map((c) => (
                  <tr key={c.category}>
                    <td>
                      <CategoryTag category={c.category} />
                    </td>
                    <td className="right num">
                      <b>{money(c.current)}</b>
                    </td>
                    <td className="right num soft">{money(c.previous)}</td>
                    <td className={`right num ${c.delta > 0.5 ? 'bad' : c.delta < -0.5 ? 'good' : 'soft'}`}>{moneySigned(c.delta)}</td>
                    <td className="right">
                      <Delta value={c.change} upIsGood={false} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
