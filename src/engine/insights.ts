import type { PageId } from '../types';
import { fmtDayMonth, monthLabel, monthShort } from '../lib/dates';
import { money, pct, plural, round2 } from '../lib/format';
import type { Snapshot } from './snapshot';

export type InsightType = 'savings' | 'unusual' | 'budget' | 'cashflow' | 'improve';
export type Tone = 'good' | 'info' | 'warn' | 'bad';

export interface Insight {
  id: string;
  type: InsightType;
  tone: Tone;
  title: string;
  body: string;
  page: PageId;
}

export const INSIGHT_LABEL: Record<InsightType, string> = {
  savings: 'Savings opportunity',
  unusual: 'Unusual spending',
  budget: 'Budget warning',
  cashflow: 'Cash flow risk',
  improve: 'Improvement opportunity',
};

const VIDEO = /netflix|disney|prime video|amazon prime|hbo|max\b|dazn|apple tv|paramount|sky|wow|youtube premium/i;
const MUSIC = /spotify|apple music|deezer|tidal|youtube music/i;

/** Subscriptions that do the same job — the cheapest of each group is the obvious one to question. */
export function overlappingSubscriptions(s: Snapshot) {
  const groups: { kind: string; items: { merchant: string; amount: number }[] }[] = [];
  for (const [kind, re] of [
    ['video streaming', VIDEO],
    ['music streaming', MUSIC],
  ] as const) {
    const items = s.subscriptions.filter((r) => re.test(r.merchant)).map((r) => ({ merchant: r.merchant, amount: r.amount }));
    if (items.length >= 2) groups.push({ kind, items: items.sort((a, b) => b.amount - a.amount) });
  }
  return groups;
}

/**
 * Builds the executive insight list. Every sentence is assembled from figures
 * in the snapshot — nothing here is canned. Each of the five insight types is
 * always represented, with an "all clear" line when there is nothing to flag.
 */
