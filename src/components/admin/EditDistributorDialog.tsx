import { useEffect, useState } from "react";
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

interface DistributorEditable {
  id: string;
  full_name: string;
  phone: string | null;
  city: string | null;
}

interface Props {
  distributor: DistributorEditable | null;
  onClose: () => void;
  onSaved: () => void;
}

export function EditDistributorDialog({ distributor, onClose, onSaved }: Props) {
  const [form, setForm] = useState({ full_name: "", phone: "", city: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (distributor) {
      setForm({
        full_name: distributor.full_name ?? "",
        phone: distributor.phone ?? "",
        city: distributor.city ?? "",
      });
    }
  }, [distributor]);

  const save = async () => {
    if (!distributor) return;
    if (form.full_name.trim().length < 2) return toast.error("الاسم قصير جداً");
    if (form.phone.trim().length < 6) return toast.error("رقم هاتف غير صالح");
    if (form.city.trim().length < 2) return toast.error("المدينة مطلوبة");
    setBusy(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: form.full_name.trim(),
        phone: form.phone.trim(),
        city: form.city.trim(),
      })
      .eq("id", distributor.id);
    setBusy(false);
    if (error) return toast.error("تعذر التحديث");
    toast.success("تم التحديث");
    onSaved();
    onClose();
  };

  return (
    <Dialog open={!!distributor} onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl">
        <DialogHeader>
          <DialogTitle>تعديل بيانات الموزع</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>الاسم الكامل</Label>
            <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>الهاتف</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} inputMode="tel" />
            </div>
            <div className="space-y-1.5">
              <Label>المدينة</Label>
              <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </div>
          </div>
        </div>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>إلغاء</Button>
          <Button onClick={save} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
