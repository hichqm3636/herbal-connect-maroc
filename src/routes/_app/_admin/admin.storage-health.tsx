import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, XCircle, Loader2, RefreshCw, ImageOff, ExternalLink, Clock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatDateAr } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/_admin/admin/storage-health")({
  component: StorageHealthPage,
  head: () => ({ meta: [{ title: "فحص صحة الوسائط" }] }),
});

type Bucket = "company-logos" | "product-images" | "avatars";
type Status = "pending" | "ok" | "broken";

interface Asset {
  bucket: Bucket;
  url: string;
  label: string;
  refId: string;
  status: Status;
  httpStatus?: number;
  error?: string;
}

const BUCKET_LABEL: Record<Bucket, string> = {
  "company-logos": "شعارات الشركات",
  "product-images": "صور المنتجات",
  avatars: "الصور الشخصية",
};

async function checkUrl(url: string): Promise<{ ok: boolean; status?: number; error?: string }> {
  try {
    // HEAD first; some CDNs don't allow HEAD → fall back to GET range.
    let res = await fetch(url, { method: "HEAD", cache: "no-store" });
    if (res.status === 405 || res.status === 501) {
      res = await fetch(url, { method: "GET", headers: { Range: "bytes=0-0" }, cache: "no-store" });
    }
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "خطأ غير معروف" };
  }
}

