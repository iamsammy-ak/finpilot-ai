import { useEffect, useMemo, useState } from 'react';
import { Download, FileDown, FileText, Files } from 'lucide-react';
import { Card, Empty, PageHead, toast } from '../components/ui';
import { monthLabel } from '../lib/dates';
import { downloadFile, reportCsv, reportsPdf } from '../lib/export';
import { buildReport, REPORTS, type Report, type ReportId } from '../engine/reports';
import type { Snapshot } from '../engine/snapshot';

function Paper({ report }: { report: Report }) {
  return (
    <article className="paper">
      <header className="paper-head">
        <div>
          <div className="paper-brand">FINPILOT AI</div>
          <h2 className="paper-title">{report.title}</h2>
        </div>
        <div className="paper-meta">
          <b>{report.period}</b>
          <br />
          Prepared for {report.preparedFor}
          <br />
          Generated {report.generated}
        </div>
      </header>
      {report.caveat && <p className="paper-note">{report.caveat}</p>}
      {report.sections.map((sec) => (
        <section key={sec.title}>
          <h3>{sec.title}</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {sec.columns.map((c, i) => (
                    <th key={i} className={c.align === 'right' ? 'right' : ''}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sec.rows.length === 0 && (
                  <tr>
                    <td colSpan={sec.columns.length} style={{ color: '#8a91a6' }}>
                      Nothing recorded for this period.
                    </td>
                  </tr>
                )}
                {sec.rows.map((r, i) => (
                  <tr key={i} className={r.kind ?? ''}>
                    {r.cells.map((cell, j) => (
                      <td key={j} className={sec.columns[j]?.align === 'right' ? 'right' : ''}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {sec.note && <p className="paper-note">{sec.note}</p>}
        </section>
      ))}
      <footer className="paper-foot">
        <span>Figures are calculated from your recorded transactions. Not financial advice.</span>
        <span>FinPilot AI</span>
      </footer>
    </article>
  );
}

export default function Reports({ s }: { s: Snapshot }) {
  const months = useMemo(() => [...s.monthly].filter((m) => m.count > 0).reverse(), [s.monthly]);
  const [id, setId] = useState<ReportId>('summary');
  const [month, setMonth] = useState(s.focusMonth);
  const [busy, setBusy] = useState(false);
  useEffect(() => setMonth(s.focusMonth), [s.focusMonth]);

  const build = (rid: ReportId) => buildReport(rid, s.txs, s.budgets, s.settings, month, s.today);
  const report = useMemo(() => build(id), [id, month, s.txs, s.budgets, s.settings, s.today]); // eslint-disable-line react-hooks/exhaustive-deps
  const slug = (r: Report) => `finpilot-${r.id}-${month}`;

  const pdf = async (reports: Report[], filename: string, label: string) => {
    setBusy(true);
    try {
      await reportsPdf(reports, filename);
      toast('PDF exported', label);
    } catch (e) {
      toast('The PDF could not be created', e instanceof Error ? e.message : 'Try again.', 'bad');
    } finally {
      setBusy(false);
    }
  };

  if (!months.length) {
    return (
      <div className="page">
        <PageHead title="Reports" />
        <Card>
          <Empty icon={<FileText />} title="No data to report on yet">
            Reports are generated from your transactions. Add or import some first.
          </Empty>
        </Card>
      </div>
    );
  }

  return (
    <div className="page">
      <PageHead title="Reports" sub="Statement-style reports for any month, ready to export.">
        <select className="select" style={{ width: 240 }} value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Report month">
          {months.map((m) => (
            <option key={m.month} value={m.month}>
              {monthLabel(m.month)}
              {m.inProgress ? ' (in progress)' : ''}
            </option>
          ))}
        </select>
        <button
          className="btn primary"
          disabled={busy}
          onClick={() => pdf(REPORTS.map((r) => build(r.id)), `finpilot-monthly-report-${month}.pdf`, `Monthly report for ${monthLabel(month)}: all six reports in one file.`)}
        >
          <Files /> Generate monthly report
        </button>
      </PageHead>

      <div className="grid">
        <div className="c-4 stack">
          <Card title="Report" flush>
            <div className="report-nav">
              {REPORTS.map((r) => (
                <button key={r.id} className={r.id === id ? 'on' : ''} onClick={() => setId(r.id)} aria-pressed={r.id === id}>
                  <b>{r.name}</b>
                  <span>{r.blurb}</span>
                </button>
              ))}
            </div>
          </Card>
          <Card title="Export this report" sub={`${report.title} · ${report.period}`}>
            <div className="stack" style={{ gap: 8 }}>
              <button
                className="btn"
                onClick={() => {
                  downloadFile(`${slug(report)}.csv`, reportCsv(report), 'text/csv;charset=utf-8');
                  toast('CSV exported', `${report.title} for ${report.period}.`);
                }}
              >
                <Download /> Export CSV
              </button>
              <button className="btn" disabled={busy} onClick={() => pdf([report], `${slug(report)}.pdf`, `${report.title} for ${report.period}.`)}>
                <FileDown /> Export PDF
              </button>
              <p className="hint">“Generate monthly report” at the top bundles all six reports for the month into one PDF.</p>
            </div>
          </Card>
        </div>
        <div className="c-8">
          <Paper report={report} />
        </div>
      </div>
    </div>
  );
}
