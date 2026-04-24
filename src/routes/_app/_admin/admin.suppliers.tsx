import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Loader2,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
  Server,
  RefreshCw,
  Save,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  listSuppliers,
  updateSupplier,
  testSupplierConnection,
  type SupplierListItem,
} from "@/utils/suppliers.functions";
import { syncWooCommerceProducts } from "@/utils/woocommerce.functions";

export const Route = createFileRoute("/_app/_admin/admin/suppliers")({
  component: AdminSuppliersPage,
});

interface DraftState {
  name: string;
  domain: string;
  consumer_key: string;
  consumer_secret: string; // empty = unchanged
  is_active: boolean;
  is_default: boolean;
  override_credentials: boolean;
  show_secret: boolean;
  saving: boolean;
  testing: boolean;
  syncing: boolean;
  testResult: { ok: boolean; status: number; message: string } | null;
}

function emptyDraft(s: SupplierListItem): DraftState {
  return {
    name: s.name,
    domain: s.domain,
    consumer_key: s.key_uses_env ? "" : "", // never preload masked value
    consumer_secret: "",
    is_active: s.is_active,
    is_default: s.is_default,
    override_credentials: !s.key_uses_env || !s.secret_uses_env,
    show_secret: false,
    saving: false,
    testing: false,
    syncing: false,
    testResult: null,
  };
}

