// Edge Function: generate-invoice-pdf
// Generates a French B2B invoice PDF for an issued invoice and uploads it to
// the private `invoices` bucket. Updates invoices.pdf_path on success.
//
// Triggered by `on_invoice_issued` trigger via pg_net, or invokable manually:
//   POST { "invoice_id": "<uuid>" }

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { jsPDF } from "https://esm.sh/jspdf@2.5.2";
import autoTable from "https://esm.sh/jspdf-autotable@3.8.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function fmtMAD(n: number): string {
  return new Intl.NumberFormat("fr-MA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(n || 0));
}

function fmtDate(d: string | null): string {
  if (!d) return "-";
  try {
    return new Intl.DateTimeFormat("fr-FR").format(new Date(d));
  } catch {
    return d;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let invoice_id: string | undefined;
  try {
    const body = await req.json();
    invoice_id = body?.invoice_id;
  } catch {
    return new Response(
      JSON.stringify({ ok: false, error: "invalid_json" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if (!invoice_id) {
    return new Response(
      JSON.stringify({ ok: false, error: "missing_invoice_id" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // 1. Load invoice
  const { data: inv, error: invErr } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", invoice_id)
    .single();
  if (invErr || !inv) {
    return new Response(
      JSON.stringify({ ok: false, error: invErr?.message || "invoice_not_found" }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // 2. Load company, buyer, items in parallel
  const [companyRes, buyerRes, itemsRes] = await Promise.all([
    supabase.from("companies").select("*").eq("id", inv.company_id).single(),
    supabase.from("profiles").select("*").eq("id", inv.buyer_id).single(),
    supabase
      .from("invoice_items")
      .select("description, quantity, unit_price, total_price, product_id, products:product_id(sku, name_ar)")
      .eq("invoice_id", invoice_id),
  ]);

  const company: any = companyRes.data || {};
  const buyer: any = buyerRes.data || {};
  const items: any[] = itemsRes.data || [];

  // 3. Build PDF
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  let cursorY = 15;

  // --- Header: logo + company info (left), invoice meta (right) ---
  if (company.logo_url) {
    try {
      const imgRes = await fetch(company.logo_url);
      const buf = await imgRes.arrayBuffer();
      const ext = (company.logo_url.split("?")[0].split(".").pop() || "png").toLowerCase();
      const fmt = ext === "jpg" || ext === "jpeg" ? "JPEG" : "PNG";
      const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      doc.addImage(`data:image/${fmt.toLowerCase()};base64,${b64}`, fmt as any, 14, cursorY, 28, 28);
    } catch (e) {
      console.warn("logo load failed", e);
    }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(String(company.display_name || company.name || "Vendeur"), 46, cursorY + 6);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const compLines: string[] = [];
  if (company.address) compLines.push(String(company.address));
  if (company.contact_phone) compLines.push("Tel: " + company.contact_phone);
  if (company.contact_email) compLines.push("Email: " + company.contact_email);
  const fiscal: string[] = [];
  if (company.ice) fiscal.push("ICE: " + company.ice);
  if (company.if_number) fiscal.push("IF: " + company.if_number);
  if (company.rc) fiscal.push("RC: " + company.rc);
  if (company.tva) fiscal.push("TVA: " + company.tva);
  if (fiscal.length) compLines.push(fiscal.join("  •  "));
  doc.text(compLines, 46, cursorY + 12);

  // Invoice meta (right side, boxed)
  doc.setDrawColor(200);
  doc.setFillColor(245, 247, 250);
  doc.roundedRect(pageW - 75, cursorY, 61, 32, 2, 2, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("FACTURE", pageW - 72, cursorY + 7);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("N°: " + (inv.invoice_number || "-"), pageW - 72, cursorY + 14);
  doc.text("Date d'émission: " + fmtDate(inv.issue_date), pageW - 72, cursorY + 20);
  doc.text("Date d'échéance: " + fmtDate(inv.due_date), pageW - 72, cursorY + 26);

  cursorY = Math.max(cursorY + 36, 50);

  // --- Client block ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Facturé à:", 14, cursorY);
  doc.setFont("helvetica", "normal");
  cursorY += 5;
  const buyerLines: string[] = [];
  buyerLines.push(String(buyer.full_name || "-"));
  if (buyer.address) buyerLines.push(String(buyer.address));
  if (buyer.city) buyerLines.push(String(buyer.city));
  if (buyer.phone) buyerLines.push("Tel: " + buyer.phone);
  doc.text(buyerLines, 14, cursorY);
  cursorY += buyerLines.length * 5 + 4;

  // --- Items table ---
  const rows = items.map((it: any) => {
    const prod = Array.isArray(it.products) ? it.products[0] : it.products;
    const name = (prod?.name_ar || it.description || "-").toString();
    const sku = prod?.sku || "-";
    const qty = Number(it.quantity || 0);
    const unit = Number(it.unit_price || 0);
    const total = Number(it.total_price || qty * unit);
    return [name, sku, String(qty), fmtMAD(unit), fmtMAD(total)];
  });

  autoTable(doc, {
    startY: cursorY,
    head: [["Désignation", "SKU", "Qté", "P.U. HT", "Total HT"]],
    body: rows.length ? rows : [["—", "—", "—", "—", "—"]],
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [22, 163, 74], textColor: 255, fontStyle: "bold" },
    columnStyles: {
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right" },
    },
    margin: { left: 14, right: 14 },
  });

  // @ts-ignore – jspdf-autotable attaches lastAutoTable
  let afterY = (doc as any).lastAutoTable?.finalY || cursorY + 30;
  afterY += 6;

  // --- Totals ---
  const subtotal = Number(inv.subtotal_mad || 0);
  const vatRate = Number(inv.vat_rate || 20);
  const vat = Number(inv.vat_amount_mad || 0);
  const total = Number(inv.total_mad || 0);

  const rightX = pageW - 14;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Sous-total HT:", rightX - 50, afterY, { align: "left" });
  doc.text(fmtMAD(subtotal) + " MAD", rightX, afterY, { align: "right" });
  afterY += 6;
  doc.text(`TVA (${vatRate}%):`, rightX - 50, afterY, { align: "left" });
  doc.text(fmtMAD(vat) + " MAD", rightX, afterY, { align: "right" });
  afterY += 7;
  doc.setDrawColor(22, 163, 74);
  doc.setLineWidth(0.5);
  doc.line(rightX - 60, afterY - 2, rightX, afterY - 2);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("TOTAL TTC:", rightX - 50, afterY + 4, { align: "left" });
  doc.text(fmtMAD(total) + " MAD", rightX, afterY + 4, { align: "right" });

  // --- Footer ---
  const footerY = doc.internal.pageSize.getHeight() - 30;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Modalités de paiement:", 14, footerY);
  doc.setFont("helvetica", "normal");
  const payInstr = (company.payment_instructions || "").toString().trim();
  const payLines = doc.splitTextToSize(
    payInstr || "Paiement par virement bancaire ou à la livraison.",
    pageW - 28,
  );
  doc.text(payLines, 14, footerY + 5);

  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(
    "Merci pour votre confiance",
    pageW / 2,
    doc.internal.pageSize.getHeight() - 8,
    { align: "center" },
  );

  // 4. Upload to storage
  const pdfBytes = doc.output("arraybuffer");
  const year = new Date(inv.issue_date).getFullYear();
  const path = `${inv.company_id}/${year}/${inv.invoice_number}.pdf`;

  const { error: upErr } = await supabase.storage
    .from("invoices")
    .upload(path, new Uint8Array(pdfBytes), {
      contentType: "application/pdf",
      upsert: true,
    });

  if (upErr) {
    console.error("upload error", upErr);
    return new Response(
      JSON.stringify({ ok: false, error: upErr.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // 5. Update invoice with path
  await supabase
    .from("invoices")
    .update({ pdf_path: path, updated_at: new Date().toISOString() })
    .eq("id", invoice_id);

  return new Response(
    JSON.stringify({ ok: true, path }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
