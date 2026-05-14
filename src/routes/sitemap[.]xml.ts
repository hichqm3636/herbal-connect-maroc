import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";

const BASE_URL = "https://herbal-connect-maroc.lovable.app";

interface SitemapEntry {
  path: string;
  lastmod?: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const entries: SitemapEntry[] = [
          { path: "/", changefreq: "daily", priority: "1.0" },
          { path: "/pricing", changefreq: "weekly", priority: "0.8" },
          { path: "/vendors", changefreq: "daily", priority: "0.8" },
          { path: "/login", changefreq: "monthly", priority: "0.4" },
          { path: "/signup", changefreq: "monthly", priority: "0.6" },
          { path: "/vendor-login", changefreq: "monthly", priority: "0.4" },
        ];

        try {
          const { data: companies } = await supabase
            .from("companies")
            .select("slug, updated_at")
            .eq("is_listed", true)
            .limit(1000);
          for (const c of companies ?? []) {
            if (!c.slug) continue;
            entries.push({
              path: `/store/${c.slug}`,
              lastmod: c.updated_at ?? undefined,
              changefreq: "weekly",
              priority: "0.7",
            });
          }

          const { data: products } = await supabase
            .from("products")
            .select("id, company_id, updated_at, companies(slug)")
            .eq("status", "active")
            .limit(1000);
          for (const p of (products ?? []) as any[]) {
            const slug = p.companies?.slug;
            if (!slug || !p.id) continue;
            entries.push({
              path: `/store/${slug}/product/${p.id}`,
              lastmod: p.updated_at ?? undefined,
              changefreq: "weekly",
              priority: "0.6",
            });
          }
        } catch (err) {
          console.error("sitemap dynamic fetch failed", err);
        }

        const urls = entries.map((e) =>
          [
            `  <url>`,
            `    <loc>${BASE_URL}${e.path}</loc>`,
            e.lastmod ? `    <lastmod>${e.lastmod}</lastmod>` : null,
            e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
            e.priority ? `    <priority>${e.priority}</priority>` : null,
            `  </url>`,
          ]
            .filter(Boolean)
            .join("\n"),
        );

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...urls,
          `</urlset>`,
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
