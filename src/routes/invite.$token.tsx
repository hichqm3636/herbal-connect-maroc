import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ShieldCheck, AlertCircle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/invite/$token")({
  component: InviteAcceptPage,
});

type InviteInfo = {
  email: string;
  partner_type: string;
  partner_name: string | null;
  status: "pending" | "accepted" | "expired";
  expires_at: string;
  company_id: string;
  company_name: string;
  company_display_name: string;
  company_brand_color: string;
};

const TYPE_LABEL: Record<string, string> = {
  distributor: "موزع",
  pharmacy: "صيدلية",
  parapharmacy: "باراصيدلية",
  gym: "نادي رياضي",
};

function InviteAcceptPage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("partner_invite_info", { _token: token });
      if (cancelled) return;
      if (error) {
        setError(error.message);
      } else if (!data || (data as InviteInfo[]).length === 0) {
        setError("الدعوة غير موجودة");
      } else {
        const row = (data as InviteInfo[])[0];
        setInfo(row);
        setFullName(row.partner_name ?? "");
        if (row.status === "accepted") setError("تم استخدام هذه الدعوة من قبل");
        else if (row.status === "expired" || new Date(row.expires_at) < new Date())
          setError("انتهت صلاحية الدعوة");
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [token]);

  const submit = async () => {
    if (!info) return;
    if (!fullName.trim()) { toast.error("الاسم الكامل مطلوب"); return; }
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      toast.error("كلمة المرور يجب أن تكون 8 أحرف على الأقل وتحتوي على حروف وأرقام");
      return;
    }
    setSubmitting(true);

    // 1. Create the auth account (no email confirmation needed for invites).
    const { error: signUpErr } = await supabase.auth.signUp({
      email: info.email,
      password,
      options: { data: { full_name: fullName.trim() } },
    });
    if (signUpErr && !signUpErr.message.toLowerCase().includes("already registered")) {
      setSubmitting(false);
      toast.error(signUpErr.message);
      return;
    }

    // 2. Make sure we have a session (sign in if signUp didn't auto-login).
    let session = (await supabase.auth.getSession()).data.session;
    if (!session) {
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: info.email,
        password,
      });
      if (signInErr) {
        setSubmitting(false);
        toast.error("تعذر تسجيل الدخول. تحقق من كلمة المرور.");
        return;
      }
      session = (await supabase.auth.getSession()).data.session;
    }

    // 3. Atomically accept the invite (creates partner + role).
    const { error: rpcErr } = await supabase.rpc("accept_partner_invite", {
      _token: token,
      _full_name: fullName.trim(),
    });
    setSubmitting(false);
    if (rpcErr) {
      toast.error(rpcErr.message);
      return;
    }

    toast.success(`مرحباً بك في ${info.company_display_name || info.company_name}`);
    navigate({ to: "/dashboard" });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" dir="rtl">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !info) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" dir="rtl">
        <Card className="max-w-md w-full p-8 text-center">
          <AlertCircle className="h-10 w-10 mx-auto mb-3 text-destructive" />
          <h1 className="text-lg font-bold mb-2">دعوة غير صالحة</h1>
          <p className="text-sm text-muted-foreground">{error ?? "لم نتمكن من العثور على هذه الدعوة."}</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-soft" dir="rtl">
      <Card className="max-w-md w-full p-8 shadow-elegant">
        <div
          className="h-12 w-12 rounded-2xl flex items-center justify-center mb-4 text-white"
          style={{ backgroundColor: info.company_brand_color || "#16a34a" }}
        >
          <ShieldCheck className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-bold">
          مرحباً بك في {info.company_display_name || info.company_name}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          تمت دعوتك للانضمام كـ <strong>{TYPE_LABEL[info.partner_type] ?? info.partner_type}</strong> عبر منصة Nexora.
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          البريد: <span className="font-mono">{info.email}</span>
        </p>

        <div className="mt-6 space-y-3">
          <div>
            <Label htmlFor="full-name">الاسم الكامل</Label>
            <Input id="full-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="password">كلمة المرور</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="8 أحرف على الأقل، حروف وأرقام"
            />
          </div>
          <Button onClick={submit} disabled={submitting} className="w-full">
            {submitting && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
            إنشاء الحساب والدخول إلى البوابة
          </Button>
        </div>
      </Card>
    </div>
  );
}
