import { useRef, useState } from 'react';
import { Cpu, Database, Download, Lock, RotateCcw, Trash2, Upload } from 'lucide-react';
import type { Settings as SettingsType } from '../types';
import { Card, Confirm, MoneyInput, PageHead, toast } from '../components/ui';
import { downloadFile, transactionsCsv } from '../lib/export';
import { currencySymbol, pct, plural } from '../lib/format';
import type { Snapshot } from '../engine/snapshot';
import { makeBackup, TODAY, useStore, type Backup } from '../store/useStore';

export default function Settings({ s }: { s: Snapshot }) {
  const update = useStore((x) => x.updateSettings);
  const resetDemo = useStore((x) => x.resetDemo);
  const clearAll = useStore((x) => x.clearAll);
  const restore = useStore((x) => x.restore);
  const isDemo = useStore((x) => x.isDemo);
  const [confirm, setConfirm] = useState<'reset' | 'clear' | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const set = s.settings;

  const onRestore = (f?: File | null) => {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result)) as Backup;
        if (data.app !== 'finpilot-ai' || !Array.isArray(data.transactions) || !data.settings) throw new Error('not a FinPilot backup');
        restore(data);
        toast('Backup restored', `${plural(data.transactions.length, 'transaction')} loaded.`);
      } catch {
        toast('That file is not a FinPilot backup', 'Choose a .json file created with “Download backup”.', 'bad');
      }
    };
    reader.readAsText(f);
    if (file.current) file.current.value = '';
  };

  let stored = 0;
  try {
    stored = (localStorage.getItem('finpilot-ai:v1') ?? '').length;
  } catch {
    stored = 0;
  }

  return (
    <div className="page" style={{ maxWidth: 1040 }}>
      <PageHead title="Settings" sub="Your profile, the figures FinPilot starts from, and your data." />
      <div className="stack">
        <Card title="Profile" sub="Shown in the greeting and on exported reports">
          <div className="form-grid">
            <label className="field">
              <span>Name</span>
              <input className="input" value={set.name} onChange={(e) => update({ name: e.target.value })} />
            </label>
            <label className="field">
              <span>Email</span>
              <input className="input" type="email" value={set.email} onChange={(e) => update({ email: e.target.value })} />
            </label>
          </div>
        </Card>

        <Card title="Finances" sub="Starting points for balances, budgets and targets">
          <div className="form-grid">
            <label className="field">
              <span>Currency</span>
              <select className="select" value={set.currency} onChange={(e) => update({ currency: e.target.value as SettingsType['currency'] })}>
                <option value="EUR">Euro (€)</option>
                <option value="USD">US dollar ($)</option>
                <option value="GBP">Pound sterling (£)</option>
                <option value="CHF">Swiss franc (CHF)</option>
              </select>
              <span className="hint">Changes the symbol only. Amounts are not converted.</span>
            </label>
            <div className="field">
              <span className="label">Opening balance</span>
              <MoneyInput value={set.openingBalance} onCommit={(n) => update({ openingBalance: n ?? 0 })} ariaLabel="Opening balance" symbol={currencySymbol()} />
              <span className="hint">Your account balance before the first recorded transaction. Every balance in the app is this figure plus income minus spending.</span>
            </div>
            <div className="field">
              <span className="label">Monthly budget</span>
              <MoneyInput value={set.monthlyBudget || null} onCommit={(n) => update({ monthlyBudget: n ?? 0 })} ariaLabel="Monthly budget" placeholder="No overall limit" symbol={currencySymbol()} />
              <span className="hint">Your overall spending limit. Category budgets are set on the Budgets page.</span>
            </div>
            <label className="field">
              <span>Savings rate target · {pct(set.savingsRateTarget, 0)}</span>
              <input type="range" min={0} max={0.6} step={0.01} value={set.savingsRateTarget} onChange={(e) => update({ savingsRateTarget: Number(e.target.value) })} style={{ marginTop: 14 }} />
              <span className="hint">The share of income you aim to keep. Used in insights and the savings report.</span>
            </label>
          </div>
        </Card>

        <Card title="Your data" sub={`${plural(s.txs.length, 'transaction')}${isDemo ? ' · demo dataset' : ''} · about ${(stored / 1024).toFixed(0)} KB stored in this browser`}>
          <div className="stack" style={{ gap: 0 }}>
            {[
              {
                icon: <Download />,
                title: 'Download backup',
                body: 'Transactions, budgets and settings as one JSON file you can restore later or on another device.',
                action: (
                  <button className="btn" onClick={() => { downloadFile(`finpilot-backup-${TODAY}.json`, JSON.stringify(makeBackup(), null, 2), 'application/json'); toast('Backup downloaded'); }}>
                    Download backup
                  </button>
                ),
              },
              {
                icon: <Upload />,
                title: 'Restore backup',
                body: 'Replace everything with the contents of a backup file.',
                action: (
                  <button className="btn" onClick={() => file.current?.click()}>
                    Restore backup
                  </button>
                ),
              },
              {
                icon: <Database />,
                title: 'Export all transactions',
                body: 'A CSV of every transaction on record, for spreadsheets or other tools.',
                action: (
                  <button className="btn" disabled={!s.txs.length} onClick={() => { downloadFile(`finpilot-transactions-${TODAY}.csv`, transactionsCsv(s.txs), 'text/csv;charset=utf-8'); toast('CSV exported', `${plural(s.txs.length, 'transaction')} saved.`); }}>
                    Export CSV
                  </button>
                ),
              },
              {
                icon: <RotateCcw />,
                title: 'Reset demo data',
                body: 'Replace everything with the built-in sample: a €2,200-a-month earner with three months of history.',
                action: (
                  <button className="btn" onClick={() => setConfirm('reset')}>
                    Reset demo data
                  </button>
                ),
              },
              {
                icon: <Trash2 />,
                title: 'Delete all data',
                body: 'Remove every transaction and budget and start from an empty account.',
                action: (
                  <button className="btn danger" onClick={() => setConfirm('clear')}>
                    Delete all data
                  </button>
                ),
              },
            ].map((r) => (
              <div className="row between wrap" key={r.title} style={{ padding: '14px 0', borderBottom: '1px solid var(--line-soft)', gap: 16 }}>
                <div className="row" style={{ alignItems: 'flex-start', flex: '1 1 320px' }}>
                  <span className="insight-ico info" style={{ color: 'var(--text-2)', background: 'var(--surface-3)' }}>
                    {r.icon}
                  </span>
                  <div>
                    <b>{r.title}</b>
                    <div className="soft" style={{ fontSize: 13 }}>
                      {r.body}
                    </div>
                  </div>
                </div>
                {r.action}
              </div>
            ))}
          </div>
          <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => onRestore(e.target.files?.[0])} />
        </Card>

        <Card title="Privacy and how FinPilot works">
          <div className="grid" style={{ gap: 12 }}>
            <div className="callout c-6">
              <Lock />
              <span>
                <b style={{ color: 'var(--text)' }}>Your data stays here.</b> Everything is stored in this browser’s local storage. There is no account, no server and no tracking. Clearing your browser data removes it, so keep a backup.
              </span>
            </div>
            <div className="callout c-6">
              <Cpu />
              <span>
                <b style={{ color: 'var(--text)' }}>The “AI” is a transparent engine.</b> Insights, the health score, forecasts and advisor answers come from deterministic calculations and rules on your transactions. No language model or external AI service is called.
              </span>
            </div>
          </div>
        </Card>
      </div>

      {confirm === 'reset' && (
        <Confirm
          title="Reset demo data?"
          body="This replaces all current transactions, budgets and settings with the built-in demo dataset. Download a backup first if you want to keep your data."
          confirmLabel="Reset demo data"
          onClose={() => setConfirm(null)}
          onConfirm={() => {
            resetDemo();
            toast('Demo data restored', 'Transactions, budgets and settings are back to the sample dataset.');
          }}
        />
      )}
      {confirm === 'clear' && (
        <Confirm
          title="Delete all data?"
          body="Every transaction and budget will be removed and balances reset to zero. This cannot be undone unless you have a backup."
          confirmLabel="Delete all data"
          onClose={() => setConfirm(null)}
          onConfirm={() => {
            clearAll();
            toast('All data deleted', 'You are starting from an empty account.');
          }}
        />
      )}
    </div>
  );
}
