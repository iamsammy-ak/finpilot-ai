import Papa from 'papaparse';
import type { Category, PaymentMethod, Transaction, TransactionDraft, TxType } from '../types';
import { PAYMENT_METHODS } from '../types';
import { categoriesFor, categorize, matchCategoryName, merchantKey } from './categories';
import { isValidISO } from './dates';
import { round2 } from './format';

export type CsvField = 'date' | 'merchant' | 'description' | 'amount' | 'debit' | 'credit' | 'type' | 'category' | 'method';
export type Mapping = Partial<Record<CsvField, string>>;
export type DateFormat = 'auto' | 'dmy' | 'mdy' | 'ymd';
export type SignMode = 'signed' | 'inverted' | 'allExpense' | 'allIncome';

export const FIELD_LABELS: Record<CsvField, { label: string; hint: string; required?: boolean }> = {
  date: { label: 'Date', hint: 'Booking or transaction date', required: true },
  merchant: { label: 'Merchant', hint: 'Payee, counterparty or name' },
  description: { label: 'Description', hint: 'Reference, memo or details' },
  amount: { label: 'Amount', hint: 'One column, negative = money out' },
  debit: { label: 'Money out', hint: 'Separate debit column, if any' },
  credit: { label: 'Money in', hint: 'Separate credit column, if any' },
  type: { label: 'Type', hint: 'Income / expense, credit / debit' },
  category: { label: 'Category', hint: 'Leave empty to auto-categorise' },
  method: { label: 'Payment method', hint: 'Card, transfer, cash…' },
};

const SYNONYMS: Record<CsvField, RegExp> = {
  date: /^(date|booking ?date|transaction ?date|value ?date|posted|posting ?date|datum|buchungstag|buchungsdatum|valuta|data|fecha|completed ?date|started ?date|time)$/i,
  merchant: /^(merchant|payee|name|counterparty|counter ?party|beneficiary|recipient|empf[aä]nger|auftraggeber|beguenstigter|zahlungsempf[aä]nger|esercente|beneficiario|comercio|partner|vendor|store)$/i,
  description: /^(description|details?|memo|reference|narrative|note|notes|purpose|verwendungszweck|buchungstext|descrizione|causale|concepto|text|particulars|label)$/i,
  amount: /^(amount|value|betrag|umsatz|importo|importe|montant|sum|total|amount ?\(?(eur|usd|gbp|chf|€|\$|£)?\)?)$/i,
  debit: /^(debit|money ?out|paid ?out|withdrawals?|soll|ausgang|uscite|addebito|d[eé]bit|outflow|spent)$/i,
  credit: /^(credit|money ?in|paid ?in|deposits?|haben|eingang|entrate|accredito|cr[eé]dit|inflow|received)$/i,
  type: /^(type|transaction ?type|direction|kind|art|tipo|dr\/cr|cr\/dr)$/i,
  category: /^(category|categor[iy]a|kategorie|cat[eé]gorie|group|tag)$/i,
  method: /^(method|payment ?method|payment ?type|channel|zahlungsart|metodo|medio)$/i,
};

export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
  delimiter: string;
}

export function parseCsv(text: string): ParsedCsv {
  const clean = text.replace(/^﻿/, '');
  const res = Papa.parse<Record<string, string>>(clean, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h, i) => h.trim() || `Column ${i + 1}`,
  });
  const headers = (res.meta.fields ?? []).filter(Boolean);
  const rows = res.data.filter((r) => headers.some((h) => (r[h] ?? '').toString().trim() !== ''));
  return { headers, rows, delimiter: res.meta.delimiter };
}

export function guessMapping(headers: string[]): Mapping {
  const m: Mapping = {};
  const taken = new Set<string>();
  for (const field of Object.keys(SYNONYMS) as CsvField[]) {
    const hit = headers.find((h) => !taken.has(h) && SYNONYMS[field].test(h.trim()));
    if (hit) {
      m[field] = hit;
      taken.add(hit);
    }
  }
  return m;
}

