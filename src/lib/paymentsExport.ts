import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatMAD, formatDateAr } from "./format";

export interface PaymentExportRow {
  paid_at: string;
  amount: number;
  payment_method: string;
  payment_reference: string | null;
}

export interface PaymentsExportMeta {
  invoice_number: string;
  client_name?: string | null;
  total: number;
  paid: number;
  due: number;
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "نقداً",
  bank_transfer: "تحويل بنكي",
  card: "بطاقة بنكية",
  stripe: "Stripe",
  manual: "يدوي",
};

function csvEscape(v: string) {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportPaymentsCsv(
  meta: PaymentsExportMeta,
  rows: PaymentExportRow[],
) {
  const header = ["Date", "Amount (MAD)", "Method", "Reference"];
  const lines: string[] = [];
  // Summary header
  lines.push(`Invoice,${csvEscape(meta.invoice_number)}`);
  if (meta.client_name) lines.push(`Client,${csvEscape(meta.client_name)}`);
  lines.push(`Total,${meta.total.toFixed(2)}`);
  lines.push(`Paid,${meta.paid.toFixed(2)}`);
  lines.push(`Due,${meta.due.toFixed(2)}`);
  lines.push("");
  lines.push(header.join(","));
  for (const r of rows) {
    lines.push(
      [
        new Date(r.paid_at).toISOString(),
        Number(r.amount).toFixed(2),
        PAYMENT_METHOD_LABELS[r.payment_method] ?? r.payment_method,
        csvEscape(r.payment_reference ?? ""),
      ].join(","),
    );
  }
  // BOM so Excel reads UTF-8 (Arabic) correctly
  const blob = new Blob(["\uFEFF" + lines.join("\n")], {
    type: "text/csv;charset=utf-8;",
  });
  triggerDownload(blob, `payments-${meta.invoice_number}.csv`);
}

export function exportPaymentsPdf(
  meta: PaymentsExportMeta,
  rows: PaymentExportRow[],
) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Payment History", pageWidth / 2, 40, { align: "center" });

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  let y = 70;
  doc.text(`Invoice: ${meta.invoice_number}`, 40, y);
  y += 14;
  if (meta.client_name) {
    doc.text(`Client: ${meta.client_name}`, 40, y);
    y += 14;
  }
  doc.text(`Total: ${formatMAD(meta.total)}`, 40, y);
  y += 14;
  doc.text(`Paid: ${formatMAD(meta.paid)}`, 40, y);
  y += 14;
  doc.text(`Due: ${formatMAD(meta.due)}`, 40, y);
  y += 10;

  autoTable(doc, {
    startY: y + 10,
    head: [["Date", "Amount", "Method", "Reference"]],
    body: rows.map((r) => [
      formatDateAr(r.paid_at),
      formatMAD(r.amount),
      PAYMENT_METHOD_LABELS[r.payment_method] ?? r.payment_method,
      r.payment_reference ?? "",
    ]),
    styles: { fontSize: 9, cellPadding: 6 },
    headStyles: { fillColor: [37, 99, 235] },
    columnStyles: {
      1: { halign: "right" },
    },
  });

  const blob = doc.output("blob");
  triggerDownload(blob, `payments-${meta.invoice_number}.pdf`);
}

// ----- Bulk export across multiple invoices -----

export interface BulkInvoicePayments {
  meta: PaymentsExportMeta;
  rows: PaymentExportRow[];
}

export function exportBulkPaymentsCsv(
  invoices: BulkInvoicePayments[],
  filename = `payments-bulk-${new Date().toISOString().slice(0, 10)}.csv`,
) {
  const header = [
    "Invoice",
    "Client",
    "Date",
    "Amount (MAD)",
    "Method",
    "Reference",
  ];
  const lines: string[] = [];

  // Summary block
  const totals = invoices.reduce(
    (acc, inv) => {
      acc.total += inv.meta.total;
      acc.paid += inv.meta.paid;
      acc.due += inv.meta.due;
      acc.count += 1;
      return acc;
    },
    { total: 0, paid: 0, due: 0, count: 0 },
  );
  lines.push(`Invoices,${totals.count}`);
  lines.push(`Total,${totals.total.toFixed(2)}`);
  lines.push(`Paid,${totals.paid.toFixed(2)}`);
  lines.push(`Due,${totals.due.toFixed(2)}`);
  lines.push("");
  lines.push(header.join(","));

  for (const inv of invoices) {
    if (inv.rows.length === 0) {
      lines.push(
        [
          csvEscape(inv.meta.invoice_number),
          csvEscape(inv.meta.client_name ?? ""),
          "",
          "0.00",
          "",
          csvEscape("(no payments)"),
        ].join(","),
      );
      continue;
    }
    for (const r of inv.rows) {
      lines.push(
        [
          csvEscape(inv.meta.invoice_number),
          csvEscape(inv.meta.client_name ?? ""),
          new Date(r.paid_at).toISOString(),
          Number(r.amount).toFixed(2),
          PAYMENT_METHOD_LABELS[r.payment_method] ?? r.payment_method,
          csvEscape(r.payment_reference ?? ""),
        ].join(","),
      );
    }
  }

  const blob = new Blob(["\uFEFF" + lines.join("\n")], {
    type: "text/csv;charset=utf-8;",
  });
  triggerDownload(blob, filename);
}

export function exportBulkPaymentsPdf(
  invoices: BulkInvoicePayments[],
  filename = `payments-bulk-${new Date().toISOString().slice(0, 10)}.pdf`,
) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Bulk Payment History", pageWidth / 2, 40, { align: "center" });

  const totals = invoices.reduce(
    (acc, inv) => {
      acc.total += inv.meta.total;
      acc.paid += inv.meta.paid;
      acc.due += inv.meta.due;
      return acc;
    },
    { total: 0, paid: 0, due: 0 },
  );

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  let y = 64;
  doc.text(`Invoices: ${invoices.length}`, 40, y);
  y += 14;
  doc.text(`Total: ${formatMAD(totals.total)}`, 40, y);
  y += 14;
  doc.text(`Paid: ${formatMAD(totals.paid)}`, 40, y);
  y += 14;
  doc.text(`Due: ${formatMAD(totals.due)}`, 40, y);

  const body: (string | number)[][] = [];
  for (const inv of invoices) {
    if (inv.rows.length === 0) {
      body.push([
        inv.meta.invoice_number,
        inv.meta.client_name ?? "",
        "—",
        "—",
        "—",
        "(no payments)",
      ]);
      continue;
    }
    for (const r of inv.rows) {
      body.push([
        inv.meta.invoice_number,
        inv.meta.client_name ?? "",
        formatDateAr(r.paid_at),
        formatMAD(r.amount),
        PAYMENT_METHOD_LABELS[r.payment_method] ?? r.payment_method,
        r.payment_reference ?? "",
      ]);
    }
  }

  autoTable(doc, {
    startY: y + 14,
    head: [["Invoice", "Client", "Date", "Amount", "Method", "Reference"]],
    body,
    styles: { fontSize: 8, cellPadding: 5 },
    headStyles: { fillColor: [37, 99, 235] },
    columnStyles: { 3: { halign: "right" } },
  });

  const blob = doc.output("blob");
  triggerDownload(blob, filename);
}
