import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, UserPlus, Copy, Check, Network, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { WhatsappContactButton } from "@/components/WhatsappContactButton";
import {
  buildPartnerGreetingMessage,
  buildPartnerInviteMessage,
  buildWhatsappLink,
} from "@/utils/whatsapp";

export const Route = createFileRoute("/_app/_admin/admin/partners")({
  component: AdminPartnersPage,
});

type PartnerType = "distributor" | "pharmacy" | "parapharmacy" | "gym";
type PartnerStatus = "invited" | "active" | "suspended";

interface PartnerRow {
  id: string;
  name: string;
  type: PartnerType;
  email: string;
  phone: string | null;
  city: string | null;
  status: PartnerStatus;
  created_at: string;
}

interface InviteRow {
  id: string;
  email: string;
  partner_type: PartnerType;
  partner_name: string | null;
  phone: string | null;
  invite_token: string;
  status: "pending" | "accepted" | "expired";
  expires_at: string;
  created_at: string;
}

const TYPE_LABEL: Record<PartnerType, string> = {
  distributor: "موزع",
  pharmacy: "صيدلية",
  parapharmacy: "باراصيدلية",
  gym: "نادي رياضي",
};

const STATUS_LABEL: Record<PartnerStatus, string> = {
  invited: "تمت الدعوة",
  active: "نشط",
  suspended: "موقوف",
};

const STATUS_VARIANT: Record<PartnerStatus, "default" | "secondary" | "destructive"> = {
  invited: "secondary",
  active: "default",
  suspended: "destructive",
};

function generateToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function inviteUrl(token: string): string {
  if (typeof window === "undefined") return `/invite/${token}`;
  return `${window.location.origin}/invite/${token}`;
}