function AdminSuppliersPage() {
  const [loading, setLoading] = useState(true);
  const [suppliers, setSuppliers] = useState<SupplierListItem[]>([]);
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({});

  const refresh = async () => {
    setLoading(true);
    try {
      const list = await listSuppliers();
      setSuppliers(list);
      setDrafts((prev) => {
        const next: Record<string, DraftState> = {};
        for (const s of list) {
          next[s.id] = prev[s.id] ?? emptyDraft(s);
          // Refresh server-side flags (env usage / is_default) without
          // overwriting user edits.
          next[s.id] = {
            ...next[s.id],
            is_active: s.is_active,
            is_default: s.is_default,
          };
        }
        return next;
      });
    } catch (e) {
      toast.error((e as Error).message || "تعذر تحميل الموردين");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const setDraft = (id: string, patch: Partial<DraftState>) =>
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const handleSave = async (s: SupplierListItem) => {
    const d = drafts[s.id];
    if (!d) return;

    if (!d.domain.trim()) {
      toast.error("الرابط مطلوب");
      return;
    }
    if (!d.domain.trim().startsWith("https://")) {
      toast.error("الرابط يجب أن يبدأ بـ https://");
      return;
    }
    if (d.override_credentials) {
      if (!d.consumer_key.trim()) {
        toast.error("Consumer Key مطلوب");
        return;
      }
      // consumer_secret may be left blank to preserve existing
    }

    setDraft(s.id, { saving: true });
    try {
      await updateSupplier({
        data: {
          id: s.id,
          name: d.name,
          domain: d.domain,
          ...(d.override_credentials && d.consumer_key.trim()
            ? { consumer_key: d.consumer_key }
            : {}),
          ...(d.override_credentials && d.consumer_secret.trim()
            ? { consumer_secret: d.consumer_secret }
            : {}),
          is_active: d.is_active,
          is_default: d.is_default,
        },
      });
      toast.success("تم حفظ بيانات المورّد");
      setDraft(s.id, { consumer_secret: "" });
      await refresh();
    } catch (e) {
      toast.error((e as Error).message || "تعذر الحفظ");
    } finally {
      setDraft(s.id, { saving: false });
    }
  };

  const handleTest = async (s: SupplierListItem) => {
    const d = drafts[s.id];
    if (!d) return;
    setDraft(s.id, { testing: true, testResult: null });
    try {
      const res = await testSupplierConnection({
        data: {
          id: s.id,
          domain: d.domain || undefined,
          consumer_key: d.override_credentials && d.consumer_key ? d.consumer_key : undefined,
          consumer_secret:
            d.override_credentials && d.consumer_secret ? d.consumer_secret : undefined,
        },
      });
      setDraft(s.id, { testResult: res });
      if (res.ok) toast.success("الاتصال ناجح ✓");
      else toast.error(`فشل الاتصال (${res.status || "—"})`);
    } catch (e) {
      const msg = (e as Error).message || "تعذر الاختبار";
      setDraft(s.id, { testResult: { ok: false, status: 0, message: msg } });
      toast.error(msg);
    } finally {
      setDraft(s.id, { testing: false });
    }
  };

  const handleSync = async (s: SupplierListItem) => {
    setDraft(s.id, { syncing: true });
    try {
      const res = await syncWooCommerceProducts({
        data: { companyId: s.company_id, supplierId: s.id },
      });
      if (res.ok) {
        toast.success(
          `مزامنة ناجحة: ${res.created} جديد، ${res.updated} محدّث${res.failed ? `، ${res.failed} فشل` : ""}`,
        );
      } else {
        toast.error(res.message || "فشلت المزامنة");
      }
    } catch (e) {
      toast.error((e as Error).message || "تعذر تشغيل المزامنة");
    } finally {
      setDraft(s.id, { syncing: false });
    }
  };

  if (loading && suppliers.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Server className="h-6 w-6 text-primary" />
            إعدادات الموردين (WooCommerce)
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            إدارة بيانات الاتصال بمتاجر WooCommerce الخاصة بكل مورّد.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ml-2 ${loading ? "animate-spin" : ""}`} />
          تحديث
        </Button>
      </div>

      {suppliers.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            لا يوجد موردون.
          </CardContent>
        </Card>
      ) : (
        suppliers.map((s) => {
          const d = drafts[s.id];
          if (!d) return null;
          const usingEnv = s.key_uses_env || s.secret_uses_env || s.domain_uses_env;
          return (
            <Card key={s.id} className="shadow-soft">
              <CardHeader>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <CardTitle className="text-lg">{s.name}</CardTitle>
                    {s.is_default && <Badge variant="secondary">افتراضي</Badge>}
                    {!s.is_active && <Badge variant="destructive">معطّل</Badge>}
                    {usingEnv && (
                      <Badge variant="outline" className="border-warning text-warning-foreground">
                        Using ENV credentials
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>اسم المورّد</Label>
                    <Input
                      value={d.name}
                      onChange={(e) => setDraft(s.id, { name: e.target.value })}
                      maxLength={100}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Domain (https://...)</Label>
                    <Input
                      value={d.domain}
                      onChange={(e) =>
                        setDraft(s.id, { domain: e.target.value, testResult: null })
                      }
                      placeholder="https://your-store.com"
                      dir="ltr"
                    />
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <p className="text-sm font-medium">بيانات WooCommerce API</p>
                      <p className="text-xs text-muted-foreground">
                        {s.key_uses_env && s.secret_uses_env
                          ? "تستخدم متغيرات البيئة حالياً. يمكنك التجاوز ببيانات مخصصة."
                          : "محفوظة في قاعدة البيانات."}
                      </p>
                    </div>
                    {!d.override_credentials && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setDraft(s.id, { override_credentials: true })}
                      >
                        Override with custom credentials
                      </Button>
                    )}
                  </div>

                  {d.override_credentials && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Consumer Key</Label>
                        <Input
                          value={d.consumer_key}
                          onChange={(e) =>
                            setDraft(s.id, {
                              consumer_key: e.target.value,
                              testResult: null,
                            })
                          }
                          placeholder={s.consumer_key_masked || "ck_..."}
                          dir="ltr"
                          autoComplete="off"
                          spellCheck={false}
                        />
                        {s.consumer_key_masked && (
                          <p className="text-xs text-muted-foreground" dir="ltr">
                            Saved: {s.consumer_key_masked}
                          </p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label>Consumer Secret</Label>
                        <div className="flex gap-2">
                          <Input
                            type={d.show_secret ? "text" : "password"}
                            value={d.consumer_secret}
                            onChange={(e) =>
                              setDraft(s.id, {
                                consumer_secret: e.target.value,
                                testResult: null,
                              })
                            }
                            placeholder={
                              s.consumer_secret_masked
                                ? "اتركه فارغاً للإبقاء على الحالي"
                                : "cs_..."
                            }
                            dir="ltr"
                            autoComplete="off"
                            spellCheck={false}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => setDraft(s.id, { show_secret: !d.show_secret })}
                            aria-label={d.show_secret ? "Hide" : "Reveal"}
                          >
                            {d.show_secret ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                        {s.consumer_secret_masked && (
                          <p className="text-xs text-muted-foreground" dir="ltr">
                            Saved: {s.consumer_secret_masked}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <Separator />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <label className="flex items-center justify-between gap-3 rounded-md border p-3">
                    <div>
                      <p className="text-sm font-medium">نشط</p>
                      <p className="text-xs text-muted-foreground">
                        تعطيله يوقف المزامنة وإرسال الطلبات.
                      </p>
                    </div>
                    <Switch
                      checked={d.is_active}
                      onCheckedChange={(v) => setDraft(s.id, { is_active: v })}
                    />
                  </label>
                  <label className="flex items-center justify-between gap-3 rounded-md border p-3">
                    <div>
                      <p className="text-sm font-medium">المورّد الافتراضي</p>
                      <p className="text-xs text-muted-foreground">
                        يستخدم عند عدم تحديد مورّد.
                      </p>
                    </div>
                    <Switch
                      checked={d.is_default}
                      onCheckedChange={(v) => setDraft(s.id, { is_default: v })}
                    />
                  </label>
                </div>

                {d.testResult && (
                  <div
                    className={`flex items-start gap-2 rounded-md border p-3 text-sm ${
                      d.testResult.ok
                        ? "border-success bg-success/10 text-success-foreground"
                        : "border-destructive bg-destructive/10 text-destructive"
                    }`}
                  >
                    {d.testResult.ok ? (
                      <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                    ) : (
                      <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="font-medium">
                        {d.testResult.ok
                          ? `Success (${d.testResult.status})`
                          : `Error${d.testResult.status ? ` (${d.testResult.status})` : ""}`}
                      </p>
                      <p className="text-xs break-all" dir="ltr">
                        {d.testResult.message}
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 flex-wrap">
                  <Button
                    variant="outline"
                    onClick={() => handleTest(s)}
                    disabled={d.testing || d.saving}
                  >
                    {d.testing ? (
                      <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                    ) : (
                      <Server className="h-4 w-4 ml-2" />
                    )}
                    Test Connection
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handleSync(s)}
                    disabled={d.syncing || d.saving}
                  >
                    {d.syncing ? (
                      <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4 ml-2" />
                    )}
                    Sync Products
                  </Button>
                  <Button onClick={() => handleSave(s)} disabled={d.saving}>
                    {d.saving ? (
                      <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 ml-2" />
                    )}
                    حفظ
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
