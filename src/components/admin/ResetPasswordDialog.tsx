import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  userId: string | null;
  fullName?: string;
  onClose: () => void;
}

export function ResetPasswordDialog({ userId, fullName, onClose }: Props) {
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (userId) {
      setPw("");
      setError(null);
    }
  }, [userId]);

  const submit = async () => {
    if (pw.length < 8 || !/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) {
      setError("8 أحرف على الأقل مع حروف وأرقام");
      return;
    }
    if (!userId) return;
    setBusy(true);
    try {
      const { data, error: invErr } = await supabase.functions.invoke("create-distributor", {
        body: { action: "reset_password", userId, newPassword: pw },
      });
      if (invErr) {
        let msg = invErr.message;
        try {
          const ctx = (invErr as { context?: Response }).context;
          if (ctx) {
            const j = await ctx.clone().json();
            if (j?.error) msg = j.error;
          }
        } catch { /* ignore */ }
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.error);
      toast.success("تم تحديث كلمة المرور");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر التحديث");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!userId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl">
        <DialogHeader>
          <DialogTitle>إعادة تعيين كلمة مرور {fullName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Label>كلمة المرور الجديدة</Label>
          <Input
            type="text"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="8+ أحرف، حروف وأرقام"
            dir="ltr"
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <p className="text-xs text-muted-foreground">
            شارك كلمة المرور الجديدة مع الموزع عبر قناة آمنة.
          </p>
        </div>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>إلغاء</Button>
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
