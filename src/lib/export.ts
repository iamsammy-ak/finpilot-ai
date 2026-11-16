import type { Transaction } from '../types';
import type { Report } from '../engine/reports';

export function downloadFile(filename: string, content: string | Blob, mime = 'text/plain;charset=utf-8') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const cell = (v: string | number) => {
  const s = String(v ?? '');
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const toCsv = (rows: (string | number)[][]) => rows.map((r) => r.map(cell).join(',')).join('\r\n');

/** A BOM makes Excel read the file as UTF-8. */
const withBom = (s: string) => `﻿${s}`;

export function transactionsCsv(txs: Transaction[]) {
  return withBom(
    toCsv([
      ['Transaction ID', 'Date', 'Merchant', 'Description', 'Category', 'Type', 'Amount', 'Payment method'],
      ...txs.map((t) => [t.id, t.date, t.merchant, t.description, t.category, t.type === 'income' ? 'Income' : 'Expense', (t.type === 'income' ? t.amount : -t.amount).toFixed(2), t.method]),
    ]),
  );
}

export function reportCsv(report: Report) {
  const rows: (string | number)[][] = [
    [`FinPilot AI — ${report.title}`],
    ['Period', report.period],
    ['Prepared for', report.preparedFor],
    ['Generated', report.generated],
  ];
  if (report.caveat) rows.push(['Note', report.caveat]);
  for (const s of report.sections) {
    rows.push([], [s.title], s.columns.map((c) => c.label));
    for (const r of s.rows) rows.push(r.raw);
  }
  return withBom(toCsv(rows));
}

/** The PDF's built-in fonts cover Latin-1 only; swap the few typographic characters outside it. */
const pdfSafe = (s: string) =>
  s
    .replace(/−/g, '-')
    .replace(/→/g, 'to')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, '...')
    .replace(/≥/g, '>=');

/** Render one or more reports into a single A4 PDF (each report starts on a new page). */
export async function reportsPdf(reports: Report[], filename: string) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 48;
  const ink: [number, number, number] = [20, 24, 40];
  const muted: [number, number, number] = [104, 112, 134];
  const accent: [number, number, number] = [98, 72, 214];

  reports.forEach((report, idx) => {
    if (idx > 0) doc.addPage();
    // Letterhead
    doc.setFillColor(...accent);
    doc.rect(M, 44, 4, 30, 'F');
    doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...accent);
    doc.text('FINPILOT AI', M + 12, 54);
    doc.setFont('helvetica', 'bold').setFontSize(17).setTextColor(...ink);
    doc.text(pdfSafe(report.title), M + 12, 73);
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...muted);
    doc.text(pdfSafe(report.period), W - M, 54, { align: 'right' });
    doc.text(pdfSafe(`Prepared for ${report.preparedFor}`), W - M, 66, { align: 'right' });
    doc.text(pdfSafe(`Generated ${report.generated}`), W - M, 78, { align: 'right' });
    doc.setDrawColor(222, 225, 235).setLineWidth(0.7).line(M, 92, W - M, 92);

    let y = 112;
    if (report.caveat) {
      doc.setFont('helvetica', 'italic').setFontSize(8.5).setTextColor(...muted);
      const lines = doc.splitTextToSize(pdfSafe(report.caveat), W - M * 2);
      doc.text(lines, M, y);
      y += lines.length * 11 + 8;
    }

    for (const section of report.sections) {
      if (y > H - 140) {
        doc.addPage();
        y = 60;
      }
      doc.setFont('helvetica', 'bold').setFontSize(10.5).setTextColor(...ink);
      doc.text(pdfSafe(section.title), M, y);
      autoTable(doc, {
        startY: y + 8,
        margin: { left: M, right: M },
        theme: 'plain',
        head: [section.columns.map((c) => pdfSafe(c.label))],
        body: section.rows.map((r) => r.cells.map(pdfSafe)),
        styles: { font: 'helvetica', fontSize: 9, cellPadding: { top: 5, bottom: 5, left: 4, right: 4 }, textColor: ink, lineColor: [232, 234, 242], lineWidth: { bottom: 0.5 } },
        headStyles: { fontStyle: 'bold', fontSize: 8, textColor: muted, lineColor: [190, 195, 210], lineWidth: { bottom: 0.8 } },
        columnStyles: Object.fromEntries(section.columns.map((c, i) => [i, { halign: c.align === 'right' ? 'right' : 'left' }])),
        didParseCell: (d) => {
          if (d.section === 'head') d.cell.styles.halign = section.columns[d.column.index]?.align === 'right' ? 'right' : 'left';
          if (d.section !== 'body') return;
          const kind = section.rows[d.row.index]?.kind;
          if (kind === 'subtotal' || kind === 'total') {
            d.cell.styles.fontStyle = 'bold';
            d.cell.styles.lineColor = [150, 156, 176];
            d.cell.styles.lineWidth = kind === 'total' ? { top: 0.8, bottom: 1.4 } : { top: 0.8, bottom: 0.5 };
          }
          if (kind === 'total') d.cell.styles.fillColor = [246, 245, 252];
        },
      });
      y = ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY ?? y) + 14;
      if (section.note) {
        doc.setFont('helvetica', 'italic').setFontSize(8).setTextColor(...muted);
        const lines = doc.splitTextToSize(pdfSafe(section.note), W - M * 2);
        doc.text(lines, M, y);
        y += lines.length * 10;
      }
      y += 16;
    }
  });

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...muted);
    doc.text('FinPilot AI - figures calculated from your recorded transactions. Not financial advice.', M, H - 28);
    doc.text(`Page ${i} of ${pages}`, W - M, H - 28, { align: 'right' });
  }
  doc.save(filename);
}