/** Parse "1.234,56", "1,234.56", "(45.10)", "45,10-", "€ 12" into a number. */
export function parseAmount(raw: string): number | null {
  let s = (raw ?? '').toString().trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (/-\s*$/.test(s) || /^\s*[-−–]/.test(s)) negative = true;
  s = s.replace(/[^\d.,]/g, '');
  if (!s) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    // Whichever comes last is the decimal separator.
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma >= 0) {
    s = /,\d{1,2}$/.test(s) && s.indexOf(',') === lastComma ? s.replace(',', '.') : s.replace(/,/g, '');
  } else if (lastDot >= 0 && s.indexOf('.') !== lastDot) {
    s = s.replace(/\./g, ''); // several dots: thousands separators
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

const pad = (n: number) => String(n).padStart(2, '0');
const year4 = (y: number) => (y < 100 ? (y < 70 ? 2000 + y : 1900 + y) : y);

/** Decide day/month order for a whole column: any value with a part above 12 settles it. */
export function detectDateFormat(values: string[]): Exclude<DateFormat, 'auto'> {
  let dmy = 0;
  let mdy = 0;
  for (const v of values) {
    const s = v.trim();
    if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/.test(s)) return 'ymd';
    const m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
    if (!m) continue;
    if (Number(m[1]) > 12) dmy++;
    if (Number(m[2]) > 12) mdy++;
  }
  return mdy > dmy ? 'mdy' : 'dmy';
}

