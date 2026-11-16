import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CircleCheck, FlaskConical, RotateCcw, TrendingUp, TriangleAlert } from 'lucide-react';
import { AXIS, CURSOR_BAR, CURSOR_LINE, GRID, Legend, Tip } from '../components/charts';
import { Card, CategoryTag, Empty, MoneyInput, PageHead } from '../components/ui';
import { CATEGORY_COLOR, SERIES } from '../lib/categories';
import { monthLabel, monthShort } from '../lib/dates';
import { currencySymbol, money, moneyAxis, moneySigned, pct } from '../lib/format';
import type { ScenarioId } from '../engine/forecast';
import type { Snapshot } from '../engine/snapshot';
import { useStore } from '../store/useStore';

const SCENARIO_COLOR: Record<ScenarioId, string> = {
  conservative: SERIES.third,
  expected: SERIES.expense,
  optimistic: SERIES.income,
};

function Assumption({
  label,
  hint,
  value,
  model,
  max,
  step,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  /** The model's own estimate; undefined for inputs that have no estimate. */
  model?: number;
  max: number;
  step: number;
  onChange: (n: number | null) => void;
}) {
  const overridden = model !== undefined && Math.abs(value - model) > 0.005;
  return (
    <div className="field">
      <div className="row between">
        <span className="label">{label}</span>
        {overridden && (
          <button className="link" onClick={() => onChange(null)}>
            <RotateCcw size={11} style={{ verticalAlign: -1 }} /> Use estimate {money(model)}
          </button>
        )}
      </div>
      <MoneyInput value={Math.round(value * 100) / 100} onCommit={(n) => onChange(n)} ariaLabel={label} symbol={currencySymbol()} />
      <input type="range" min={0} max={max} step={step} value={Math.min(max, value)} aria-label={`${label} slider`} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="hint">{hint}</span>
    </div>
  );
}

