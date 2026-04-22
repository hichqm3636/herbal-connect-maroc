import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, Palette, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { withFreshSession } from "@/lib/ensureSession";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/_admin/admin/branding")({
  component: BrandingPage,
});

function BrandingPage() {
  const { company, companyId, refreshCompany } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [brandColor, setBrandColor] = useState("#16a34a");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (company) {
      setDisplayName(company.display_name || "");
      setBrandColor(company.brand_color || "#16a34a");
      setLogoUrl(company.logo_url);
    }
  }, [company]);

  if (!companyId) {
    return (
      <div className="text-center py-20 text-muted-foreground" dir="rtl">
        لا توجد شركة مرتبطة بحسابك.
      </div>
    );
  }

  const onPickLogo = () => fileRef.current?.click();

  const onLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("يرجى اختيار صورة");
    if (file.size > 2 * 1024 * 1024) return toast.error("الحد الأقصى 2MB");
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${companyId}/logo-${Date.now()}.${ext}`;
      // Refresh session if needed, then upload + UPDATE the existing company row.
      const url = await withFreshSession(async () => {
        const { error: upErr } = await supabase.storage
          .from("company-logos")
          .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from("company-logos").getPublicUrl(path);
        const publicUrl = pub.publicUrl;
        const { error } = await supabase
          .from("companies")
          .update({ logo_url: publicUrl })
          .eq("id", companyId);
        if (error) throw error;
        return publicUrl;
      });
      setLogoUrl(url);
      await refreshCompany();
      toast.success("تم تحديث الشعار");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر رفع الشعار");
    } finally {
      setUploading(false);
    }
  };

  const removeLogo = async () => {
    if (!companyId) return;
    setUploading(true);
    try {
      await withFreshSession(async () => {
        const { error } = await supabase
          .from("companies")
          .update({ logo_url: null })
          .eq("id", companyId);
        if (error) throw error;
      });
      setLogoUrl(null);
      await refreshCompany();
      toast.success("تم حذف الشعار");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر حذف الشعار");
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!companyId) return;
    if (displayName.trim().length < 2) return toast.error("الاسم المعروض قصير جداً");
    setSaving(true);
    try {
      await withFreshSession(async () => {
        const { error } = await supabase
          .from("companies")
          .update({ display_name: displayName.trim(), brand_color: brandColor })
          .eq("id", companyId);
        if (error) throw error;
      });
      await refreshCompany();
      toast.success("تم حفظ الإعدادات");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر حفظ الإعدادات");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Palette className="h-6 w-6 text-primary" />
          هوية الشركة
        </h1>
        <p className="text-sm text-muted-foreground">قم بتحديث اسم شركتك ولونها وشعارها</p>
      </div>

      <Card className="shadow-soft">
        <CardHeader>
          <CardTitle>الشعار</CardTitle>
          <CardDescription>PNG/JPG، حتى 2MB</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-4 py-2">
            <div
              className="h-32 w-32 rounded-2xl flex items-center justify-center text-white text-4xl font-bold overflow-hidden shrink-0 shadow-soft"
              style={{ backgroundColor: brandColor }}
            >
              {logoUrl ? (
                <img src={logoUrl} alt="logo" className="h-full w-full object-cover" />
              ) : (
                (displayName || "C")[0].toUpperCase()
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onLogoChange}
            />
            <div className="flex flex-col items-center gap-1">
              <Button
                type="button"
                size="sm"
                onClick={onPickLogo}
                disabled={uploading}
                className="gap-2"
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                {logoUrl ? "تغيير الشعار" : "رفع شعار"}
              </Button>
              {logoUrl && (
                <button
                  type="button"
                  onClick={removeLogo}
                  disabled={uploading}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                >
                  <Trash2 className="h-3 w-3" />
                  حذف الشعار
                </button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-soft">
        <CardHeader>
          <CardTitle>المعلومات</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="displayName">الاسم المعروض</Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={100}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="brandColor">لون العلامة التجارية</Label>
            <div className="flex items-center gap-2">
              <Input
                id="brandColor"
                type="color"
                value={brandColor}
                onChange={(e) => setBrandColor(e.target.value)}
                className="h-10 w-16 p-1"
              />
              <Input value={brandColor} onChange={(e) => setBrandColor(e.target.value)} dir="ltr" />
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              حفظ
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