function StorageHealthPage() {
  const { user, companyId, isSuperAdmin } = useAuth();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [lastScanAt, setLastScanAt] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);

  const loadAssets = async () => {
    setLoading(true);
    setAssets([]);
    setProgress(0);
    setFromCache(false);

    const collected: Asset[] = [];

    // Company logos
    const companiesQ = supabase.from("companies").select("id, display_name, logo_url");
    if (!isSuperAdmin && companyId) companiesQ.eq("id", companyId);
    const { data: companies } = await companiesQ;
    (companies ?? []).forEach((c) => {
      if (c.logo_url) {
        collected.push({
          bucket: "company-logos",
          url: c.logo_url,
          label: c.display_name ?? c.id,
          refId: c.id,
          status: "pending",
        });
      }
    });

    // Product images (image_url + product_images table)
    const productsQ = supabase.from("products").select("id, name_ar, image_url, company_id");
    if (!isSuperAdmin && companyId) productsQ.eq("company_id", companyId);
    const { data: products } = await productsQ;
    (products ?? []).forEach((p) => {
      if (p.image_url) {
        collected.push({
          bucket: "product-images",
          url: p.image_url,
          label: p.name_ar,
          refId: p.id,
          status: "pending",
        });
      }
    });

    const productIds = (products ?? []).map((p) => p.id);
    if (productIds.length) {
      const { data: imgs } = await supabase
        .from("product_images")
        .select("product_id, url")
        .in("product_id", productIds);
      const nameById = new Map((products ?? []).map((p) => [p.id, p.name_ar]));
      (imgs ?? []).forEach((im) => {
        collected.push({
          bucket: "product-images",
          url: im.url,
          label: nameById.get(im.product_id) ?? im.product_id,
          refId: im.product_id,
          status: "pending",
        });
      });
    }

    // Avatars
    const profilesQ = supabase.from("profiles").select("id, full_name, avatar_url, company_id");
    if (!isSuperAdmin && companyId) profilesQ.eq("company_id", companyId);
    const { data: profiles } = await profilesQ;
    (profiles ?? []).forEach((p) => {
      if (p.avatar_url) {
        collected.push({
          bucket: "avatars",
          url: p.avatar_url,
          label: p.full_name || p.id,
          refId: p.id,
          status: "pending",
        });
      }
    });

    setAssets(collected);
    setLoading(false);

    // Now run checks (concurrency = 8)
    setScanning(true);
    const total = collected.length;
    let done = 0;
    const concurrency = 8;
    const queue = [...collected.keys()];
    const updated = [...collected];

    async function worker() {
      while (queue.length) {
        const idx = queue.shift();
        if (idx === undefined) return;
        const asset = updated[idx];
        const r = await checkUrl(asset.url);
        updated[idx] = {
          ...asset,
          status: r.ok ? "ok" : "broken",
          httpStatus: r.status,
          error: r.error,
        };
        done++;
        setProgress(Math.round((done / total) * 100));
        // Periodic UI flush
        if (done % 4 === 0 || done === total) setAssets([...updated]);
      }
    }

    await Promise.all(Array.from({ length: Math.min(concurrency, total) }, worker));
    setAssets([...updated]);
    setScanning(false);

    // Persist results
    if (companyId) {
      const ok_count = updated.filter((a) => a.status === "ok").length;
      const broken_count = updated.filter((a) => a.status === "broken").length;
      const { data: saved, error } = await supabase
        .from("media_health_scans")
        .insert({
          company_id: companyId,
          scanned_by: user?.id ?? null,
          total: updated.length,
          ok_count,
          broken_count,
          results: updated as unknown as never,
        })
        .select("scanned_at")
        .single();
      if (error) {
        toast.error("تعذّر حفظ نتائج الفحص");
      } else {
        setLastScanAt(saved.scanned_at);
        toast.success("تم حفظ نتائج الفحص");
      }
    }
  };

  const loadCachedScan = async () => {
    if (!companyId) {
      loadAssets();
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("media_health_scans")
      .select("scanned_at, results")
      .eq("company_id", companyId)
      .order("scanned_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setLoading(false);
    if (data && Array.isArray(data.results)) {
      setAssets(data.results as unknown as Asset[]);
      setLastScanAt(data.scanned_at);
      setFromCache(true);
    } else {
      loadAssets();
    }
  };

  useEffect(() => {
    if (companyId || isSuperAdmin) loadCachedScan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, isSuperAdmin]);

  const summary = useMemo(() => {
    const s = { total: assets.length, ok: 0, broken: 0, pending: 0 };
    assets.forEach((a) => {
      if (a.status === "ok") s.ok++;
      else if (a.status === "broken") s.broken++;
      else s.pending++;
    });
    return s;
  }, [assets]);

  const byBucket = useMemo(() => {
    const map: Record<Bucket, Asset[]> = {
      "company-logos": [],
      "product-images": [],
      avatars: [],
    };
    assets.forEach((a) => map[a.bucket].push(a));
    return map;
  }, [assets]);

  return (
    <div className="space-y-6 p-4 md:p-6" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">فحص صحة الوسائط</h1>
          <p className="text-sm text-muted-foreground">
            يتحقق من أن جميع الروابط في القواعد ترجع HTTP 200.
          </p>
          {lastScanAt && (
            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              آخر فحص: {formatDateAr(lastScanAt)}
              {fromCache && <Badge variant="outline" className="text-[10px]">من الذاكرة</Badge>}
            </div>
          )}
        </div>
        <Button onClick={loadAssets} disabled={loading || scanning}>
          {loading || scanning ? (
            <Loader2 className="ms-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="ms-2 h-4 w-4" />
          )}
          إعادة الفحص
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">الإجمالي</div>
          <div className="text-2xl font-bold">{summary.total}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">سليمة</div>
          <div className="text-2xl font-bold text-emerald-600">{summary.ok}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">مكسورة</div>
          <div className="text-2xl font-bold text-destructive">{summary.broken}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">قيد الفحص</div>
          <div className="text-2xl font-bold text-muted-foreground">{summary.pending}</div>
        </Card>
      </div>

      {scanning && (
        <Card className="p-4">
          <div className="mb-2 flex justify-between text-sm">
            <span>جاري الفحص…</span>
            <span>{progress}%</span>
          </div>
          <Progress value={progress} />
        </Card>
      )}

      <Tabs defaultValue="broken">
        <TabsList>
          <TabsTrigger value="broken">المكسورة ({summary.broken})</TabsTrigger>
          <TabsTrigger value="all">الكل ({summary.total})</TabsTrigger>
          {(Object.keys(BUCKET_LABEL) as Bucket[]).map((b) => (
            <TabsTrigger key={b} value={b}>
              {BUCKET_LABEL[b]} ({byBucket[b].length})
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="broken">
          <AssetList items={assets.filter((a) => a.status === "broken")} emptyText="لا توجد روابط مكسورة 🎉" />
        </TabsContent>
        <TabsContent value="all">
          <AssetList items={assets} />
        </TabsContent>
        {(Object.keys(BUCKET_LABEL) as Bucket[]).map((b) => (
          <TabsContent key={b} value={b}>
            <AssetList items={byBucket[b]} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function AssetList({ items, emptyText }: { items: Asset[]; emptyText?: string }) {
  if (!items.length) {
    return (
      <Card className="flex items-center gap-2 p-6 text-muted-foreground">
        <ImageOff className="h-5 w-5" />
        {emptyText ?? "لا توجد عناصر."}
      </Card>
    );
  }
  return (
    <div className="mt-3 space-y-2">
      {items.map((a, i) => (
        <Card key={`${a.bucket}-${a.refId}-${i}`} className="flex items-center gap-3 p-3">
          <StatusIcon status={a.status} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-sm font-medium">
              <span className="truncate">{a.label}</span>
              <Badge variant="outline" className="text-[10px]">
                {BUCKET_LABEL[a.bucket]}
              </Badge>
            </div>
            <div className="truncate text-xs text-muted-foreground" dir="ltr">
              {a.url}
            </div>
            {a.status === "broken" && (
              <div className="text-xs text-destructive">
                {a.httpStatus ? `HTTP ${a.httpStatus}` : a.error}
              </div>
            )}
          </div>
          <a
            href={a.url}
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground hover:text-foreground"
            aria-label="فتح الرابط"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        </Card>
      ))}
    </div>
  );
}

function StatusIcon({ status }: { status: Status }) {
  if (status === "ok") return <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />;
  if (status === "broken") return <XCircle className="h-5 w-5 shrink-0 text-destructive" />;
  return <Loader2 className="h-5 w-5 shrink-0 animate-spin text-muted-foreground" />;
}
