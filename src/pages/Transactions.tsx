import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowLeftRight, ArrowUp, Download, Pencil, Plus, Search, Trash2, Upload, X } from 'lucide-react';
import type { Category, Transaction, TxType } from '../types';
import { CATEGORIES } from '../types';
import { ImportWizard } from '../components/ImportWizard';
import { TransactionForm } from '../components/TransactionForm';
import { Card, CategoryTag, Confirm, Empty, PageHead, Segmented, toast, useUi } from '../components/ui';
import { fmtDate } from '../lib/dates';
import { downloadFile, transactionsCsv } from '../lib/export';
import { money, moneySigned, plural } from '../lib/format';
import { totals } from '../engine/metrics';
import type { Snapshot } from '../engine/snapshot';
import { TODAY, useStore } from '../store/useStore';

type SortKey = 'date' | 'merchant' | 'category' | 'amount' | 'id';
const PAGE_SIZE = 20;

export default function Transactions({ s }: { s: Snapshot }) {
  const remove = useStore((x) => x.deleteTransactions);
  const query = useUi((x) => x.txQuery);
  const setQuery = useUi((x) => x.setTxQuery);

  const [type, setType] = useState<'all' | TxType>('all');
  const [category, setCategory] = useState<'all' | Category>('all');
  // Date filter starts on the period chosen in the top bar. A search arriving from elsewhere looks across all dates.
  const [from, setFrom] = useState(query ? '' : s.range.from);
  const [to, setTo] = useState(query ? '' : s.range.to);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'date', dir: -1 });
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [form, setForm] = useState<{ open: boolean; editing?: Transaction }>({ open: false });
  const [importing, setImporting] = useState(false);
  const [confirm, setConfirm] = useState<string[] | null>(null);

  const rangeKey = `${s.range.from}|${s.range.to}`;
  const [seenRange, setSeenRange] = useState(rangeKey);
  useEffect(() => {
    if (rangeKey !== seenRange) {
      setSeenRange(rangeKey);
      setFrom(s.range.from);
      setTo(s.range.to);
    }
  }, [rangeKey, seenRange, s.range.from, s.range.to]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = s.txs.filter((t) => {
      if (type !== 'all' && t.type !== type) return false;
      if (category !== 'all' && t.category !== category) return false;
      if (from && t.date < from) return false;
      if (to && t.date > to) return false;
      if (q && !`${t.merchant} ${t.description} ${t.category} ${t.id} ${t.method} ${t.amount.toFixed(2)}`.toLowerCase().includes(q)) return false;
      return true;
    });
    const { key, dir } = sort;
    return list.sort((a, b) => {
      let c: number;
      if (key === 'amount') c = (a.type === 'income' ? a.amount : -a.amount) - (b.type === 'income' ? b.amount : -b.amount);
      else if (key === 'id') c = a.id.localeCompare(b.id, undefined, { numeric: true });
      else c = String(a[key]).localeCompare(String(b[key]));
      return (c || a.id.localeCompare(b.id, undefined, { numeric: true })) * dir;
    });
  }, [s.txs, query, type, category, from, to, sort]);

  useEffect(() => setPage(0), [query, type, category, from, to]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const visible = filtered.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);
  const sum = totals(filtered);
  const allVisibleSelected = visible.length > 0 && visible.every((t) => selected.has(t.id));
  const filtersActive = type !== 'all' || category !== 'all' || !!query || !!from || !!to;

  const th = (key: SortKey, label: string, right?: boolean) => (
    <th
      className={`sortable ${right ? 'right' : ''}`}
      aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}
      onClick={() => setSort({ key, dir: sort.key === key ? (-sort.dir as 1 | -1) : key === 'date' || key === 'amount' ? -1 : 1 })}
    >
      {label}
      {sort.key === key && (sort.dir === 1 ? <ArrowUp /> : <ArrowDown />)}
    </th>
  );

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  return (
    <div className="page">
      <PageHead title="Transactions" sub={`${plural(s.txs.length, 'transaction')} on record. Add, edit, import and categorise — every other page recalculates from this list.`}>
        <button
          className="btn"
          disabled={!filtered.length}
          onClick={() => {
            downloadFile(`finpilot-transactions-${TODAY}.csv`, transactionsCsv(filtered), 'text/csv;charset=utf-8');
            toast('CSV exported', `${plural(filtered.length, 'transaction')} saved.`);
          }}
        >
          <Download /> Export CSV
        </button>
        <button className="btn" onClick={() => setImporting(true)}>
          <Upload /> Import CSV
        </button>
        <button className="btn primary" onClick={() => setForm({ open: true })}>
          <Plus /> Add transaction
        </button>
      </PageHead>

      <Card flush>
        <div className="row wrap" style={{ padding: '8px 20px 14px', gap: 10 }}>
          <div className="search" style={{ maxWidth: 300, minWidth: 200 }}>
            <Search />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Merchant, description, ID, amount" aria-label="Search transactions" style={{ paddingRight: 12 }} />
          </div>
          <Segmented
            label="Transaction type"
            value={type}
            onChange={setType}
            options={[
              { value: 'all', label: 'All' },
              { value: 'income', label: 'Income' },
              { value: 'expense', label: 'Expenses' },
            ]}
          />
          <select className="select" style={{ width: 180 }} value={category} onChange={(e) => setCategory(e.target.value as 'all' | Category)} aria-label="Category">
            <option value="all">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <input type="date" className="input" style={{ width: 150 }} value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
          <input type="date" className="input" style={{ width: 150 }} value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
          {filtersActive && (
            <button
              className="btn ghost"
              onClick={() => {
                setType('all');
                setCategory('all');
                setQuery('');
                setFrom('');
                setTo('');
              }}
            >
              <X /> Clear filters
            </button>
          )}
        </div>

        {selected.size > 0 && (
          <div className="row between" style={{ padding: '10px 20px', background: 'var(--violet-wash)', borderTop: '1px solid var(--line-soft)' }}>
            <b>{plural(selected.size, 'transaction')} selected</b>
            <div className="row">
              <button className="btn sm ghost" onClick={() => setSelected(new Set())}>
                Clear selection
              </button>
              <button className="btn sm danger" onClick={() => setConfirm([...selected])}>
                <Trash2 /> Delete selected
              </button>
            </div>
          </div>
        )}

        {visible.length ? (
          <div className="table-wrap" style={{ borderTop: '1px solid var(--line-soft)' }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: 36 }}>
                    <input
                      type="checkbox"
                      aria-label="Select all on this page"
                      checked={allVisibleSelected}
                      style={{ accentColor: 'var(--violet)' }}
                      onChange={() => {
                        const next = new Set(selected);
                        for (const t of visible) allVisibleSelected ? next.delete(t.id) : next.add(t.id);
                        setSelected(next);
                      }}
                    />
                  </th>
                  {th('date', 'Date')}
                  {th('merchant', 'Merchant')}
                  {th('category', 'Category')}
                  <th>Type</th>
                  <th>Payment method</th>
                  {th('id', 'ID')}
                  {th('amount', 'Amount', true)}
                  <th />
                </tr>
              </thead>
              <tbody>
                {visible.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <input type="checkbox" aria-label={`Select ${t.merchant}`} checked={selected.has(t.id)} onChange={() => toggle(t.id)} style={{ accentColor: 'var(--violet)' }} />
                    </td>
                    <td className="nowrap soft">{fmtDate(t.date)}</td>
                    <td>
                      <div className="tx-merchant">{t.merchant}</div>
                      {t.description && <div className="tx-desc">{t.description}</div>}
                    </td>
                    <td>
                      <CategoryTag category={t.category} />
                    </td>
                    <td>
                      <span className={`pill ${t.type === 'income' ? 'good' : ''}`}>{t.type === 'income' ? 'Income' : 'Expense'}</span>
                    </td>
                    <td className="soft nowrap">{t.method}</td>
                    <td className="muted num nowrap">{t.id}</td>
                    <td className={`right num nowrap ${t.type === 'income' ? 'good' : ''}`}>
                      <b>
                        {t.type === 'income' ? '+' : '−'}
                        {money(t.amount)}
                      </b>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button className="icon-btn bare" aria-label={`Edit ${t.merchant}`} onClick={() => setForm({ open: true, editing: t })}>
                          <Pencil />
                        </button>
                        <button className="icon-btn bare" aria-label={`Delete ${t.merchant}`} onClick={() => setConfirm([t.id])}>
                          <Trash2 />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon={<ArrowLeftRight />} title={s.txs.length ? 'No transactions match these filters' : 'No transactions yet'}>
            {s.txs.length ? 'Widen the dates or clear the filters to see more.' : 'Import a CSV statement from your bank or add your first transaction by hand.'}
            <div className="row" style={{ justifyContent: 'center' }}>
              {s.txs.length ? (
                <button className="btn" onClick={() => { setType('all'); setCategory('all'); setQuery(''); setFrom(''); setTo(''); }}>
                  Clear filters
                </button>
              ) : (
                <button className="btn primary" onClick={() => setImporting(true)}>
                  <Upload /> Import CSV
                </button>
              )}
            </div>
          </Empty>
        )}

        <div className="row between wrap" style={{ padding: '12px 20px', borderTop: '1px solid var(--line-soft)', fontSize: 13 }}>
          <span className="soft num">
            {plural(filtered.length, 'transaction')} · in <b className="good">{money(sum.income)}</b> · out <b style={{ color: 'var(--text)' }}>{money(sum.expenses)}</b> · net{' '}
            <b className={sum.net >= 0 ? 'good' : 'bad'}>{moneySigned(sum.net)}</b>
          </span>
          {pages > 1 && (
            <div className="row">
              <button className="btn sm" disabled={current === 0} onClick={() => setPage(current - 1)}>
                Previous
              </button>
              <span className="muted num">
                Page {current + 1} of {pages}
              </span>
              <button className="btn sm" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>
                Next
              </button>
            </div>
          )}
        </div>
      </Card>

      {form.open && <TransactionForm editing={form.editing} onClose={() => setForm({ open: false })} />}
      {importing && (
        <ImportWizard
          onClose={() => setImporting(false)}
          onImported={() => {
            // Show everything, newest first, so the imported rows are visible straight away.
            setFrom('');
            setTo('');
            setSort({ key: 'date', dir: -1 });
          }}
        />
      )}
      {confirm && (
        <Confirm
          title={`Delete ${plural(confirm.length, 'transaction')}?`}
          body="This cannot be undone. Balances, budgets, forecasts and insights will be recalculated without them."
          confirmLabel="Delete"
          onClose={() => setConfirm(null)}
          onConfirm={() => {
            remove(confirm);
            setSelected(new Set());
            toast(`${plural(confirm.length, 'transaction')} deleted`, 'All figures have been recalculated.');
          }}
        />
      )}
    </div>
  );
}
