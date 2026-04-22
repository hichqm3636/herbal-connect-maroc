import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Loader2, User, KeyRound, Camera, Trash2, Mail, Eye } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useHeaderPreview, type HeaderPreviewMode } from "@/hooks/useHeaderPreview";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const email = user?.email ?? "";

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");

  useEffect(() => {
    const load = async () => {
      if (!user?.id) return;
      const { data } = await supabase
        .from("profiles")
        .select("full_name, phone, avatar_url")
        .eq("id", user.id)
        .maybeSingle();
      setFullName(data?.full_name ?? "");
      setPhone(data?.phone ?? "");
      setAvatarUrl((data as { avatar_url?: string | null } | null)?.avatar_url ?? null);
      setLoading(false);
    };
    load();
  }, [user?.id]);

  const onPickAvatar = () => fileInputRef.current?.click();

  const onAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user?.id) return;
    if (!file.type.startsWith("image/")) {
      toast.error("يرجى اختيار ملف صورة");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("الحد الأقصى لحجم الصورة 5 ميغابايت");
      return;
    }
    setUploadingAvatar(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { cacheControl: "3600", upsert: true });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      const url = pub.publicUrl;
      const { error: dbErr } = await supabase
        .from("profiles")
        .update({ avatar_url: url } as never)
        .eq("id", user.id);
      if (dbErr) throw dbErr;
      setAvatarUrl(url);
      toast.success("تم تحديث الصورة");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر رفع الصورة");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const removeAvatar = async () => {
    if (!user?.id || !avatarUrl) return;
    setUploadingAvatar(true);
    try {
      const marker = "/avatars/";
      const idx = avatarUrl.indexOf(marker);
      if (idx !== -1) {
        const path = avatarUrl.slice(idx + marker.length);
        await supabase.storage.from("avatars").remove([path]);
      }
      const { error } = await supabase
        .from("profiles")
        .update({ avatar_url: null } as never)
        .eq("id", user.id);
      if (error) throw error;
      setAvatarUrl(null);
      toast.success("تم حذف الصورة");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر حذف الصورة");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const saveProfile = async () => {
    if (!user?.id) return;
    if (!fullName.trim()) {
      toast.error("الاسم مطلوب");
      return;
    }
    setSavingProfile(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName.trim(), phone: phone.trim() || null })
      .eq("id", user.id);
    setSavingProfile(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("تم حفظ المعلومات");
  };

  const updatePassword = async () => {
    if (newPw.length < 8 || !/[A-Za-z]/.test(newPw) || !/[0-9]/.test(newPw)) {
      toast.error("كلمة المرور: 8 أحرف على الأقل مع حروف وأرقام");
      return;
    }
    if (newPw !== confirmPw) {
      toast.error("كلمتا المرور غير متطابقتين");
      return;
    }
    if (!email) return;

    setSavingPassword(true);
    // Re-verify the current password by attempting a sign-in
    const { error: verifyErr } = await supabase.auth.signInWithPassword({
      email,
      password: currentPw,
    });
    if (verifyErr) {
      setSavingPassword(false);
      toast.error("كلمة المرور الحالية غير صحيحة");
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: newPw });
    setSavingPassword(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setCurrentPw("");
    setNewPw("");
    setConfirmPw("");
    toast.success("تم تحديث كلمة المرور");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold">الإعدادات</h1>
        <p className="text-sm text-muted-foreground">إدارة معلومات حسابك وكلمة المرور</p>
      </div>

      <Card className="shadow-soft">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            معلومات الحساب
          </CardTitle>
          <CardDescription>قم بتحديث صورتك واسمك ورقم هاتفك</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Avatar className="h-20 w-20">
              <AvatarImage src={avatarUrl ?? undefined} alt={fullName || email} />
              <AvatarFallback className="text-lg">
                {(fullName || email)[0]?.toUpperCase() ?? "U"}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onAvatarChange}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onPickAvatar}
                disabled={uploadingAvatar}
                className="gap-2"
              >
                {uploadingAvatar ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Camera className="h-4 w-4" />
                )}
                {avatarUrl ? "تغيير الصورة" : "رفع صورة"}
              </Button>
              {avatarUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={removeAvatar}
                  disabled={uploadingAvatar}
                  className="gap-2 text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                  حذف الصورة
                </Button>
              )}
              <p className="text-xs text-muted-foreground">PNG/JPG، حتى 5MB</p>
            </div>
          </div>
          <Separator />
          <div className="space-y-2">
            <Label htmlFor="fullName">الاسم الكامل</Label>
            <Input
              id="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              maxLength={100}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">البريد الإلكتروني</Label>
            <Input id="email" value={email} disabled dir="ltr" />
            <p className="text-xs text-muted-foreground">لتغيير البريد الإلكتروني، استخدم القسم أدناه</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">رقم الهاتف</Label>
            <Input
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              dir="ltr"
              maxLength={32}
            />
          </div>
          <div className="flex justify-end">
            <Button onClick={saveProfile} disabled={savingProfile}>
              {savingProfile && <Loader2 className="h-4 w-4 animate-spin" />}
              حفظ التغييرات
            </Button>
          </div>
        </CardContent>
      </Card>

      <ChangeEmailCard currentEmail={email} />

      <HeaderPreviewCard />

      <Card className="shadow-soft">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" />
            تغيير كلمة المرور
          </CardTitle>
          <CardDescription>
            8 أحرف على الأقل، تحتوي على حروف وأرقام
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="currentPw">كلمة المرور الحالية</Label>
            <Input
              id="currentPw"
              type="password"
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
              dir="ltr"
              autoComplete="current-password"
            />
          </div>
          <Separator />
          <div className="space-y-2">
            <Label htmlFor="newPw">كلمة المرور الجديدة</Label>
            <Input
              id="newPw"
              type="password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              dir="ltr"
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPw">تأكيد كلمة المرور الجديدة</Label>
            <Input
              id="confirmPw"
              type="password"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              dir="ltr"
              autoComplete="new-password"
            />
          </div>
          <div className="flex justify-end">
            <Button
              onClick={updatePassword}
              disabled={savingPassword || !currentPw || !newPw || !confirmPw}
            >
              {savingPassword && <Loader2 className="h-4 w-4 animate-spin" />}
              تحديث كلمة المرور
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ChangeEmailCard({ currentEmail }: { currentEmail: string }) {
  const [newEmail, setNewEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [pending, setPending] = useState(false);

  const submit = async () => {
    const trimmed = newEmail.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast.error("يرجى إدخال بريد إلكتروني صحيح");
      return;
    }
    if (trimmed === currentEmail.toLowerCase()) {
      toast.error("هذا هو بريدك الحالي");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.auth.updateUser(
      { email: trimmed },
      { emailRedirectTo: `${window.location.origin}/settings` },
    );
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setPending(true);
    setNewEmail("");
    toast.success("تم إرسال رابط التأكيد إلى البريدين القديم والجديد");
  };

  return (
    <Card className="shadow-soft">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-primary" />
          تغيير البريد الإلكتروني
        </CardTitle>
        <CardDescription>
          سنرسل رابط تأكيد إلى بريدك الحالي والجديد. لن يتم تغيير البريد إلا بعد
          تأكيد كلا الرابطين.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>البريد الحالي</Label>
          <Input value={currentEmail} disabled dir="ltr" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="newEmail">البريد الإلكتروني الجديد</Label>
          <Input
            id="newEmail"
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            dir="ltr"
            placeholder="name@example.com"
            autoComplete="email"
            maxLength={255}
          />
        </div>
        {pending && (
          <p className="rounded-md border border-dashed border-primary/40 bg-primary/5 p-3 text-xs text-muted-foreground">
            تحقق من صندوق الوارد لكلا البريدين وانقر على رابط التأكيد لإكمال
            التغيير. قد ينتهي صلاحية الرابط بعد فترة، ويمكنك إعادة الإرسال في أي
            وقت.
          </p>
        )}
        <div className="flex justify-end">
          <Button onClick={submit} disabled={submitting || !newEmail.trim()}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            إرسال رابط التأكيد
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
