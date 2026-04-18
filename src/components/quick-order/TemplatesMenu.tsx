import { useEffect, useState } from "react";
import { Loader2, Save, Trash2, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface TemplateItem {
  sku: string;
  qty: number;
}

interface Template {
  id: string;
  name: string;
  items: TemplateItem[];
  updated_at: string;
}

interface Props {
  currentItems: TemplateItem[];
  onLoad: (items: TemplateItem[]) => void;
}

export function TemplatesMenu({ currentItems, onLoad }: Props) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const refresh = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("quick_order_templates")
      .select("id, name, items, updated_at")
      .order("updated_at", { ascending: false });
    if (error) {
      toast.error("تعذّر تحميل القوالب");
    } else {
      setTemplates(
        (data ?? []).map((t) => ({
          id: t.id,
          name: t.name,
          items: Array.isArray(t.items) ? (t.items as unknown as TemplateItem[]) : [],
          updated_at: t.updated_at,
        })),
      );
    }
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, []);

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("الرجاء إدخال اسم للقالب");
      return;
    }
    const items = currentItems.filter((i) => i.sku.trim().length > 0);
    if (items.length === 0) {
      toast.error("لا توجد عناصر للحفظ");
      return;
    }
    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      toast.error("يجب تسجيل الدخول");
      setSaving(false);
      return;
    }
    const { error } = await supabase.from("quick_order_templates").insert({
      user_id: userData.user.id,
      name: trimmed,
      items: items as unknown as never,
    });
    setSaving(false);
    if (error) {
      toast.error("تعذّر حفظ القالب");
      return;
    }
    toast.success(`تم حفظ القالب "${trimmed}"`);
    setName("");
    setSaveOpen(false);
    refresh();
  };

  const remove = async (id: string, tplName: string) => {
    const { error } = await supabase.from("quick_order_templates").delete().eq("id", id);
    if (error) {
      toast.error("تعذّر حذف القالب");
      return;
    }
    toast.success(`تم حذف "${tplName}"`);
    refresh();
  };

  return (
    <div className="flex gap-2">
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <Save className="ml-2 h-4 w-4" />
            حفظ كقالب
          </Button>
        </DialogTrigger>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>حفظ قائمة كقالب</DialogTitle>
            <DialogDescription>
              احفظ هذه القائمة لإعادة استخدامها لاحقًا (مثل "إعادة طلب شهري").
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="tpl-name">اسم القالب</Label>
            <Input
              id="tpl-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="إعادة طلب شهري"
              maxLength={80}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)} disabled={saving}>
              إلغاء
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <FolderOpen className="ml-2 h-4 w-4" />
            قوالبي
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" dir="rtl" className="w-72">
          <DropdownMenuLabel>القوالب المحفوظة</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {loading && (
            <div className="flex items-center gap-2 px-2 py-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              جار التحميل…
            </div>
          )}
          {!loading && templates.length === 0 && (
            <div className="px-2 py-2 text-sm text-muted-foreground">لا توجد قوالب بعد</div>
          )}
          {!loading &&
            templates.map((t) => (
              <DropdownMenuItem
                key={t.id}
                onSelect={(e) => e.preventDefault()}
                className="flex items-center justify-between gap-2"
              >
                <button
                  type="button"
                  onClick={() => {
                    onLoad(t.items);
                    toast.success(`تم تحميل "${t.name}"`);
                  }}
                  className="flex-1 text-right"
                >
                  <div className="font-medium">{t.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {t.items.length} عنصر
                  </div>
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(t.id, t.name);
                  }}
                  aria-label="حذف"
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </DropdownMenuItem>
            ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
