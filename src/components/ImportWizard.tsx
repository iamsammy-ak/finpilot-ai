import { useMemo, useRef, useState } from 'react';
import { Check, CircleAlert, Download, FileText, Upload } from 'lucide-react';
import type { Category, TransactionDraft } from '../types';
import { categoriesFor } from '../lib/categories';
import {
  buildImport,
  FIELD_LABELS,
  guessMapping,
  parseCsv,
  sampleCsv,
  type CsvField,
  type DateFormat,
  type Mapping,
  type ParsedCsv,
  type SignMode,
} from '../lib/csv';
import { fmtDate } from '../lib/dates';
import { downloadFile } from '../lib/export';
import { money, plural } from '../lib/format';
import { TODAY, useStore } from '../store/useStore';
import { Modal, toast } from './ui';

const FIELDS: CsvField[] = ['date', 'merchant', 'description', 'amount', 'debit', 'credit', 'type', 'category', 'method'];

export function ImportWizard({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const transactions = useStore((s) => s.transactions);
  const importTransactions = useStore((s) => s.importTransactions);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [mapping, setMapping] = useState<Mapping>({});
  const [dateFormat, setDateFormat] = useState<DateFormat>('auto');
  const [sign, setSign] = useState<SignMode>('signed');
  const [includeDupes, setIncludeDupes] = useState(false);
  const [overrides, setOverrides] = useState<Record<number, Category>>({});
  const [error, setError] = useState('');
  const [over, setOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = (text: string, name: string) => {
    const p = parseCsv(text);
    if (!p.headers.length || !p.rows.length) {
      setError('That file has no readable rows. It needs a header line followed by one transaction per line.');
      return;
    }
    setError('');
    setParsed(p);
    setFileName(name);
    setMapping(guessMapping(p.headers));
    setOverrides({});
    setStep(2);
  };

  const readFile = (file?: File | null) => {
    if (!file) return;
    if (file.size > 8_000_000) {
      setError('That file is larger than 8 MB. Export a shorter period from your bank and try again.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => load(String(reader.result ?? ''), file.name);
    reader.onerror = () => setError('The file could not be read. Check it is a CSV text file.');
    reader.readAsText(file);
  };

  const rows = useMemo(
    () => (parsed ? buildImport(parsed, mapping, { dateFormat, sign }, transactions) : []),
    [parsed, mapping, dateFormat, sign, transactions],
  );
  const ok = rows.filter((r) => r.draft && !r.error);
  const dupes = ok.filter((r) => r.duplicate);
  const failed = rows.filter((r) => r.error);
  const toImport = ok.filter((r) => includeDupes || !r.duplicate);
  const canMap = !!mapping.date && (!!mapping.amount || !!mapping.debit || !!mapping.credit);
  const autoCount = ok.filter((r) => r.categorySource !== 'file').length;

  const finish = () => {
    const drafts: TransactionDraft[] = toImport.map((r) => ({ ...r.draft!, category: overrides[r.line] ?? r.draft!.category }));
    const n = importTransactions(drafts);
    const dates = drafts.map((d) => d.date).sort();
    toast(
      `Imported ${plural(n, 'transaction')}`,
      `${fmtDate(dates[0])} to ${fmtDate(dates[dates.length - 1])}${dupes.length && !includeDupes ? ` · ${plural(dupes.length, 'duplicate')} skipped` : ''}. All figures have been recalculated.`,
    );
    onImported();
    onClose();
  };

  const stepClass = (n: number) => (step === n ? 'on' : step > n ? 'done' : '');

  return (
    <Modal
      wide
      title="Import a bank statement"
      sub="CSV files from any bank. Nothing is uploaded — the file is read in your browser."
      onClose={onClose}
      foot={
        <>
          {step > 1 && (
            <button className="btn ghost" style={{ marginRight: 'auto' }} onClick={() => setStep((step - 1) as 1 | 2)}>
              Back
            </button>
          )}
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          {step === 2 && (
            <button className="btn primary" disabled={!canMap} onClick={() => setStep(3)}>
              Preview import
            </button>
          )}
          {step === 3 && (
            <button className="btn primary" disabled={!toImport.length} onClick={finish}>
              Import {plural(toImport.length, 'transaction')}
            </button>
          )}
        </>
      }
    >
      <div className="steps">
        <span className={stepClass(1)}>
          <b>{step > 1 ? <Check size={12} /> : 1}</b> Choose file
        </span>
        <span className={stepClass(2)}>
          <b>{step > 2 ? <Check size={12} /> : 2}</b> Match columns
        </span>
        <span className={stepClass(3)}>
          <b>3</b> Preview and import
        </span>
      </div>

      {step === 1 && (
        <div className="stack">
          <button
            className={`dropzone ${over ? 'over' : ''}`}
            onClick={() => fileInput.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              readFile(e.dataTransfer.files[0]);
            }}
          >
            <Upload />
            <b>Drop a CSV file here, or choose one</b>
            Comma, semicolon or tab separated. Dates and decimals in European or US format.
          </button>
          <input ref={fileInput} type="file" accept=".csv,.tsv,.txt,text/csv" hidden onChange={(e) => readFile(e.target.files?.[0])} />
          {error && (
            <div className="callout warn">
              <CircleAlert />
              <span>{error}</span>
            </div>
          )}
          <div className="row wrap">
            <button className="btn" onClick={() => load(sampleCsv(TODAY), 'sample-statement.csv')}>
              <FileText /> Try a sample statement
            </button>
            <button className="btn ghost" onClick={() => downloadFile('finpilot-sample-statement.csv', sampleCsv(TODAY), 'text/csv;charset=utf-8')}>
              <Download /> Download the sample CSV
            </button>
          </div>
        </div>
      )}

      {step === 2 && parsed && (
        <div className="stack">
          <p className="soft">
            <b style={{ color: 'var(--text)' }}>{fileName}</b> · {plural(parsed.rows.length, 'row')} · {parsed.headers.length} columns. Columns were matched automatically where the header was recognised — check them and fix any that are wrong.
          </p>
          <div className="map-grid">
            {FIELDS.map((f) => (
              <label className="field" key={f}>
                <span>
                  {FIELD_LABELS[f].label}
                  {FIELD_LABELS[f].required && <span className="bad"> *</span>}
                </span>
                <select className="select" value={mapping[f] ?? ''} onChange={(e) => setMapping({ ...mapping, [f]: e.target.value || undefined })}>
                  <option value="">Not in this file</option>
                  {parsed.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
                <span className="hint">{FIELD_LABELS[f].hint}</span>
              </label>
            ))}
            <label className="field">
              <span>Date format</span>
              <select className="select" value={dateFormat} onChange={(e) => setDateFormat(e.target.value as DateFormat)}>
                <option value="auto">Detect automatically</option>
                <option value="dmy">Day first (31/12/2026)</option>
                <option value="mdy">Month first (12/31/2026)</option>
                <option value="ymd">Year first (2026-12-31)</option>
              </select>
              <span className="hint">Only matters for ambiguous dates like 03/04</span>
            </label>
            <label className="field">
              <span>Amount sign</span>
              <select className="select" value={sign} onChange={(e) => setSign(e.target.value as SignMode)}>
                <option value="signed">Negative = money out</option>
                <option value="inverted">Positive = money out</option>
                <option value="allExpense">Every row is an expense</option>
                <option value="allIncome">Every row is income</option>
              </select>
              <span className="hint">Ignored when a Type column is matched</span>
            </label>
          </div>
          {!canMap && (
            <div className="callout warn">
              <CircleAlert />
              <span>Match a Date column and an Amount column (or separate money in / money out columns) to continue.</span>
            </div>
          )}
          <div>
            <div className="label" style={{ marginBottom: 6 }}>
              First rows of the file
            </div>
            <div className="table-wrap" style={{ border: '1px solid var(--line-soft)', borderRadius: 10 }}>
              <table className="tbl">
                <thead>
                  <tr>
                    {parsed.headers.map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsed.rows.slice(0, 3).map((r, i) => (
                    <tr key={i}>
                      {parsed.headers.map((h) => (
                        <td key={h} className="nowrap soft">
                          {r[h]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="stack">
          <div className="row wrap">
            <span className="pill good">{plural(toImport.length, 'transaction')} ready</span>
            {dupes.length > 0 && <span className="pill warn">{plural(dupes.length, 'duplicate')} {includeDupes ? 'included' : 'skipped'}</span>}
            {failed.length > 0 && <span className="pill bad">{plural(failed.length, 'row')} cannot be read</span>}
            <span className="pill violet">{autoCount} categorised automatically</span>
            {dupes.length > 0 && (
              <label className="check" style={{ marginLeft: 'auto' }}>
                <input type="checkbox" checked={includeDupes} onChange={(e) => setIncludeDupes(e.target.checked)} />
                Import duplicates anyway
              </label>
            )}
          </div>
          {dupes.length > 0 && (
            <p className="hint">A row is treated as a duplicate when a transaction with the same date, amount, direction and merchant already exists.</p>
          )}
          <div className="table-wrap" style={{ border: '1px solid var(--line-soft)', borderRadius: 10, maxHeight: '44vh', overflowY: 'auto' }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Line</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th>Merchant</th>
                  <th>Category</th>
                  <th className="right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 300).map((r) => (
                  <tr key={r.line} style={{ opacity: r.error || (r.duplicate && !includeDupes) ? 0.5 : 1 }}>
                    <td className="muted num">{r.line}</td>
                    <td>
                      {r.error ? <span className="pill bad">{r.error}</span> : r.duplicate ? <span className="pill warn">Duplicate</span> : <span className="pill good">New</span>}
                    </td>
                    <td className="nowrap">{r.draft ? fmtDate(r.draft.date) : '—'}</td>
                    <td>
                      {r.draft && (
                        <>
                          <div className="tx-merchant">{r.draft.merchant}</div>
                          <div className="tx-desc">{r.draft.description}</div>
                        </>
                      )}
                    </td>
                    <td>
                      {r.draft && (
                        <select
                          className="select sm"
                          style={{ minWidth: 150 }}
                          aria-label={`Category for line ${r.line}`}
                          value={overrides[r.line] ?? r.draft.category}
                          onChange={(e) => setOverrides({ ...overrides, [r.line]: e.target.value as Category })}
                        >
                          {categoriesFor(r.draft.type).map((c) => (
                            <option key={c}>{c}</option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className={`right num nowrap ${r.draft?.type === 'income' ? 'good' : ''}`}>
                      {r.draft && (
                        <b>
                          {r.draft.type === 'income' ? '+' : '−'}
                          {money(r.draft.amount)}
                        </b>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > 300 && <p className="hint">Showing the first 300 of {rows.length} rows. All valid rows will be imported.</p>}
        </div>
      )}
    </Modal>
  );
}