export function parseDate(raw: string, format: Exclude<DateFormat, 'auto'>): string | null {
  const s = (raw ?? '').toString().trim();
  if (!s) return null;
  let y: number, mo: number, d: number;
  const iso = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  const parts = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (iso) {
    [y, mo, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else if (parts) {
    const a = Number(parts[1]);
    const b = Number(parts[2]);
    y = year4(Number(parts[3]));
    [d, mo] = format === 'mdy' ? [b, a] : [a, b];
  } else {
    const t = Date.parse(s);
    if (Number.isNaN(t)) return null;
    const dt = new Date(t);
    [y, mo, d] = [dt.getFullYear(), dt.getMonth() + 1, dt.getDate()];
  }
  const out = `${y}-${pad(mo)}-${pad(d)}`;
  return isValidISO(out) ? out : null;
}

const parseType = (raw: string): TxType | null => {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  if (/^(income|credit|cr|in|deposit|inflow|received|eingang|haben|entrata|\+)/.test(s)) return 'income';
  if (/^(expense|debit|dr|out|payment|purchase|withdrawal|outflow|spent|ausgang|soll|uscita|-)/.test(s)) return 'expense';
  return null;
};

const parseMethod = (raw: string): PaymentMethod => {
  const s = raw.trim().toLowerCase();
  if (/debit|lastschrift|sepa dd|addebito diretto/.test(s) && /direct|lastschrift|sepa|diretto/.test(s)) return 'Direct debit';
  if (/transfer|überweisung|ueberweisung|bonifico|wire|sepa|standing/.test(s)) return 'Bank transfer';
  if (/cash|bar|contanti|atm/.test(s)) return 'Cash';
  if (/apple pay|google pay|paypal|wallet|klarna/.test(s)) return 'Digital wallet';
  const exact = PAYMENT_METHODS.find((m) => m.toLowerCase() === s);
  return exact ?? 'Card';
};

export const duplicateKey = (t: Pick<Transaction, 'date' | 'amount' | 'type' | 'merchant'>) =>
  `${t.date}|${t.amount.toFixed(2)}|${t.type}|${merchantKey(t.merchant)}`;

export interface ImportRow {
  line: number;
  draft?: TransactionDraft;
  error?: string;
  duplicate: boolean;
  /** How the category was chosen. */
  categorySource: 'file' | 'history' | 'rule' | 'fallback';
}

export interface ImportOptions {
  dateFormat: DateFormat;
  sign: SignMode;
}

export function buildImport(
  parsed: ParsedCsv,
  mapping: Mapping,
  options: ImportOptions,
  existing: Transaction[],
): ImportRow[] {
  const get = (r: Record<string, string>, f: CsvField) => (mapping[f] ? (r[mapping[f] as string] ?? '').toString().trim() : '');
  const fmt =
    options.dateFormat === 'auto'
      ? detectDateFormat(parsed.rows.map((r) => get(r, 'date')))
      : options.dateFormat;
  const seen = new Set(existing.map(duplicateKey));

  return parsed.rows.map((r, i) => {
    const line = i + 2; // header is line 1
    const fail = (error: string): ImportRow => ({ line, error, duplicate: false, categorySource: 'fallback' });

    const date = parseDate(get(r, 'date'), fmt);
    if (!date) return fail(mapping.date ? `Unreadable date “${get(r, 'date')}”` : 'No date column mapped');

    let signed: number | null = null;
    const debit = parseAmount(get(r, 'debit'));
    const credit = parseAmount(get(r, 'credit'));
    if (mapping.amount && get(r, 'amount')) signed = parseAmount(get(r, 'amount'));
    else if (debit) signed = -Math.abs(debit);
    else if (credit) signed = Math.abs(credit);
    if (signed === null) return fail('No readable amount');
    if (signed === 0) return fail('Amount is zero');

    let type: TxType | null = mapping.type ? parseType(get(r, 'type')) : null;
    if (!type) {
      if (mapping.amount && get(r, 'amount')) {
        type =
          options.sign === 'allExpense'
            ? 'expense'
            : options.sign === 'allIncome'
              ? 'income'
              : (options.sign === 'inverted' ? signed > 0 : signed < 0)
                ? 'expense'
                : 'income';
      } else type = signed < 0 ? 'expense' : 'income';
    }

    const merchant = get(r, 'merchant') || get(r, 'description') || 'Unknown';
    const description = get(r, 'description') && get(r, 'merchant') ? get(r, 'description') : '';

    let category: Category;
    let categorySource: ImportRow['categorySource'];
    const fromFile = matchCategoryName(get(r, 'category'));
    if (fromFile && categoriesFor(type).includes(fromFile)) {
      category = fromFile;
      categorySource = 'file';
    } else {
      const c = categorize(merchant, description, type, existing);
      category = c.category;
      categorySource = c.source;
    }

    const draft: TransactionDraft = {
      date,
      merchant: merchant.slice(0, 80),
      description: description.slice(0, 160),
      category,
      amount: round2(Math.abs(signed)),
      type,
      method: mapping.method ? parseMethod(get(r, 'method')) : type === 'income' ? 'Bank transfer' : 'Card',
    };
    const key = duplicateKey(draft);
    const duplicate = seen.has(key);
    return { line, draft, duplicate, categorySource };
  });
}

/**
 * A sample statement in a typical European bank export format (semicolon
 * separated, DD.MM.YYYY dates, comma decimals) dated over the last two weeks,
 * so importing it adds new activity to the current data.
 */
export function sampleCsv(today: string): string {
  const rows: [number, string, string, string][] = [
    [13, 'Shell Station', 'Fuel', '-52,30'],
    [12, 'Trattoria Luna', 'Dinner', '-61,50'],
    [11, 'Ryanair', 'Flight BER-MXP', '-89,99'],
    [10, 'Trade Republic', 'Dividend payout', '18,42'],
    [9, 'Apotheke Mitte', 'Pharmacy', '-11,95'],
    [8, 'Decathlon', 'Running shoes', '-74,90'],
    [7, 'Coursera', 'Data analysis course', '-39,00'],
    [6, 'Cinestar', 'Cinema tickets', '-23,00'],
    [5, 'Carrefour Express', 'Card payment', '-18,64'],
    [4, 'Uber', 'Ride home', '-14,20'],
    [3, 'Starbucks', 'Coffee', '-5,80'],
    [2, 'MediaMarkt', 'USB-C charger', '-29,99'],
    [1, 'Studio Kollektiv', 'Invoice 2031 - freelance design', '1.250,00'],
    [0, 'Wolt', 'Order 77410', '-21,70'],
  ];
  const fmt = (offset: number) => {
    const [y, m, d] = today.split('-').map(Number);
    const dt = new Date(y, m - 1, d - offset);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(dt.getDate())}.${p(dt.getMonth() + 1)}.${dt.getFullYear()}`;
  };
  return ['Booking date;Payee;Reference;Amount (EUR)', ...rows.map(([o, a, b, c]) => `${fmt(o)};${a};${b};${c}`)].join('\n') + '\n';
}
