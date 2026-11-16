import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CalendarClock } from 'lucide-react';
import { AXIS, CURSOR_BAR, CURSOR_LINE, GRID, Legend, Tip } from '../components/charts';
import { Card, CategoryTag, Delta, Empty, PageHead } from '../components/ui';
import { SERIES } from '../lib/categories';
import { addMonths, dayOf, daysInMonth, fmtDate, fmtDayMonth, monthEnd, monthLabel, monthStart } from '../lib/dates';
import { change, money, moneyAxis, moneySigned, pct, plural, round2 } from '../lib/format';
import { dailySeries, isInProgress } from '../engine/metrics';
import type { Snapshot } from '../engine/snapshot';

export default function CashFlow({ s }: { s: Snapshot }) {
  const months = useMemo(() => s.monthly.filter((m) => m.count > 0 || m.inProgress), [s.monthly]);
  const [a, setA] = useState(s.focusMonth);
  const [b, setB] = useState(addMonths(s.focusMonth, -1));
  // Follow the period chosen in the top bar.
  useEffect(() => {
    setA(s.focusMonth);
    setB(addMonths(s.focusMonth, -1));
  }, [s.focusMonth]);

  const point = (mk: string) => s.monthly.find((m) => m.month === mk);
  const pa = point(a);
  const pb = point(b);
  const running = isInProgress(a, s.today);
  const elapsed = running ? dayOf(s.today) : daysInMonth(a);

  const days = useMemo(() => {
    const list = dailySeries(s.txs, s.settings.openingBalance, monthStart(a), monthEnd(a));
    return list.map((d) => ({
      ...d,
      outflow: -d.expenses,
      // The balance line stops at today: future days have not happened.
      balance: d.date > s.today ? null : d.balance,
    }));
  }, [s.txs, s.settings.openingBalance, a, s.today]);

  const cumulative = useMemo(() => {
    const series = (mk: string) => {
      const list = dailySeries(s.txs, 0, monthStart(mk), monthEnd(mk));
      let acc = 0;
      return list.map((d) => {
        acc = round2(acc + d.expenses);
        return d.date > s.today ? null : acc;
      });
    };
    const sa = series(a);
    const sb = series(b);
    return Array.from({ length: Math.max(sa.length, sb.length) }, (_, i) => ({ day: i + 1, a: sa[i] ?? null, b: sb[i] ?? null }));
  }, [s.txs, a, b, s.today]);

  if (!pa || !s.txs.length) {
    return (
      <div className="page">
        <PageHead title="Cash flow" />
        <Card>
          <Empty icon={<CalendarClock />} title="No cash flow to show yet">
            Add or import transactions to see money in, money out and your running balance.
          </Empty>
        </Card>
      </div>
    );
  }

  const avgDaily = pa.expenses / Math.max(1, elapsed);
  const stats = [
    { label: 'Opening balance', value: money(pa.opening), note: `1 ${monthLabel(a).split(' ')[0]}` },
    { label: 'Total inflows', value: money(pa.income), note: plural(s.txs.filter((t) => t.date.startsWith(a) && t.type === 'income').length, 'payment'), tone: 'good' },
    { label: 'Total outflows', value: money(pa.expenses), note: plural(s.txs.filter((t) => t.date.startsWith(a) && t.type === 'expense').length, 'payment') },
    { label: 'Net cash flow', value: moneySigned(pa.net), note: `${pct(pa.savingsRate)} of income kept`, tone: pa.net >= 0 ? 'good' : 'bad' },
    { label: 'Avg. daily spending', value: money(avgDaily), note: `over ${elapsed} days` },
    { label: 'Monthly savings', value: money(Math.max(0, pa.net)), note: `target ${money(s.settings.savingsRateTarget * pa.income)}` },
    { label: running ? 'Balance today' : 'Closing balance', value: money(pa.closing), note: `${moneySigned(pa.closing - pa.opening)} in the month` },
  ];

  const compareRows = pb
    ? [
        { label: 'Total inflows', x: pa.income, y: pb.income, up: true },
        { label: 'Total outflows', x: pa.expenses, y: pb.expenses, up: false },
        { label: 'Net cash flow', x: pa.net, y: pb.net, up: true, signed: true },
        { label: 'Average daily spending', x: avgDaily, y: pb.expenses / daysInMonth(b), up: false },
        { label: 'Opening balance', x: pa.opening, y: pb.opening, up: true },
        { label: running ? 'Balance today' : 'Closing balance', x: pa.closing, y: pb.closing, up: true },
      ]
    : [];
  const next30 = s.upcoming.filter((u) => u.daysAway <= 30);
  const next30Total = round2(next30.reduce((acc, u) => acc + u.amount, 0));

  return (
    <div className="page">
      <PageHead title="Cash flow" sub={`Money in, money out and your running balance for ${monthLabel(a)}${running ? ' (in progress)' : ''}.`}>
        <label className="row">
          <span className="label">Month</span>
          <select className="select" style={{ width: 240 }} value={a} onChange={(e) => setA(e.target.value)}>
            {[...months].reverse().map((m) => (
              <option key={m.month} value={m.month}>
                {monthLabel(m.month)}
                {m.inProgress ? ' (in progress)' : ''}
              </option>
            ))}
          </select>
        </label>
      </PageHead>

      <div className="stack">
        <section className="stat-strip">
          {stats.map((st) => (
            <div className="stat" key={st.label}>
              <span>{st.label}</span>
              <b className={`num ${st.tone ?? ''}`}>{st.value}</b>
              <small className="num">{st.note}</small>
            </div>
          ))}
        </section>

        <div className="grid">
          <Card
            className="c-8"
            title="Daily cash flow"
            sub="Money in above the line, money out below"
            action={<Legend items={[{ label: 'Inflows', color: SERIES.income }, { label: 'Outflows', color: SERIES.expense }]} />}
          >
            <div className="chart" style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={days} stackOffset="sign" margin={{ top: 8, right: 4, left: -4, bottom: 0 }} barCategoryGap="18%">
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="day" {...AXIS} interval={1} />
                  <YAxis {...AXIS} tickFormatter={moneyAxis} width={56} />
                  <Tooltip cursor={CURSOR_BAR} content={(p) => <Tip {...p} title={(_, row) => fmtDate(String(row?.date))} fmt={(n) => money(Math.abs(n))} />} />
                  <ReferenceLine y={0} stroke="#3a4567" />
                  <Bar animationDuration={500} dataKey="income" name="Inflows" stackId="f" fill={SERIES.income} radius={[4, 4, 0, 0]} maxBarSize={16} />
                  <Bar animationDuration={500} dataKey="outflow" name="Outflows" stackId="f" fill={SERIES.expense} radius={[4, 4, 0, 0]} maxBarSize={16} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="divider" />
            <div className="mini-title">
              <span>Running balance</span>
              <span className="num">
                {money(pa.opening)} → <b style={{ color: 'var(--text)' }}>{money(pa.closing)}</b>
              </span>
            </div>
            <div className="chart" style={{ height: 230 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={days} margin={{ top: 8, right: 4, left: -4, bottom: 0 }}>
                  <defs>
                    <linearGradient id="g-bal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor={SERIES.blue} stopOpacity={0.3} />
                      <stop offset="1" stopColor={SERIES.blue} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="day" {...AXIS} interval={1} />
                  <YAxis {...AXIS} tickFormatter={moneyAxis} width={56} domain={['auto', 'auto']} />
                  <Tooltip cursor={CURSOR_LINE} content={(p) => <Tip {...p} title={(_, row) => fmtDate(String(row?.date))} />} />
                  <Area animationDuration={600} type="stepAfter" dataKey="balance" name="Balance" stroke={SERIES.blue} strokeWidth={2} fill="url(#g-bal)" dot={false} activeDot={{ r: 5, stroke: '#10162a', strokeWidth: 2 }} connectNulls={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card
            className="c-4"
            title="Upcoming recurring payments"
            sub={next30.length ? `${plural(next30.length, 'payment')} in the next 30 days · ${money(next30Total)}` : 'Expected from your payment history'}
            flush
            foot={next30.length ? `After these, your balance would be about ${money(s.balanceNow - next30Total)} before any new income or everyday spending.` : undefined}
          >
            {s.upcoming.length ? (
              s.upcoming.slice(0, 9).map((u) => (
                <div className="list-row" key={u.key}>
                  <div className="merchant-ico num" style={{ fontSize: 11, lineHeight: 1.1, textAlign: 'center' }}>
                    {fmtDayMonth(u.nextDate).split(' ')[0]}
                    <br />
                    {fmtDayMonth(u.nextDate).split(' ')[1]}
                  </div>
                  <div className="grow">
                    <b>{u.merchant}</b>
                    <div className="muted" style={{ fontSize: 12 }}>
                      <CategoryTag category={u.category} /> · {u.daysAway <= 0 ? 'due now' : u.daysAway === 1 ? 'tomorrow' : `in ${u.daysAway} days`}
                    </div>
                  </div>
                  <b className="num">{money(u.amount)}</b>
                </div>
              ))
            ) : (
              <Empty icon={<CalendarClock />} title="No upcoming payments detected">
                Recurring payments appear here once a merchant has charged a similar amount two months in a row.
              </Empty>
            )}
          </Card>

          <Card
            className="c-12"
            title="Compare months"
            sub="Pick any two months"
            action={
              <div className="row wrap">
                <select className="select sm" style={{ width: 170 }} value={a} onChange={(e) => setA(e.target.value)} aria-label="First month">
                  {[...months].reverse().map((m) => (
                    <option key={m.month} value={m.month}>
                      {monthLabel(m.month)}
                    </option>
                  ))}
                </select>
                <span className="muted">against</span>
                <select className="select sm" style={{ width: 170 }} value={b} onChange={(e) => setB(e.target.value)} aria-label="Second month">
                  {[...months].reverse().map((m) => (
                    <option key={m.month} value={m.month}>
                      {monthLabel(m.month)}
                    </option>
                  ))}
                </select>
              </div>
            }
          >
            {pb ? (
              <div className="grid">
                <div className="c-6">
                  <div className="table-wrap">
                    <table className="tbl">
                      <thead>
                        <tr>
                          <th style={{ paddingLeft: 0 }}>Measure</th>
                          <th className="right">{monthLabel(a)}</th>
                          <th className="right">{monthLabel(b)}</th>
                          <th className="right" style={{ paddingRight: 0 }}>
                            Change
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {compareRows.map((r) => (
                          <tr key={r.label}>
                            <td style={{ paddingLeft: 0 }}>{r.label}</td>
                            <td className="right num">
                              <b>{r.signed ? moneySigned(r.x) : money(r.x)}</b>
                            </td>
                            <td className="right num soft">{r.signed ? moneySigned(r.y) : money(r.y)}</td>
                            <td className="right" style={{ paddingRight: 0 }}>
                              <Delta value={change(r.x, r.y)} upIsGood={r.up} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {running && <p className="hint" style={{ marginTop: 10 }}>{monthLabel(a)} is still in progress, so its totals cover {elapsed} days against a full month.</p>}
                </div>
                <div className="c-6">
                  <div className="row between wrap" style={{ marginBottom: 6 }}>
                    <span className="label">Cumulative spending by day of month</span>
                    <Legend items={[{ label: monthLabel(a), color: SERIES.expense, kind: 'line' }, { label: monthLabel(b), color: SERIES.third, kind: 'line' }]} />
                  </div>
                  <div className="chart" style={{ height: 240 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={cumulative} margin={{ top: 8, right: 8, left: -4, bottom: 0 }}>
                        <CartesianGrid {...GRID} />
                        <XAxis dataKey="day" {...AXIS} interval={2} />
                        <YAxis {...AXIS} tickFormatter={moneyAxis} width={56} />
                        <Tooltip cursor={CURSOR_LINE} content={(p) => <Tip {...p} title={(l) => `Day ${l}`} />} />
                        <Line animationDuration={600} type="monotone" dataKey="a" name={monthLabel(a)} stroke={SERIES.expense} strokeWidth={2} dot={false} activeDot={{ r: 5, stroke: '#10162a', strokeWidth: 2 }} />
                        <Line animationDuration={600} type="monotone" dataKey="b" name={monthLabel(b)} stroke={SERIES.third} strokeWidth={2} dot={false} activeDot={{ r: 5, stroke: '#10162a', strokeWidth: 2 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            ) : (
              <Empty icon={<CalendarClock />} title={`No data for ${monthLabel(b)}`}>
                Choose a month that has transactions to compare with.
              </Empty>
            )}
          </Card>

          <Card className="c-12" title="Month by month" sub="Opening balance + inflows − outflows = closing balance" flush>
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th className="right">Opening balance</th>
                    <th className="right">Inflows</th>
                    <th className="right">Outflows</th>
                    <th className="right">Net cash flow</th>
                    <th className="right">Savings rate</th>
                    <th className="right">Closing balance</th>
                  </tr>
                </thead>
                <tbody>
                  {[...months].reverse().map((m) => (
                    <tr key={m.month}>
                      <td>
                        <b>{monthLabel(m.month)}</b> {m.inProgress && <span className="pill est">In progress</span>}
                      </td>
                      <td className="right num soft">{money(m.opening)}</td>
                      <td className="right num">{money(m.income)}</td>
                      <td className="right num">{money(m.expenses)}</td>
                      <td className={`right num ${m.net >= 0 ? 'good' : 'bad'}`}>
                        <b>{moneySigned(m.net)}</b>
                      </td>
                      <td className="right num soft">{pct(m.savingsRate)}</td>
                      <td className="right num">
                        <b>{money(m.closing)}</b>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
