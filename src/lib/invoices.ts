import { supabase } from "@/integrations/supabase/client";
import { generateInvoicePdf, type InvoicePdfData } from "./invoicePdf";

export const VAT_RATE_DEFAULT = 20;

export interface CreateInvoiceParams {
  orderId: string;
  vatRate?: number;
  dueInDays?: number;
}

/**
 * Create an invoice for an order, generate the PDF, upload it to storage,
 * and persist the storage path on the invoice row.
 *
 * Returns the created invoice row.
 */
export async function createInvoiceForOrder({
  orderId,
  vatRate = VAT_RATE_DEFAULT,
  dueInDays = 30,
}: CreateInvoiceParams) {
  // 1) Load the order with everything we need for the PDF.
  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select(
      "id, order_number, status, total_mad, payment_method, notes, distributor_id, company_id, created_at, " +
        "profiles(full_name, phone, city, territories(name)), " +
        "order_items(quantity, unit_price_mad, products(name_ar, sku))",
    )
    .eq("id", orderId)
    .maybeSingle();

  if (orderErr || !order) throw new Error("Order not found");

  // 2) Load company branding.
  const { data: company, error: companyErr } = await supabase
    .from("companies")
    .select("name, display_name, brand_color, logo_url")
    .eq("id", order.company_id)
    .maybeSingle();
  if (companyErr || !company) throw new Error("Company not found");

  // 3) Compute amounts. We treat orders.total_mad as TTC; subtotal/VAT are derived.
  const total = Number(order.total_mad);
  const subtotal = +(total / (1 + vatRate / 100)).toFixed(2);
  const vat_amount = +(total - subtotal).toFixed(2);

  const issue_date = new Date().toISOString().slice(0, 10);
  const due_date = new Date(Date.now() + dueInDays * 86400_000).toISOString().slice(0, 10);

  // 4) Insert the invoice row (number + storage path are filled afterwards).
  const { data: { user } } = await supabase.auth.getUser();

  const { data: invoice, error: insertErr } = await supabase
    .from("invoices")
    .insert({
      company_id: order.company_id,
      order_id: order.id,
      distributor_id: order.distributor_id,
      invoice_number: "" as unknown as string, // trigger fills it
      status: "issued",
      issue_date,
      due_date,
      subtotal_mad: subtotal,
      vat_rate: vatRate,
      vat_amount_mad: vat_amount,
      total_mad: total,
      payment_method: order.payment_method,
      notes: order.notes,
      created_by: user?.id ?? null,
    })
    .select("*")
    .single();

  if (insertErr || !invoice) throw insertErr ?? new Error("Failed to create invoice");

  // 5) Build PDF.
  const profile = order.profiles as
    | { full_name: string; phone: string | null; city: string | null; territories: { name: string } | null }
    | null;

  const pdfData: InvoicePdfData = {
    invoice_number: invoice.invoice_number,
    issue_date: invoice.issue_date,
    due_date: invoice.due_date,
    order_number: order.order_number,
    status: invoice.status,
    payment_method: order.payment_method,
    notes: order.notes,
    subtotal,
    vat_rate: vatRate,
    vat_amount,
    total,
    company: {
      name: company.name,
      display_name: company.display_name,
      brand_color: company.brand_color,
      logo_url: company.logo_url,
    },
    client: {
      full_name: profile?.full_name ?? "—",
      phone: profile?.phone ?? null,
      city: profile?.city ?? null,
      territory: profile?.territories?.name ?? null,
    },
    items: (order.order_items ?? []).map((it) => ({
      name: (it.products as { name_ar: string } | null)?.name_ar ?? "—",
      sku: (it.products as { sku: string | null } | null)?.sku ?? null,
      quantity: it.quantity,
      unit_price: Number(it.unit_price_mad),
      line_total: Number(it.unit_price_mad) * it.quantity,
    })),
  };

  const blob = generateInvoicePdf(pdfData);

  // 6) Upload to storage.
  const path = `${order.company_id}/${invoice.id}.pdf`;
  const { error: uploadErr } = await supabase.storage
    .from("invoices")
    .upload(path, blob, { contentType: "application/pdf", upsert: true });
  if (uploadErr) throw uploadErr;

  // 7) Persist path.
  const { error: updateErr } = await supabase
    .from("invoices")
    .update({ pdf_path: path })
    .eq("id", invoice.id);
  if (updateErr) throw updateErr;

  return { ...invoice, pdf_path: path };
}

export async function downloadInvoicePdf(pdfPath: string, filename: string) {
  const { data, error } = await supabase.storage.from("invoices").download(pdfPath);
  if (error || !data) throw error ?? new Error("PDF not found");
  const url = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const INVOICE_STATUS_LABELS: Record<string, string> = {
  draft: "مسودة",
  issued: "صادرة",
  paid: "مدفوعة",
  cancelled: "ملغاة",
};

export const INVOICE_STATUS_CLASSES: Record<string, string> = {
  draft: "border-gray-500/30 bg-gray-500/15 text-gray-700 dark:text-gray-300",
  issued: "border-blue-500/30 bg-blue-500/15 text-blue-700 dark:text-blue-300",
  paid: "border-green-500/30 bg-green-500/15 text-green-700 dark:text-green-300",
  cancelled: "border-red-500/30 bg-red-500/15 text-red-700 dark:text-red-300",
};
