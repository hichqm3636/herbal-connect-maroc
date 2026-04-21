import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatMAD } from "./format";

export interface InvoicePdfData {
  invoice_number: string;
  issue_date: string; // ISO date
  due_date?: string | null;
  order_number: string;
  status: string;
  payment_method?: string | null;
  notes?: string | null;
  subtotal: number;
  vat_rate: number;
  vat_amount: number;
  total: number;
  company: {
    name: string;
    display_name?: string | null;
    brand_color?: string | null;
    logo_url?: string | null;
  };
  client: {
    full_name: string;
    phone?: string | null;
    city?: string | null;
    territory?: string | null;
  };
  items: {
    name: string;
    sku?: string | null;
    quantity: number;
    unit_price: number;
    line_total: number;
  }[];
}

// Numeric-only formatter (no MAD suffix) for table cells where the column header already shows the unit.
const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

export function generateInvoicePdf(data: InvoicePdfData): Blob {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 14;

  // Header bar
  const brand = data.company.brand_color || "#16a34a";
  doc.setFillColor(brand);
  doc.rect(0, 0, pageW, 28, "F");
  doc.setTextColor("#ffffff");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("INVOICE / FACTURE", margin, 18);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(data.company.display_name || data.company.name, pageW - margin, 18, { align: "right" });

  // Invoice meta
  doc.setTextColor("#111827");
  doc.setFontSize(10);
  let y = 38;
  doc.setFont("helvetica", "bold");
  doc.text(`N° ${data.invoice_number}`, margin, y);
  doc.setFont("helvetica", "normal");
  doc.text(`Date: ${new Date(data.issue_date).toLocaleDateString("fr-MA")}`, pageW - margin, y, {
    align: "right",
  });
  y += 6;
  doc.text(`Commande: ${data.order_number}`, margin, y);
  if (data.due_date) {
    doc.text(`Échéance: ${new Date(data.due_date).toLocaleDateString("fr-MA")}`, pageW - margin, y, {
      align: "right",
    });
  }
  y += 6;
  doc.text(`Statut: ${data.status}`, margin, y);
  if (data.payment_method) {
    doc.text(`Paiement: ${data.payment_method}`, pageW - margin, y, { align: "right" });
  }

  // Client block
  y += 10;
  doc.setFont("helvetica", "bold");
  doc.text("Client", margin, y);
  doc.setFont("helvetica", "normal");
  y += 5;
  doc.text(data.client.full_name, margin, y);
  y += 5;
  if (data.client.phone) {
    doc.text(data.client.phone, margin, y);
    y += 5;
  }
  if (data.client.city || data.client.territory) {
    doc.text([data.client.city, data.client.territory].filter(Boolean).join(" — "), margin, y);
    y += 5;
  }

  // Items table
  autoTable(doc, {
    startY: y + 4,
    head: [["#", "Produit", "SKU", "Qté", "PU (MAD)", "Total (MAD)"]],
    body: data.items.map((it, i) => [
      String(i + 1),
      it.name,
      it.sku ?? "—",
      String(it.quantity),
      fmt(it.unit_price),
      fmt(it.line_total),
    ]),
    styles: { fontSize: 9, cellPadding: 2.5 },
    headStyles: { fillColor: brand, textColor: "#ffffff", halign: "left" },
    columnStyles: {
      0: { cellWidth: 10, halign: "center" },
      3: { halign: "center" },
      4: { halign: "right" },
      5: { halign: "right" },
    },
    margin: { left: margin, right: margin },
  });

  // Totals
  // @ts-expect-error jspdf-autotable adds lastAutoTable
  const afterY: number = doc.lastAutoTable?.finalY ?? y + 40;
  const totalsX = pageW - margin - 70;
  let ty = afterY + 8;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Sous-total HT", totalsX, ty);
  doc.text(formatMAD(data.subtotal), pageW - margin, ty, { align: "right" });
  ty += 6;
  doc.text(`TVA (${data.vat_rate}%)`, totalsX, ty);
  doc.text(formatMAD(data.vat_amount), pageW - margin, ty, { align: "right" });
  ty += 8;
  doc.setDrawColor(brand);
  doc.line(totalsX, ty - 4, pageW - margin, ty - 4);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Total TTC", totalsX, ty);
  doc.text(formatMAD(data.total), pageW - margin, ty, { align: "right" });

  // Notes
  if (data.notes) {
    ty += 14;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Notes", margin, ty);
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(data.notes, pageW - margin * 2);
    doc.text(lines, margin, ty + 5);
  }

  // Footer
  const pageH = doc.internal.pageSize.getHeight();
  doc.setFontSize(8);
  doc.setTextColor("#6b7280");
  doc.text(
    `${data.company.display_name || data.company.name} — Document généré automatiquement`,
    pageW / 2,
    pageH - 8,
    { align: "center" },
  );

  return doc.output("blob");
}
