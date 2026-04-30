import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Save, User as UserIcon, Phone, MapPin, Mail } from "lucide-react";
import { z } from "zod";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/profile")({
  component: ProfilePage,
  head: () => ({ meta: [{ title: "ملفي الشخصي — Nexora" }] }),
});

const profileSchema = z.object({
  full_name: z.string().trim().min(2, "الاسم قصير جداً").max(100),
  phone: z
    .string()
    .trim()
    .max(20)
    .regex(/^[+0-9 ()-]*$/, "رقم هاتف غير صالح")
    .optional()
    .or(z.literal("")),
  city: z.string().trim().max(80).optional().or(z.literal("")),
  address: z.string().trim().max(300).optional().or(z.literal("")),
  address_notes: z.string().trim().max(300).optional().or(z.literal("")),
  avatar_url: z.string().trim().url("رابط غير صالح").max(500).optional().or(z.literal("")),
});

interface FormState {
  full_name: string;
  phone: string;
  city: string;
  address: string;
  address_notes: string;
  avatar_url: string;
}

const empty: FormState = {
  full_name: "",
  phone: "",
  city: "",
  address: "",
  address_notes: "",
  avatar_url: "",
};

function ProfilePage() {
  const { user } = useAuth();
  const [form, setForm] = useState<FormState>(empty);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("profiles")
        .select("full_name, phone, city, address, address_notes, avatar_url")
        .eq("id", user.id)
        .maybeSingle();
      if (data) {
        setForm({
          full_name: data.full_name ?? "",
          phone: data.phone ?? "",
          city: data.city ?? "",
          address: data.address ?? "",
          address_notes: data.address_notes ?? "",
          avatar_url: data.avatar_url ?? "",
        });
      }
      setLoading(false);
    })();
  }, [user]);

  const update = (k: keyof FormState) => (v: string) =>
    setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const parsed = profileSchema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "بيانات غير صالحة");
      return;
    }

    setSaving(true);
    const payload = {
      id: user.id,
      full_name: parsed.data.full_name,
      phone: parsed.data.phone || null,
      city: parsed.data.city || null,
      address: parsed.data.address || null,
      address_notes: parsed.data.address_notes || null,
      avatar_url: parsed.data.avatar_url || null,
    };
    const { error } = await supabase.from("profiles").upsert(payload);
    setSaving(false);

    if (error) {
      toast.error("تعذّر الحفظ: " + error.message);
      return;
    }
    toast.success("تم حفظ الملف الشخصي");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const initial = (form.full_name || user?.email || "U")[0].toUpperCase();

  return (
    <div className="mx-auto max-w-2xl space-y-6" dir="rtl">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">ملفي الشخصي</h1>
        <p className="text-sm text-muted-foreground">
          حدّث بياناتك وعنوان الشحن لإتمام الطلبات بسرعة.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Card className="p-5">
          <div className="mb-5 flex items-center gap-4">
            <Avatar className="h-16 w-16 ring-2 ring-primary/20">
              <AvatarImage src={form.avatar_url || undefined} alt={form.full_name} />
              <AvatarFallback className="bg-primary/10 text-lg font-bold text-primary">
                {initial}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{form.full_name || "—"}</p>
              <p className="flex items-center gap-1 truncate text-xs text-muted-foreground" dir="ltr">
                <Mail className="h-3 w-3" />
                {user?.email}
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <Label htmlFor="full_name" className="mb-1.5 flex items-center gap-1.5">
                <UserIcon className="h-3.5 w-3.5" />
                الاسم الكامل *
              </Label>
              <Input
                id="full_name"
                value={form.full_name}
                onChange={(e) => update("full_name")(e.target.value)}
                placeholder="محمد العلوي"
                required
                maxLength={100}
              />
            </div>

            <div>
              <Label htmlFor="phone" className="mb-1.5 flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" />
                رقم الهاتف
              </Label>
              <Input
                id="phone"
                value={form.phone}
                onChange={(e) => update("phone")(e.target.value)}
                placeholder="+212 6 XX XX XX XX"
                dir="ltr"
                maxLength={20}
              />
            </div>

            <div>
              <Label htmlFor="avatar_url" className="mb-1.5">
                رابط الصورة الشخصية
              </Label>
              <Input
                id="avatar_url"
                value={form.avatar_url}
                onChange={(e) => update("avatar_url")(e.target.value)}
                placeholder="https://..."
                dir="ltr"
                maxLength={500}
              />
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-bold">
            <MapPin className="h-4 w-4 text-primary" />
            عنوان الشحن
          </h2>
          <div className="space-y-4">
            <div>
              <Label htmlFor="city" className="mb-1.5">
                المدينة
              </Label>
              <Input
                id="city"
                value={form.city}
                onChange={(e) => update("city")(e.target.value)}
                placeholder="الدار البيضاء"
                maxLength={80}
              />
            </div>
            <div>
              <Label htmlFor="address" className="mb-1.5">
                العنوان
              </Label>
              <Textarea
                id="address"
                value={form.address}
                onChange={(e) => update("address")(e.target.value)}
                placeholder="الشارع، الحي، الرقم..."
                maxLength={300}
                rows={2}
              />
            </div>
            <div>
              <Label htmlFor="address_notes" className="mb-1.5">
                ملاحظات للموصِّل (اختياري)
              </Label>
              <Textarea
                id="address_notes"
                value={form.address_notes}
                onChange={(e) => update("address_notes")(e.target.value)}
                placeholder="بجانب الصيدلية، الطابق 2..."
                maxLength={300}
                rows={2}
              />
            </div>
          </div>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" disabled={saving} className="gap-2">
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            حفظ التغييرات
          </Button>
        </div>
      </form>
    </div>
  );
}
