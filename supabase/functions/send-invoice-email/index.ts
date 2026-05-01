// Edge Function: send-invoice-email
// Sends an invoice email via Resend with a 1-hour signed URL to the invoice PDF.
// Designed to be SAFE TO CALL even when secrets are not yet configured —
// in that case it returns { ok: true, skipped: "..." } so callers (e.g.
// generate-invoice-pdf) can call it best-effort without breaking the pipeline.
//
// POST body: { "invoice_id": "<uuid>" }

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "";

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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildHtml(opts: {
  buyerName: string;
  invoiceNumber: string;
  total: number;
  signedUrl: string;
  companyName: string;
  companyLogo: string | null;
  companyEmail: string | null;
  companyPhone: string | null;
}): string {
  const {
    buyerName,
    invoiceNumber,
    total,
    signedUrl,
    companyName,
    companyLogo,
    companyEmail,
    companyPhone,
  } = opts;
  const logoHtml = companyLogo
    ? `<img src="${escapeHtml(companyLogo)}" alt="${escapeHtml(companyName)}" style="max-height:48px;margin-bottom:16px" />`
    : `<div style="font-size:20px;font-weight:bold;color:#16a34a;margin-bottom:16px">${escapeHtml(companyName)}</div>`;
  const contactBits: string[] = [];
  if (companyEmail) contactBits.push(escapeHtml(companyEmail));
  if (companyPhone) contactBits.push(escapeHtml(companyPhone));
  const contact = contactBits.length
    ? `<div style="font-size:12px;color:#666;margin-top:6px">${contactBits.join(" • ")}</div>`
    : "";

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:Tahoma,Arial,sans-serif;color:#222">
  <div style="max-width:560px;margin:0 auto;padding:24px">
    ${logoHtml}
    <h1 style="font-size:20px;margin:0 0 16px">مرحباً ${escapeHtml(buyerName)}،</h1>
    <p style="font-size:14px;line-height:1.7;margin:0 0 18px">
      يرجى الاطلاع على فاتورتكم رقم <strong>${escapeHtml(invoiceNumber)}</strong>
      بقيمة <strong>${fmtMAD(total)} MAD</strong>.
    </p>
    <div style="margin:24px 0">
      <a href="${escapeHtml(signedUrl)}"
         style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;
                padding:12px 24px;border-radius:8px;font-weight:bold;font-size:14px">
        تحميل الفاتورة
      </a>
    </div>
    <p style="font-size:12px;color:#888;line-height:1.6;margin:24px 0 0">
      رابط التحميل صالح لمدة ساعة واحدة. إذا انتهت صلاحيته، تواصلوا معنا لإعادة الإرسال.
    </p>
    <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
    <div style="font-size:13px;color:#444">
      <div><strong>${escapeHtml(companyName)}</strong></div>
      ${contact}
    </div>
  </div>
</body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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

  // Graceful no-op when not yet configured (pre-domain-purchase).
  if (!RESEND_API_KEY || !FROM_EMAIL) {
    console.log("[send-invoice-email] skipped: RESEND_API_KEY or FROM_EMAIL not configured");
    return new Response(
      JSON.stringify({ ok: true, skipped: "email_not_configured" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Load invoice
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

  if (!inv.pdf_path) {
    return new Response(
      JSON.stringify({ ok: false, error: "pdf_not_generated_yet" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Load company + buyer profile + buyer auth email
  const [companyRes, buyerProfileRes, buyerAuthRes] = await Promise.all([
    supabase.from("companies").select("*").eq("id", inv.company_id).single(),
    supabase.from("profiles").select("*").eq("id", inv.buyer_id).single(),
    supabase.auth.admin.getUserById(inv.buyer_id),
  ]);

  const company: any = companyRes.data || {};
  const buyer: any = buyerProfileRes.data || {};
  const buyerEmail = buyerAuthRes.data?.user?.email;

  if (!buyerEmail) {
    return new Response(
      JSON.stringify({ ok: false, error: "buyer_email_not_found" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Generate 1-hour signed URL
  const { data: signed, error: signErr } = await supabase.storage
    .from("invoices")
    .createSignedUrl(inv.pdf_path, 3600);
  if (signErr || !signed) {
    return new Response(
      JSON.stringify({ ok: false, error: signErr?.message || "signed_url_failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const companyName = String(company.display_name || company.name || "Vendeur");
  const html = buildHtml({
    buyerName: String(buyer.full_name || "عميلنا"),
    invoiceNumber: String(inv.invoice_number),
    total: Number(inv.total_mad || 0),
    signedUrl: signed.signedUrl,
    companyName,
    companyLogo: company.logo_url || null,
    companyEmail: company.contact_email || null,
    companyPhone: company.contact_phone || null,
  });

  const fromHeader = `${companyName} <${FROM_EMAIL}>`;

  const resendRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromHeader,
      to: [buyerEmail],
      subject: `فاتورة رقم ${inv.invoice_number}`,
      html,
    }),
  });

  if (!resendRes.ok) {
    const errText = await resendRes.text();
    console.error("[send-invoice-email] resend error", resendRes.status, errText);
    return new Response(
      JSON.stringify({ ok: false, error: "resend_failed", status: resendRes.status, detail: errText }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Mark invoice as emailed (best-effort)
  await supabase
    .from("invoices")
    .update({ email_sent_at: new Date().toISOString() })
    .eq("id", invoice_id);

  return new Response(
    JSON.stringify({ ok: true, to: buyerEmail }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