export function buildInsights(s: Snapshot): Insight[] {
  const out: Insight[] = [];
  const m = monthLabel(s.focusMonth);
  const proj = s.projection;
  const est = proj.isProjected ? 'projected ' : '';

  /* 1. Savings opportunities ------------------------------------------------ */
  const subsTotal = s.subscriptionMonthly;
  const overlaps = overlappingSubscriptions(s);
  if (overlaps.length) {
    const g = overlaps[0];
    const drop = g.items[g.items.length - 1];
    out.push({
      id: 'sav-overlap',
      type: 'savings',
      tone: 'info',
      title: `You could save ${money(drop.amount)} a month on ${g.kind}`,
      body: `You pay for ${g.items.length} ${g.kind} services (${g.items.map((i) => `${i.merchant} ${money(i.amount)}`).join(', ')}). Cancelling ${drop.merchant} saves ${money(drop.amount * 12)} a year. All ${s.subscriptions.length} subscriptions total ${money(subsTotal)} a month.`,
      page: 'analytics',
    });
  } else if (s.subscriptions.length) {
    out.push({
      id: 'sav-subs',
      type: 'savings',
      tone: 'info',
      title: `Subscriptions cost ${money(subsTotal)} a month`,
      body: `${plural(s.subscriptions.length, 'subscription')} add up to ${money(subsTotal * 12)} a year. The largest is ${s.subscriptions[0].merchant} at ${money(s.subscriptions[0].amount)}.`,
      page: 'analytics',
    });
  }
  const target = s.settings.savingsRateTarget;
  if (proj.income > 0 && proj.savingsRate < target) {
    const extra = round2((target - proj.savingsRate) * proj.income);
    out.push({
      id: 'sav-rate',
      type: 'savings',
      tone: 'warn',
      title: `Raising your savings rate to ${pct(target, 0)} adds ${money(extra)} a month`,
      body: `Your ${est}savings rate for ${m} is ${pct(proj.savingsRate)} (${money(proj.net)} of ${money(proj.income)} income). Your target is ${pct(target, 0)}.`,
      page: 'budgets',
    });
  }
  const dining = s.monthCategories.find((c) => c.category === 'Restaurants');
  if (dining && dining.share >= 0.1) {
    out.push({
      id: 'sav-dining',
      type: 'savings',
      tone: 'info',
      title: `Cutting restaurants by a fifth saves ${money(dining.amount * 0.2)}`,
      body: `Restaurants are ${pct(dining.share, 0)} of your spending in ${m}: ${money(dining.amount)} across ${plural(dining.count, 'visit')}, about ${money(dining.amount / dining.count)} each.`,
      page: 'analytics',
    });
  }
  if (!out.some((i) => i.type === 'savings')) {
    out.push({
      id: 'sav-none',
      type: 'savings',
      tone: 'good',
      title: 'No obvious savings leaks',
      body: `You are saving ${pct(proj.savingsRate)} of income in ${m}, at or above your ${pct(target, 0)} target, with no overlapping subscriptions.`,
      page: 'analytics',
    });
  }

  /* 2. Unusual spending ----------------------------------------------------- */
  if (s.anomalies.length) {
    for (const a of s.anomalies.slice(0, 2)) {
      out.push({ id: `unu-${a.id}`, type: 'unusual', tone: 'warn', title: a.title, body: a.detail, page: 'analytics' });
    }
  } else {
    out.push({
      id: 'unu-none',
      type: 'unusual',
      tone: 'good',
      title: 'Nothing unusual',
      body: `No purchase or category in ${s.range.label} stands out against your normal pattern.`,
      page: 'analytics',
    });
  }

  /* 3. Budget warnings ------------------------------------------------------ */
  const b = s.budget;
  // A budget that is exactly used up (rent equal to its limit) is on plan, not a warning.
  const flagged = b.rows.filter((r) => r.level !== 'ok' && r.level !== 'full').sort((x, y) => y.used - x.used);
  for (const r of flagged.slice(0, 2)) {
    out.push({
      id: `bud-${r.category}`,
      type: 'budget',
      tone: r.level === 'over' ? 'bad' : 'warn',
      title:
        r.level === 'over'
          ? `${r.category} is ${money(r.spent - r.budget)} over budget`
          : `${r.category} has used ${pct(r.used, 0)} of its budget`,
      body:
        r.level === 'over'
          ? `${money(r.spent)} spent against a ${money(r.budget)} budget for ${m}.`
          : `${money(r.spent)} of ${money(r.budget)} spent, ${money(r.remaining)} left${b.elapsed < 1 ? ` with ${pct(1 - b.elapsed, 0)} of the month to go` : ''}.`,
      page: 'budgets',
    });
  }
  if (!flagged.length) {
    const ahead = b.rows.filter((r) => b.elapsed < 1 && r.used > b.elapsed + 0.25 && r.spent > 20).sort((x, y) => x.pace - y.pace)[0];
    if (ahead) {
      out.push({
        id: `bud-pace-${ahead.category}`,
        type: 'budget',
        tone: 'warn',
        title: `${ahead.category} is running ahead of pace`,
        body: `${pct(ahead.used, 0)} of the budget is used with ${pct(b.elapsed, 0)} of ${m} gone. At this pace it ends near ${money(ahead.spent / b.elapsed)} against ${money(ahead.budget)}.`,
        page: 'budgets',
      });
    } else if (b.rows.length) {
      out.push({
        id: 'bud-ok',
        type: 'budget',
        tone: 'good',
        title: `All ${b.rows.length} budgets are on track`,
        body: `${money(b.totalSpent)} spent of your ${money(b.monthlyBudget)} monthly budget for ${m} — ${money(b.monthlyBudget - b.totalSpent)} left.`,
        page: 'budgets',
      });
    } else {
      out.push({
        id: 'bud-none',
        type: 'budget',
        tone: 'info',
        title: 'No budgets set yet',
        body: 'Set category budgets to get warnings at 80%, 90% and 100% of each limit.',
        page: 'budgets',
      });
    }
  }

  /* 4. Cash flow risks ------------------------------------------------------ */
  const complete = s.monthly.filter((p) => !p.inProgress && p.count > 0).slice(-3);
  const avgExpenses = complete.length ? complete.reduce((a, p) => a + p.expenses, 0) / complete.length : proj.expenses;
  const runway = avgExpenses > 0 ? s.balanceNow / avgExpenses : Infinity;
  if (proj.net < 0) {
    out.push({
      id: 'cf-negative',
      type: 'cashflow',
      tone: 'bad',
      title: `${m} is ${est ? 'heading for' : 'at'} a ${money(Math.abs(proj.net))} shortfall`,
      body: `${est ? 'Projected spending' : 'Spending'} of ${money(proj.expenses)} exceeds income of ${money(proj.income)}. The gap comes out of your balance.`,
      page: 'cashflow',
    });
  }
  const dueSoon = s.upcoming.filter((u) => u.daysAway <= 7);
  const dueTotal = round2(dueSoon.reduce((a, u) => a + u.amount, 0));
  if (dueSoon.length && dueTotal > s.balanceNow) {
    out.push({
      id: 'cf-due',
      type: 'cashflow',
      tone: 'bad',
      title: `Bills due this week exceed your balance`,
      body: `${plural(dueSoon.length, 'payment')} totalling ${money(dueTotal)} ${dueSoon.length === 1 ? 'is' : 'are'} due within 7 days against a balance of ${money(s.balanceNow)}.`,
      page: 'cashflow',
    });
  }
  if (runway < 2 && Number.isFinite(runway)) {
    out.push({
      id: 'cf-runway',
      type: 'cashflow',
      tone: runway < 1 ? 'bad' : 'warn',
      title: `Your balance covers ${runway.toFixed(1)} months of spending`,
      body: `${money(s.balanceNow)} against average monthly spending of ${money(avgExpenses)}. A common safety buffer is three months (${money(avgExpenses * 3)}).`,
      page: 'cashflow',
    });
  }
  if (!out.some((i) => i.type === 'cashflow')) {
    const next = s.upcoming[0];
    out.push({
      id: 'cf-ok',
      type: 'cashflow',
      tone: 'good',
      title: Number.isFinite(runway) ? `Cash buffer covers ${runway.toFixed(1)} months of spending` : 'Cash flow is positive',
      body:
        `${est ? 'Projected net' : 'Net'} cash flow for ${m} is ${money(proj.net)}.` +
        (next ? ` Next recurring payment: ${next.merchant}, ${money(next.amount)} on ${fmtDayMonth(next.nextDate)}.` : ''),
      page: 'cashflow',
    });
  }

  /* 5. Improvement opportunities -------------------------------------------- */
  const riser = s.categoryChanges.filter((c) => c.delta >= 15 && c.previous > 0).sort((x, y) => y.delta - x.delta)[0];
  if (riser) {
    out.push({
      id: `imp-rise-${riser.category}`,
      type: 'improve',
      tone: 'warn',
      title: `${riser.category} spending is up ${money(riser.delta)}`,
      body: `${money(riser.current)}${s.focusInProgress ? ' so far' : ''} against ${money(riser.previous)} for ${s.compare.previous.label}${riser.change !== null ? ` (${pct(riser.change, 0)} more)` : ''}.`,
      page: 'analytics',
    });
  }
  const weakest = [...s.health.components].sort((x, y) => x.score - y.score)[0];
  if (weakest && weakest.score < 85) {
    out.push({
      id: `imp-health-${weakest.id}`,
      type: 'improve',
      tone: 'info',
      title: `${weakest.label} is holding your health score back`,
      body: `It scores ${Math.round(weakest.score)}/100 (${weakest.value}), contributing ${weakest.points.toFixed(1)} of a possible 25 points to your score of ${s.health.score}.`,
      page: 'overview',
    });
  }
  if (!out.some((i) => i.type === 'improve')) {
    out.push({
      id: 'imp-none',
      type: 'improve',
      tone: 'good',
      title: `Health score ${s.health.score}: ${s.health.grade.toLowerCase()}`,
      body: `Every component scores 85 or more and no category rose meaningfully against ${monthShort(s.prevMonth)}.`,
      page: 'overview',
    });
  }

  return out;
}