function AdminPartnersPage() {
  const { companyId, company } = useAuth();
  const companyName = company?.display_name || company?.name || "منصتنا";
  const [partners, setPartners] = useState<PartnerRow[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | PartnerType>("all");
  const [open, setOpen] = useState(false);
  const [lastInvite, setLastInvite] = useState<
    { url: string; email: string; partnerName: string | null; phone: string | null } | null
  >(null);

  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    const [{ data: p }, { data: i }] = await Promise.all([
      supabase.from("partners").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
      supabase.from("partner_invites").select("*").eq("company_id", companyId).order("created_at", { ascending: false }).limit(50),
    ]);
    setPartners((p as PartnerRow[]) ?? []);
    setInvites((i as InviteRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { void load(); }, [companyId]);

  const filtered = useMemo(
    () => (filter === "all" ? partners : partners.filter((p) => p.type === filter)),
    [partners, filter],
  );

  const pendingInvites = invites.filter((i) => i.status === "pending");

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Network className="h-6 w-6 text-primary" /> الشركاء
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            إدارة شبكة التوزيع: الموزعون، الصيدليات، الباراصيدليات، والأندية الرياضية.
          </p>
        </div>
        <InviteDialog
          open={open}
          onOpenChange={setOpen}
          companyId={companyId}
          onInvited={(url, email, partnerName, phone) => {
            setLastInvite({ url, email, partnerName, phone });
            void load();
          }}
        />
      </div>

      {lastInvite && (
        <Card className="p-4 bg-primary/5 border-primary/30">
          <div className="flex flex-col gap-3">
            <div>
              <p className="text-sm font-semibold">
                ✅ تم إنشاء دعوة لـ <span className="text-primary">{lastInvite.email}</span>
              </p>
              <p className="text-sm font-bold mt-2">
                انسخ الرابط وأرسله للشريك ليكمل التسجيل.
              </p>
            </div>
            <CopyLink url={lastInvite.url} />
            <div className="flex gap-2 flex-wrap">
              {lastInvite.phone && (
                <Button
                  size="sm"
                  variant="default"
                  className="bg-[#25D366] hover:bg-[#1ebe57] text-white"
                  asChild
                >
                  <a
                    href={buildWhatsappLink(
                      lastInvite.phone,
                      buildPartnerInviteMessage({
                        partnerName: lastInvite.partnerName,
                        companyName,
                        inviteUrl: lastInvite.url,
                      }),
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <MessageCircle className="h-4 w-4 ml-2" /> إرسال عبر WhatsApp
                  </a>
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                asChild
              >
                <a
                  href={`mailto:${lastInvite.email}?subject=${encodeURIComponent(
                    `دعوة للانضمام إلى ${companyName}`,
                  )}&body=${encodeURIComponent(
                    buildPartnerInviteMessage({
                      partnerName: lastInvite.partnerName,
                      companyName,
                      inviteUrl: lastInvite.url,
                    }),
                  )}`}
                >
                  إرسال عبر البريد
                </a>
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Card className="p-4">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <TabsList className="grid grid-cols-5 w-full max-w-2xl">
            <TabsTrigger value="all">الكل</TabsTrigger>
            <TabsTrigger value="distributor">موزع</TabsTrigger>
            <TabsTrigger value="pharmacy">صيدلية</TabsTrigger>
            <TabsTrigger value="parapharmacy">باراصيدلية</TabsTrigger>
            <TabsTrigger value="gym">نادي رياضي</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="mt-4 overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10 text-sm text-muted-foreground">
              لا يوجد شركاء بعد. اضغط "دعوة شريك" للبدء.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">الاسم</TableHead>
                  <TableHead className="text-right">النوع</TableHead>
                  <TableHead className="text-right">المدينة</TableHead>
                  <TableHead className="text-right">البريد</TableHead>
                  <TableHead className="text-right">الحالة</TableHead>
                  <TableHead className="text-right">تاريخ الإنشاء</TableHead>
                  <TableHead className="text-right">تواصل</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>{TYPE_LABEL[p.type]}</TableCell>
                    <TableCell>{p.city ?? "—"}</TableCell>
                    <TableCell className="text-xs">{p.email}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[p.status]}>{STATUS_LABEL[p.status]}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(p.created_at).toLocaleDateString("ar-MA")}
                    </TableCell>
                    <TableCell>
                      <WhatsappContactButton
                        phone={p.phone}
                        message={buildPartnerGreetingMessage(p.name)}
                        label="WhatsApp"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </Card>

      {pendingInvites.length > 0 && (
        <Card className="p-4">
          <h2 className="font-semibold mb-3">دعوات معلقة ({pendingInvites.length})</h2>
          <div className="space-y-2">
            {pendingInvites.map((i) => (
              <div
                key={i.id}
                className="flex items-center justify-between gap-3 p-3 rounded-md border bg-muted/30 flex-wrap"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{i.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {TYPE_LABEL[i.partner_type]} · تنتهي {new Date(i.expires_at).toLocaleDateString("ar-MA")}
                  </p>
                </div>
                <CopyLink url={inviteUrl(i.invite_token)} />
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 w-full max-w-xl">
      <Input value={url} readOnly className="font-mono text-xs" />
      <Button
        size="sm"
        variant="outline"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            toast.success("تم نسخ الرابط");
            setTimeout(() => setCopied(false), 1500);
          } catch {
            toast.error("تعذر النسخ");
          }
        }}
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </Button>
    </div>
  );
}

function InviteDialog({
  open, onOpenChange, companyId, onInvited,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  companyId: string | null;
  onInvited: (url: string, email: string, partnerName: string | null, phone: string | null) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [type, setType] = useState<PartnerType>("distributor");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setName(""); setEmail(""); setPhone(""); setCity(""); setType("distributor");
  };

  const submit = async () => {
    if (!companyId) return;
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      toast.error("البريد الإلكتروني غير صالح");
      return;
    }
    if (!name.trim()) {
      toast.error("اسم الشريك مطلوب");
      return;
    }
    setSubmitting(true);
    const token = generateToken();
    const { data: { user } } = await supabase.auth.getUser();

    // Pre-create partner row in "invited" state (best-effort; ignore if already exists).
    await supabase.from("partners").upsert(
      {
        company_id: companyId,
        name: name.trim(),
        type,
        email: cleanEmail,
        phone: phone.trim() || null,
        city: city.trim() || null,
        status: "invited",
      },
      { onConflict: "company_id,email", ignoreDuplicates: true },
    );

    const { error } = await supabase.from("partner_invites").insert({
      company_id: companyId,
      email: cleanEmail,
      partner_type: type,
      partner_name: name.trim(),
      phone: phone.trim() || null,
      city: city.trim() || null,
      invite_token: token,
      created_by: user?.id ?? null,
    });

    setSubmitting(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("تم إنشاء الدعوة");
    onInvited(inviteUrl(token), cleanEmail, name.trim() || null, phone.trim() || null);
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="h-4 w-4 ml-2" /> دعوة شريك
        </Button>
      </DialogTrigger>
      <DialogContent dir="rtl">
        <DialogHeader>
          <DialogTitle>دعوة شريك جديد</DialogTitle>
          <DialogDescription>
            سيتم توليد رابط آمن لتسجيل الشريك في بوابتك.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="p-name">اسم الشريك</Label>
            <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="p-email">البريد الإلكتروني</Label>
              <Input id="p-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="p-phone">الهاتف</Label>
              <Input id="p-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="p-city">المدينة</Label>
              <Input id="p-city" value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
            <div>
              <Label>نوع الشريك</Label>
              <Select value={type} onValueChange={(v) => setType(v as PartnerType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="distributor">{TYPE_LABEL.distributor}</SelectItem>
                  <SelectItem value="pharmacy">{TYPE_LABEL.pharmacy}</SelectItem>
                  <SelectItem value="parapharmacy">{TYPE_LABEL.parapharmacy}</SelectItem>
                  <SelectItem value="gym">{TYPE_LABEL.gym}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            إلغاء
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
            إنشاء الدعوة
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
