// Edge Function: send-whatsapp
// Drains the whatsapp_outbox via claim_whatsapp_outbox() RPC, attempts delivery
// via the Meta WhatsApp Cloud API when configured, otherwise records a wa.me
// fallback link as metadata. Stops at 3 failed attempts per message.
//
// Triggered by pg_cron every 5 minutes.

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WHATSAPP_TOKEN = Deno.env.get("WHATSAPP_CLOUD_API_TOKEN");
const WHATSAPP_PHONE_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");

const MAX_ATTEMPTS = 3;
const BATCH_SIZE = 10;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface OutboxRow {
  id: string;
  phone: string;
  message: string;
  attempts: number;
  metadata: Record<string, any>;
}

function nextBackoffMinutes(attempts: number): number {
  // 5, 15, 45 minutes — exponential-ish, capped
  return Math.min(5 * Math.pow(3, Math.max(0, attempts - 1)), 60);
}

async function sendViaCloudApi(
  phone: string,
  message: string,
): Promise<{ ok: boolean; error?: string; providerId?: string }> {
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) {
    return { ok: false, error: "no_whatsapp_credentials" };
  }
  // Phone must be digits only (no leading +) for Meta API.
  const to = phone.replace(/\D+/g, "");
  try {
    const res = await fetch(
      `https://graph.facebook.com/v20.0/${WHATSAPP_PHONE_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { preview_url: false, body: message },
        }),
      },
    );
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        error: json?.error?.message || `http_${res.status}`,
      };
    }
    return { ok: true, providerId: json?.messages?.[0]?.id };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

function buildWaMeFallback(phone: string, message: string): string {
  const to = phone.replace(/\D+/g, "");
  return `https://wa.me/${to}?text=${encodeURIComponent(message)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: claimed, error: claimErr } = await supabase.rpc(
    "claim_whatsapp_outbox",
    { _limit: BATCH_SIZE },
  );

  if (claimErr) {
    console.error("claim error", claimErr);
    return new Response(
      JSON.stringify({ ok: false, error: claimErr.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const rows = (claimed ?? []) as OutboxRow[];
  const results: Array<{ id: string; status: string; error?: string }> = [];

  for (const row of rows) {
    let success = false;
    let lastError: string | undefined;
    let providerId: string | undefined;
    let fallbackLink: string | undefined;

    if (WHATSAPP_TOKEN && WHATSAPP_PHONE_ID) {
      const r = await sendViaCloudApi(row.phone, row.message);
      success = r.ok;
      lastError = r.error;
      providerId = r.providerId;
    } else {
      // No API configured → record wa.me link so an operator can click-send.
      // We mark as 'sent' so we don't retry forever.
      fallbackLink = buildWaMeFallback(row.phone, row.message);
      success = true;
    }

    if (success) {
      const meta = {
        ...(row.metadata ?? {}),
        ...(providerId ? { provider_message_id: providerId } : {}),
        ...(fallbackLink ? { wa_me_link: fallbackLink, mode: "fallback" } : {}),
      };
      await supabase
        .from("whatsapp_outbox")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          last_error: null,
          metadata: meta,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      results.push({ id: row.id, status: "sent" });
    } else {
      // attempts was already incremented inside claim_whatsapp_outbox
      const reachedMax = row.attempts >= MAX_ATTEMPTS;
      const nextAt = new Date(
        Date.now() + nextBackoffMinutes(row.attempts) * 60_000,
      ).toISOString();
      await supabase
        .from("whatsapp_outbox")
        .update({
          status: reachedMax ? "failed" : "pending",
          last_error: lastError ?? "unknown_error",
          next_attempt_at: nextAt,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      results.push({
        id: row.id,
        status: reachedMax ? "failed" : "retry",
        error: lastError,
      });
    }
  }

  return new Response(
    JSON.stringify({ ok: true, processed: rows.length, results }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