export default function Forecast({ s }: { s: Snapshot }) {
  const setAssumptions = useStore((x) => x.setAssumptions);
  const a = useStore((x) => x.assumptions);
  const f = s.forecast;
  const [, expected] = f.scenarios;

  if (!s.txs.length) {
    return (
      <div className="page">
        <PageHead title="Financial forecast" />
        <Card>
          <Empty icon={<TrendingUp />} title="Nothing to forecast from yet">
            The forecast is built from your transaction history. Add or import transactions first.
          </Empty>
        </Card>
      </div>
    );
  }

  const basis =
    f.thinHistory
      ? `the month in progress only (${monthLabel(f.basisMonths[0] ?? s.focusMonth)}) — there is no complete month yet, so treat it with caution`
      : f.basisMonths.length === 1
        ? monthLabel(f.basisMonths[0])
        : `${f.basisMonths.map(monthShort).join(', ')} ${f.basisMonths[f.basisMonths.length - 1].slice(0, 4)}`;

  // Past months as actuals, then the forecast month as an estimate.
  const bars = [
    ...f.history
      .filter((m) => m.month < f.targetMonth && m.count > 0)
      .slice(-4)
      .map((m) => ({ name: m.inProgress ? `${m.label} (so far)` : m.label, month: m.month, income: m.income, expenses: m.expenses, estimate: false })),
    { name: `${monthShort(f.targetMonth)} (estimate)`, month: f.targetMonth, income: expected.income, expenses: expected.expenses, estimate: true },
  ];
  const firstEstimate = f.path.find((p) => p.actual === undefined)?.label;
  const lastLabel = f.path[f.path.length - 1].label;
  const maxCat = Math.max(1, ...f.categories.map((c) => Math.max(c.amount, c.average)));

  return (
    <div className="page">
      <PageHead
        title="Financial forecast"
        sub={`An estimate for ${f.targetLabel}, built from ${basis}. Adjust the assumptions and everything recalculates.`}
      >
        <span className="pill est">
          <FlaskConical /> Estimates, not actual data
        </span>
      </PageHead>

      <div className="stack">
        <div className="grid">
          {f.scenarios.map((sc) => (
            <div key={sc.id} className={`scenario c-4 ${sc.id === 'expected' ? 'main' : ''}`} style={{ ['--sc' as string]: SCENARIO_COLOR[sc.id] }}>
              <div className="row between">
                <h3>{sc.label}</h3>
                <span className={`pill ${sc.meetsTarget ? 'good' : 'warn'}`}>
                  {sc.meetsTarget ? <CircleCheck /> : <TriangleAlert />}
                  {sc.meetsTarget ? 'Meets target' : `${money(Math.abs(sc.gap))} short`}
                </span>
              </div>
              <div className={`big num ${sc.savings < 0 ? 'bad' : ''}`}>{moneySigned(sc.savings)}</div>
              <div className="muted" style={{ fontSize: 12.5 }}>
                expected savings · {pct(sc.savingsRate)} of income
              </div>
              <div className="divider" style={{ margin: '14px 0 6px' }} />
              <div className="num-row">
                <span>Income</span>
                <b className="num">{money(sc.income)}</b>
              </div>
              <div className="num-row">
                <span>Expenses</span>
                <b className="num">{money(sc.expenses)}</b>
              </div>
              <div className="num-row">
                <span>Ending balance</span>
                <b className="num">{money(sc.endBalance)}</b>
              </div>
              <p className="hint" style={{ marginTop: 10 }}>
                {sc.note}
              </p>
            </div>
          ))}
        </div>

        <div className="grid">
          <Card className="c-4" title="Assumptions" sub="Change any figure to test a what-if">
            <div className="stack" style={{ gap: 18 }}>
              <Assumption
                label="Monthly income"
                hint={`Model estimate ${money(f.modelIncome)} from your recent months.`}
                value={f.income}
                model={f.modelIncome}
                max={Math.max(1000, Math.ceil((f.modelIncome * 2) / 100) * 100)}
                step={10}
                onChange={(n) => setAssumptions({ income: n })}
              />
              <Assumption
                label="Expected expenses"
                hint={`Model estimate ${money(f.modelExpenses)}. Category projections scale with this figure.`}
                value={f.expenses}
                model={f.modelExpenses}
                max={Math.max(1000, Math.ceil((f.modelExpenses * 2) / 100) * 100)}
                step={10}
                onChange={(n) => setAssumptions({ expenses: n })}
              />
              <Assumption
                label="Savings target"
                hint="What you want to put aside next month."
                value={a.savingsTarget}
                max={Math.max(500, Math.ceil(f.modelIncome / 100) * 100)}
                step={10}
                onChange={(n) => setAssumptions({ savingsTarget: n ?? 0 })}
              />
              <Assumption
                label="Unexpected expenses"
                hint="A buffer for repairs, gifts, fees. Counted once in Expected, twice in Conservative, not at all in Optimistic."
                value={a.unexpected}
                max={500}
                step={5}
                onChange={(n) => setAssumptions({ unexpected: n ?? 0 })}
              />
              <button className="btn" onClick={() => setAssumptions({ income: null, expenses: null, savingsTarget: 500, unexpected: 50 })}>
                <RotateCcw /> Reset all assumptions
              </button>
            </div>
          </Card>

          <div className="c-8 stack">
            <Card
              title="Balance projection"
              sub={`Solid line: actual month-end balances. Dashed lines: three scenarios${f.startIsProjected ? ', starting from the projected end of the month in progress' : ''}.`}
              action={
                <Legend
                  items={[
                    { label: 'Actual', color: SERIES.blue, kind: 'line' },
                    { label: 'Conservative', color: SCENARIO_COLOR.conservative, kind: 'dash' },
                    { label: 'Expected', color: SCENARIO_COLOR.expected, kind: 'dash' },
                    { label: 'Optimistic', color: SCENARIO_COLOR.optimistic, kind: 'dash' },
                  ]}
                />
              }
            >
              <div className="chart" style={{ height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={f.path} margin={{ top: 18, right: 14, left: -4, bottom: 0 }}>
                    <CartesianGrid {...GRID} />
                    <XAxis dataKey="label" {...AXIS} />
                    <YAxis {...AXIS} tickFormatter={moneyAxis} width={56} domain={['auto', 'auto']} />
                    {firstEstimate && (
                      <ReferenceArea x1={firstEstimate} x2={lastLabel} fill="#8b6cff" fillOpacity={0.05} stroke="#4a5578" strokeDasharray="4 4" label={{ value: 'Estimate', position: 'insideTopLeft', fill: '#a9b2ca', fontSize: 11.5 }} />
                    )}
                    <Tooltip cursor={CURSOR_LINE} content={(p) => <Tip {...p} title={(_, row) => monthLabel(String(row?.month)) + (row?.actual === undefined ? ' · estimate' : ' · actual')} />} />
                    <Line animationDuration={600} type="monotone" dataKey="conservative" name="Conservative" stroke={SCENARIO_COLOR.conservative} strokeWidth={2} strokeDasharray="6 5" dot={{ r: 3, strokeWidth: 0, fill: SCENARIO_COLOR.conservative }} />
                    <Line animationDuration={600} type="monotone" dataKey="expected" name="Expected" stroke={SCENARIO_COLOR.expected} strokeWidth={2} strokeDasharray="6 5" dot={{ r: 3, strokeWidth: 0, fill: SCENARIO_COLOR.expected }} />
                    <Line animationDuration={600} type="monotone" dataKey="optimistic" name="Optimistic" stroke={SCENARIO_COLOR.optimistic} strokeWidth={2} strokeDasharray="6 5" dot={{ r: 3, strokeWidth: 0, fill: SCENARIO_COLOR.optimistic }} />
                    <Line animationDuration={600} type="monotone" dataKey="actual" name="Actual" stroke={SERIES.blue} strokeWidth={2.5} dot={{ r: 4, strokeWidth: 0, fill: SERIES.blue }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <p className="hint" style={{ marginTop: 8 }}>
                Months after {f.targetLabel} repeat the same monthly figures, so the lines show where each scenario leads if it continued for three months.
              </p>
            </Card>

            <Card
              title="Income and expenses: actual against forecast"
              sub="Hatched-outline bars are estimates"
              action={<Legend items={[{ label: 'Income', color: SERIES.income }, { label: 'Expenses', color: SERIES.expense }]} />}
            >
              <div className="chart" style={{ height: 240 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={bars} barGap={3} barCategoryGap="26%" margin={{ top: 8, right: 4, left: -4, bottom: 0 }}>
                    <CartesianGrid {...GRID} />
                    <XAxis dataKey="name" {...AXIS} />
                    <YAxis {...AXIS} tickFormatter={moneyAxis} width={56} />
                    <Tooltip cursor={CURSOR_BAR} content={(p) => <Tip {...p} title={(_, row) => monthLabel(String(row?.month)) + (row?.estimate ? ' · estimate (expected scenario)' : ' · actual')} />} />
                    {(['income', 'expenses'] as const).map((k) => {
                      const color = k === 'income' ? SERIES.income : SERIES.expense;
                      return (
                        <Bar animationDuration={500} key={k} dataKey={k} name={k === 'income' ? 'Income' : 'Expenses'} fill={color} radius={[4, 4, 0, 0]} maxBarSize={28}>
                          {bars.map((b) => (
                            <Cell key={b.month} fill={color} fillOpacity={b.estimate ? 0.28 : 1} stroke={b.estimate ? color : 'none'} strokeWidth={b.estimate ? 1.5 : 0} strokeDasharray={b.estimate ? '4 3' : undefined} />
                          ))}
                        </Bar>
                      );
                    })}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <Card
            className="c-7"
            title={`Projected spending by category · ${f.targetLabel}`}
            sub="Bar: forecast. Marker: your average over the basis months."
          >
            <div className="barlist">
              {f.categories.map((c) => (
                <div key={c.category}>
                  <div className="barlist-top">
                    <CategoryTag category={c.category} />
                    <span className="num nowrap">
                      <b>{money(c.amount)}</b>
                      <span className="muted"> · avg {money(c.average)} · last {money(c.last)}</span>
                    </span>
                  </div>
                  <div className="track" style={{ overflow: 'visible' }}>
                    <div className="fill" style={{ width: `${(c.amount / maxCat) * 100}%`, background: CATEGORY_COLOR[c.category], opacity: 0.85 }} />
                    <span className="mark" style={{ left: `calc(${(c.average / maxCat) * 100}% - 1px)` }} title={`Average ${money(c.average)}`} />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="c-5" title="How the forecast works" sub="A simple, transparent method — no black box">
            <div className="stack" style={{ gap: 10, fontSize: 13.5 }}>
              <p className="soft">
                <b style={{ color: 'var(--text)' }}>1. Recent history.</b> For income and for each spending category, take up to the three most recent complete months and weight them 1 : 2 : 3, so the newest month counts most.
              </p>
              <p className="soft">
                <b style={{ color: 'var(--text)' }}>2. Recent trend.</b> Add half of the average month-to-month change, then keep the result within 10% of the range actually observed so one unusual month cannot run away with it.
              </p>
              <p className="soft">
                <b style={{ color: 'var(--text)' }}>3. Scenarios.</b> Conservative: income −3%, spending +10%, buffer ×2. Expected: as estimated, buffer ×1. Optimistic: income +2%, spending −8%, no buffer.
              </p>
              <p className="soft">
                <b style={{ color: 'var(--text)' }}>4. Starting balance.</b> {f.startIsProjected ? `The month in progress is projected to its end first (${money(f.startBalance)}): what has happened, plus recurring bills still due, plus your usual daily spending for the days left.` : `Your actual balance of ${money(f.startBalance)}.`}
              </p>
              <div className="callout est">
                <FlaskConical />
                <span>A forecast describes what your history implies, not what will happen. It cannot see a rent rise, a bonus or a broken laptop coming.</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
