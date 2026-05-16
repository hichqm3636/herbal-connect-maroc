import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Server-side tenant resolver.
 *
 * Replaces the anon-client lookup that ran inside `TenantProvider`. By
 * routing through the admin client with an explicit column projection we:
 *  - keep sensitive fields (payment_instructions, contact_email, ICE/RC/TVA)
 *    off the public read path,
 *  - prepare the ground for tightening the `companies` RLS policy
 *    (`Public can browse vendor directory`) without breaking tenant resolution,
 *  - enable future `beforeLoad` checks that cannot run from the browser client.
 */
const SlugSchema = z
  .string()
  .min(1)
  .max(63)
  .regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i, "invalid slug");

export const resolveTenant = createServerFn({ method: "GET" })
  .inputValidator((input: { slug: string }) =>
    z.object({ slug: SlugSchema }).parse(input),
  )
  .handler(async ({ data }) => {
    const slug = data.slug.toLowerCase();

    const { data: row, error } = await supabaseAdmin
      .from("companies")
      .select("id, name, display_name, logo_url, brand_color, slug, is_listed")
      .eq("slug", slug)
      .maybeSingle();

    if (error) {
      console.error("resolveTenant query failed", { slug, error: error.message });
      return { found: false as const };
    }
    if (!row || row.is_listed !== true) {
      return { found: false as const };
    }

    return {
      found: true as const,
      company: {
        id: row.id,
        name: row.name,
        display_name: row.display_name,
        logo_url: row.logo_url,
        brand_color: row.brand_color,
      },
      slug: row.slug,
    };
  });
