import { describe, expect, it } from 'vitest';
import type { RangeSelection, Transaction } from '../types';
import { buildDemoTransactions, DEMO_BUDGETS, DEMO_SETTINGS } from '../data/demo';
import { buildImport, detectDateFormat, guessMapping, parseAmount, parseCsv, parseDate, sampleCsv } from '../lib/csv';
import { categorize } from '../lib/categories';
import { answerQuestion, detectIntent, SUGGESTED_QUESTIONS } from './advisor';
import { trendEstimate } from './forecast';
import { balanceAt, totals } from './metrics';
import { buildReport, REPORTS } from './reports';
import { buildSnapshot } from './snapshot';

const TODAY = '2026-11-16';
const txs = buildDemoTransactions(TODAY);
const snap = (range: RangeSelection = { preset: 'month', month: '2026-11' }, transactions: Transaction[] = txs) =>
  buildSnapshot({
    transactions,
    budgets: DEMO_BUDGETS,
    settings: DEMO_SETTINGS,
    range,
    assumptions: { income: null, expenses: null, savingsTarget: 500, unexpected: 50 },
    today: TODAY,
  });

describe('demo data', () => {
  it('covers three complete months plus the running month', () => {
    expect(txs.length).toBeGreaterThanOrEqual(30);
    expect(new Set(txs.map((t) => t.date.slice(0, 7))).size).toBe(4);
    expect(txs.every((t) => t.date <= TODAY)).toBe(true);
  });

  it('matches the brief for a typical month', () => {
    const s = snap({ preset: 'month', month: '2026-08' });
    expect(s.totals.income).toBe(2200);
    const cat = Object.fromEntries(s.categories.map((c) => [c.category, c.amount]));
    expect(cat.Housing).toBe(650);
    expect(cat.Groceries).toBeGreaterThan(200);
    expect(cat.Groceries).toBeLessThan(240);
    expect(cat.Subscriptions).toBeCloseTo(34.96, 2);
  });
});

describe('metrics', () => {
  it('balance equals opening balance plus the net of all transactions', () => {
    const t = totals(txs);
    expect(balanceAt(txs, 3250, TODAY)).toBeCloseTo(3250 + t.net, 2);
    const s = snap();
    expect(s.monthly[s.monthly.length - 1].closing).toBeCloseTo(s.balanceNow, 2);
  });

  it('compares a running month with the same days of the previous month', () => {
    const s = snap();
    expect(s.compare.previous.to).toBe('2026-10-16');
    expect(s.focusInProgress).toBe(true);
  });

  it('category shares sum to 1', () => {
    const s = snap({ preset: 'all' });
    expect(s.categories.reduce((a, c) => a + c.share, 0)).toBeCloseTo(1, 6);
  });
});

describe('recurring payments, forecast and health score', () => {
  const s = snap();

  it('detects fixed bills and subscriptions but not everyday shops', () => {
    const names = s.recurring.map((r) => r.merchant);
    for (const m of ['Netflix', 'Spotify', 'Disney+', 'Vattenfall', 'BVG', 'Hausverwaltung Berger', 'Nordwind Software GmbH']) {
      expect(names).toContain(m);
    }
    for (const m of ['REWE', 'Lidl', 'Edeka', 'Zalando', 'Lieferando']) expect(names).not.toContain(m);
    expect(s.subscriptionMonthly).toBeCloseTo(34.96, 2);
  });

  it('projects the running month and forecasts the next', () => {
    expect(s.projection.isProjected).toBe(true);
    expect(s.projection.expenses).toBeGreaterThan(s.projection.actualExpenses);
    expect(s.forecast.targetMonth).toBe('2026-12');
    expect(s.forecast.basisMonths).toEqual(['2026-08', '2026-09', '2026-10']);
    const [con, exp, opt] = s.forecast.scenarios;
    expect(con.savings).toBeLessThan(exp.savings);
    expect(exp.savings).toBeLessThan(opt.savings);
    expect(exp.endBalance).toBeCloseTo(s.forecast.startBalance + exp.savings, 2);
  });

  it('keeps the trend estimate within the observed band', () => {
    expect(trendEstimate([100, 100, 100])).toBe(100);
    expect(trendEstimate([100, 110, 140])).toBeGreaterThan(110);
    expect(trendEstimate([100, 110, 140])).toBeLessThanOrEqual(154);
  });

  it('scores health from 0 to 100 as the sum of its components', () => {
    const h = snap({ preset: 'month', month: '2026-10' }).health;
    expect(h.score).toBeGreaterThanOrEqual(0);
    expect(h.score).toBeLessThanOrEqual(100);
    expect(Math.round(h.components.reduce((a, c) => a + c.points, 0))).toBe(h.score);
    expect(h.previous).not.toBeNull();
  });

  it('produces all five insight types', () => {
    expect(new Set(s.insights.map((i) => i.type)).size).toBe(5);
  });
});

