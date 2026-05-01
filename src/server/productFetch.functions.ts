import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const inputSchema = z.object({ url: z.string().url() });

interface FetchedProduct {
  name: string | null;
  description: string | null;
  image_url: string | null;
  price: number | null;
  currency: string | null;
}

function extractMeta(html: string, prop: string): string | null {
  // Match <meta property="..." content="..."> or name="..."
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`,
    "i",
  );
  const m = html.match(re);
  if (m) return m[1];
  // Try reversed attribute order
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`,
    "i",
  );
  const m2 = html.match(re2);
  return m2 ? m2[1] : null;
}

function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m ? m[1].trim() : null;
}

export const fetchProductFromUrl = createServerFn({ method: "POST" })
  .inputValidator((data) => inputSchema.parse(data))
  .handler(async ({ data }): Promise<FetchedProduct> => {
    const { url } = data;
    let html: string;
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; NexoraBot/1.0; +https://nexora.lovable.app)",
          Accept: "text/html,application/xhtml+xml",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      html = await res.text();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "fetch failed";
      throw new Error(`تعذر جلب الصفحة: ${msg}`);
    }

    const ogTitle = extractMeta(html, "og:title");
    const ogDesc = extractMeta(html, "og:description");
    const ogImage = extractMeta(html, "og:image");
    const price = extractMeta(html, "product:price:amount") ?? extractMeta(html, "og:price:amount");
    const currency = extractMeta(html, "product:price:currency") ?? extractMeta(html, "og:price:currency");

    const priceNum = price ? Number(price) : null;

    return {
      name: ogTitle ?? extractTitle(html),
      description: ogDesc,
      image_url: ogImage,
      price: priceNum && Number.isFinite(priceNum) ? priceNum : null,
      currency,
    };
  });
