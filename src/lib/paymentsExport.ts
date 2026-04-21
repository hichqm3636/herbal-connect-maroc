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