describe('advisor', () => {
  const s = snap({ preset: 'month', month: '2026-10' });

  it('routes the suggested questions to the right analysis', () => {
    const intents = SUGGESTED_QUESTIONS.map((q) => detectIntent(q, s).intent);
    expect(intents).toEqual(['topSpending', 'increase', 'save', 'subscriptions', 'category', 'earnVsSpend', 'monthEnd', 'improve']);
    expect(detectIntent('how much did I spend on healthcare?', s).intent).toBe('category');
    expect(detectIntent('what is my health score', s).intent).toBe('health');
  });

  it('answers with figures from the data', () => {
    expect(answerQuestion('How much am I spending on restaurants?', s).headline).toContain('222.70');
    const questions = [
      ...SUGGESTED_QUESTIONS,
      'Am I within my budgets?',
      'What does next month look like?',
      'What is my income?',
      'What is my balance?',
      'What was my largest purchase?',
      'How much at Netflix?',
      'Anything unusual?',
      'What recurring payments are coming up?',
      'gibberish xyz',
    ];
    for (const q of questions) {
      const r = answerQuestion(q, s);
      expect(r.headline.length).toBeGreaterThan(10);
      expect(JSON.stringify(r)).not.toMatch(/NaN|undefined|Infinity/);
    }
  });

  it('handles an empty dataset', () => {
    const e = snap({ preset: 'month', month: '2026-11' }, []);
    expect(e.health.score).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(e.insights)).not.toMatch(/NaN|undefined/);
    expect(answerQuestion('Where is most of my money going?', e).headline).toMatch(/no transactions/i);
  });
});

describe('reports', () => {
  it('builds every report without bad values', () => {
    for (const r of REPORTS) {
      const rep = buildReport(r.id, txs, DEMO_BUDGETS, DEMO_SETTINGS, '2026-10', TODAY);
      expect(rep.sections.length).toBeGreaterThan(0);
      expect(JSON.stringify(rep)).not.toMatch(/NaN|undefined/);
    }
  });
});

describe('csv import', () => {
  it('parses European and US number formats', () => {
    expect(parseAmount('-1.234,56')).toBe(-1234.56);
    expect(parseAmount('1,234.56')).toBe(1234.56);
    expect(parseAmount('€ 12,50')).toBe(12.5);
    expect(parseAmount('(45.10)')).toBe(-45.1);
    expect(parseAmount('45,10-')).toBe(-45.1);
    expect(parseAmount('2.200,00')).toBe(2200);
    expect(parseAmount('abc')).toBeNull();
  });

  it('parses dates in several layouts', () => {
    expect(parseDate('03.12.2026', 'dmy')).toBe('2026-12-03');
    expect(parseDate('12/03/2026', 'mdy')).toBe('2026-12-03');
    expect(parseDate('2026-12-03T10:00:00', 'ymd')).toBe('2026-12-03');
    expect(parseDate('31.02.2026', 'dmy')).toBeNull();
    expect(detectDateFormat(['01/13/2026', '02/03/2026'])).toBe('mdy');
  });

  it('maps, categorises and de-duplicates the sample statement', () => {
    const parsed = parseCsv(sampleCsv(TODAY));
    const mapping = guessMapping(parsed.headers);
    expect(mapping).toMatchObject({ date: 'Booking date', merchant: 'Payee', description: 'Reference', amount: 'Amount (EUR)' });

    const rows = buildImport(parsed, mapping, { dateFormat: 'auto', sign: 'signed' }, txs);
    expect(rows.every((r) => r.draft && !r.error)).toBe(true);
    expect(rows.some((r) => r.duplicate)).toBe(false);
    const cat = Object.fromEntries(rows.map((r) => [r.draft!.merchant, r.draft!.category]));
    expect(cat).toMatchObject({
      'Shell Station': 'Transportation',
      'Trattoria Luna': 'Restaurants',
      Ryanair: 'Travel',
      'Trade Republic': 'Investments',
      'Apotheke Mitte': 'Healthcare',
      Coursera: 'Education',
      Cinestar: 'Entertainment',
      'Carrefour Express': 'Groceries',
      Uber: 'Transportation',
      MediaMarkt: 'Shopping',
      'Studio Kollektiv': 'Freelance Income',
    });

    const imported = rows.map((r, i) => ({ ...r.draft!, id: `X${i}` }));
    const again = buildImport(parsed, mapping, { dateFormat: 'auto', sign: 'signed' }, [...txs, ...imported]);
    expect(again.every((r) => r.duplicate)).toBe(true);
  });

  it('prefers your own past categorisation over keyword rules', () => {
    expect(categorize('Kiez Cut', '', 'expense', txs)).toEqual({ category: 'Other', source: 'history' });
    expect(categorize('Lufthansa', 'Flight', 'expense', [])).toEqual({ category: 'Travel', source: 'rule' });
  });
});
