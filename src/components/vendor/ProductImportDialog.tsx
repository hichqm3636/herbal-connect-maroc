import { useState } from "react";
import Papa from "papaparse";
import { Loader2, Upload, FileSpreadsheet, AlertCircle, CheckCircle2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  onImported: () => void;
}

interface RowDraft {
  name_ar: string;
  description_ar: string;
  category: string | null;
  sku: string | null;
  price_mad: number;
  cost_price: number | null;
  rrp_price: number | null;
  stock: number | null;
  minimum_order: number;
  pack_size: number;
  image_url: string | null;
  active: boolean;
  _error?: string;
}

const REQUIRED_HEADERS = ["name_ar", "price_mad"];
const TEMPLATE_HEADERS = [
  "name_ar",
  "description_ar",
  "category",
  "sku",
  "price_mad",
  "cost_price",
  "rrp_price",
  "stock",
  "minimum_order",
  "pack_size",
  "image_url",
];

function parseNumber(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function parseInt0(v: unknown, fallback = 1): number {
  const n = parseNumber(v);
  if (n === null || n < 0) return fallback;
  return Math.floor(n);
}

export function ProductImportDialog({ open, onOpenChange, companyId, onImported }: Props) {
  const [rows, setRows] = useState<RowDraft[]>([]);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [headerError, setHeaderError] = useState<string | null>(null);

  function reset() {
    setRows([]);
    setHeaderError(null);
  }

  function downloadTemplate() {
    const csv = TEMPLATE_HEADERS.join(",") + "\n" +
      "صابون طبيعي,صابون بزيت الزيتون 100غ,العناية بالبشرة,SKU-001,45,20,55,100,1,1,";
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "products-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleFile(file: File) {
    setParsing(true);
    setHeaderError(null);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase(),
      complete: (result) => {
        setParsing(false);
        const fields = result.meta.fields ?? [];
        const missing = REQUIRED_HEADERS.filter((h) => !fields.includes(h));
        if (missing.length > 0) {
          setHeaderError(`أعمدة مفقودة: ${missing.join(", ")}`);
          setRows([]);
          return;
        }
        const drafts: RowDraft[] = result.data.map((r) => {
          const name = (r.name_ar ?? "").trim();
          const price = parseNumber(r.price_mad);
          let err: string | undefined;
          if (!name || name.length < 2) err = "الاسم مفقود";
          else if (price === null || price <= 0) err = "السعر غير صالح";
          return {
            name_ar: name,
            description_ar: (r.description_ar ?? "").trim(),
            category: (r.category ?? "").trim() || null,
            sku: (r.sku ?? "").trim() || null,
            price_mad: price ?? 0,
            cost_price: parseNumber(r.cost_price),
            rrp_price: parseNumber(r.rrp_price),
            stock: parseNumber(r.stock),
            minimum_order: parseInt0(r.minimum_order, 1),
            pack_size: parseInt0(r.pack_size, 1),
            image_url: (r.image_url ?? "").trim() || null,
            active: true,
            _error: err,
          };
        });
        setRows(drafts);
      },
      error: () => {
        setParsing(false);
        toast.error("تعذر قراءة الملف");
      },
    });
  }

  async function handleImport() {
    const valid = rows.filter((r) => !r._error);
    if (valid.length === 0) {
      toast.error("لا توجد صفوف صالحة");
      return;
    }
    setImporting(true);
    const payload = valid.map((r) => ({
      company_id: companyId,
      name_ar: r.name_ar,
      description_ar: r.description_ar,
      category: r.category,
      sku: r.sku,
      price_mad: r.price_mad,
      cost_price: r.cost_price,
      rrp_price: r.rrp_price,
      stock: r.stock,
      minimum_order: r.minimum_order,
      pack_size: r.pack_size,
      image_url: r.image_url,
      active: r.active,
      external_id: `csv-${crypto.randomUUID()}`,
      source: "csv_import",
    }));
    const { error } = await supabase.from("products").insert(payload);
    setImporting(false);
    if (error) {
      const { handleLimitError } = await import("@/lib/limitErrors");
      if (handleLimitError(error, "منتج")) return;
      toast.error(error.message || "فشل الاستيراد");
      return;
    }
    toast.success(`تم استيراد ${valid.length} منتج`);
    reset();
    onOpenChange(false);
    onImported();
  }

  const validCount = rows.filter((r) => !r._error).length;
  const errorCount = rows.length - validCount;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            استيراد منتجات من CSV
          </DialogTitle>
          <DialogDescription>
            ارفع ملف CSV يحتوي على المنتجات. الأعمدة الإلزامية: <code>name_ar</code> و <code>price_mad</code>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <FileSpreadsheet className="h-4 w-4" />
              تنزيل قالب CSV
            </Button>
            <label className="cursor-pointer">
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                  e.target.value = "";
                }}
              />
              <span className="inline-flex items-center gap-2 rounded-md border bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                {parsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {parsing ? "جاري القراءة..." : "اختر ملف CSV"}
              </span>
            </label>
          </div>

          {headerError && (
            <Card className="border-destructive/50 bg-destructive/10 p-3 text-sm">
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-4 w-4" />
                {headerError}
              </div>
            </Card>
          )}

          {rows.length > 0 && (
            <>
              <div className="flex items-center gap-3 text-sm">
                <Badge variant="default" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  {validCount} صالح
                </Badge>
                {errorCount > 0 && (
                  <Badge variant="destructive" className="gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {errorCount} به أخطاء
                  </Badge>
                )}
              </div>

              <Card className="overflow-hidden">
                <div className="max-h-80 overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-muted text-muted-foreground">
                      <tr className="text-right">
                        <th className="px-2 py-2 font-medium">#</th>
                        <th className="px-2 py-2 font-medium">الاسم</th>
                        <th className="px-2 py-2 font-medium">الفئة</th>
                        <th className="px-2 py-2 font-medium">السعر</th>
                        <th className="px-2 py-2 font-medium">المخزون</th>
                        <th className="px-2 py-2 font-medium">الحالة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {rows.map((r, i) => (
                        <tr key={i} className={r._error ? "bg-destructive/5" : ""}>
                          <td className="px-2 py-1.5 font-mono text-muted-foreground">{i + 1}</td>
                          <td className="px-2 py-1.5 max-w-[200px] truncate">{r.name_ar || "—"}</td>
                          <td className="px-2 py-1.5 text-muted-foreground">{r.category || "—"}</td>
                          <td className="px-2 py-1.5 tabular-nums">{r.price_mad || "—"}</td>
                          <td className="px-2 py-1.5 tabular-nums">{r.stock ?? "—"}</td>
                          <td className="px-2 py-1.5">
                            {r._error ? (
                              <span className="text-destructive">{r._error}</span>
                            ) : (
                              <span className="text-success-foreground">جاهز</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={importing}>
            إلغاء
          </Button>
          <Button onClick={handleImport} disabled={importing || validCount === 0}>
            {importing && <Loader2 className="h-4 w-4 animate-spin" />}
            استيراد {validCount > 0 ? `(${validCount})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
