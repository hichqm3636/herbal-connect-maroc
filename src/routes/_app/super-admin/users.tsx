import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Users as UsersIcon,
  Search,
  Loader2,
  Shield,
  ShieldOff,
  UserCog,
  Building2,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/super-admin/users")({
  component: UsersPage,
  head: () => ({ meta: [{ title: "المستخدمون — Nexora" }] }),
});

type AppRole =
  | "super_admin"
  | "admin"
  | "vendor"
  | "client"
  | "distributor"
  | "buyer"
  | "seller"
  | "sales_agent"
  | "partner";

const ASSIGNABLE_ROLES: AppRole[] = ["admin", "vendor", "client"];

const ROLE_LABEL: Record<AppRole, string> = {
  super_admin: "مسؤول المنصة",
  admin: "مسؤول شركة",
  vendor: "بائع",
  client: "عميل",
  distributor: "موزع",
  buyer: "مشتري",
  seller: "بائع (قديم)",
  sales_agent: "مندوب",
  partner: "شريك",
};

const ROLE_TONE: Record<AppRole, string> = {
  super_admin: "border-destructive/40 text-destructive bg-destructive/5",
  admin: "border-primary/40 text-primary bg-primary/5",
  vendor: "border-success/40 text-success bg-success/5",
  client: "border-muted-foreground/30 text-muted-foreground bg-muted/40",
  distributor: "border-muted-foreground/30 text-muted-foreground bg-muted/40",
  buyer: "border-muted-foreground/30 text-muted-foreground bg-muted/40",
  seller: "border-muted-foreground/30 text-muted-foreground bg-muted/40",
  sales_agent: "border-muted-foreground/30 text-muted-foreground bg-muted/40",
  partner: "border-muted-foreground/30 text-muted-foreground bg-muted/40",
};

interface ProfileRow {
  id: string;
  full_name: string;
  phone: string | null;
  city: string | null;
  is_active: boolean;
  created_at: string;
  company_id: string | null;
}

interface RoleRow {
  id: string;
  user_id: string;
  role: AppRole;
  company_id: string | null;
  is_enabled: boolean;
}

interface CompanyLite {
  id: string;
  display_name: string;
  name: string;
}

interface UserListItem {
  profile: ProfileRow;
  roles: RoleRow[];
  company: CompanyLite | null;
}

function UsersPage() {
  const [items, setItems] = useState<UserListItem[] | null>(null);
  const [companies, setCompanies] = useState<Map<string, CompanyLite>>(new Map());
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | AppRole>("all");
  const [companyFilter, setCompanyFilter] = useState<string>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    user: UserListItem;
    next: boolean;
  } | null>(null);

  const load = async () => {
    setItems(null);
    const [profilesRes, rolesRes, compsRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, phone, city, is_active, created_at, company_id")
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("user_roles")
        .select("id, user_id, role, company_id, is_enabled"),
      supabase
        .from("companies")
        .select("id, display_name, name"),
    ]);

    if (profilesRes.error || rolesRes.error || compsRes.error) {
      toast.error("تعذّر تحميل المستخدمين");
      setItems([]);
      return;
    }

    const compsMap = new Map<string, CompanyLite>();
    ((compsRes.data as CompanyLite[]) ?? []).forEach((c) => compsMap.set(c.id, c));
    setCompanies(compsMap);

    const rolesByUser = new Map<string, RoleRow[]>();
    ((rolesRes.data as RoleRow[]) ?? []).forEach((r) => {
      const arr = rolesByUser.get(r.user_id) ?? [];
      arr.push(r);
      rolesByUser.set(r.user_id, arr);
    });

    const list: UserListItem[] = ((profilesRes.data as ProfileRow[]) ?? []).map((p) => ({
      profile: p,
      roles: rolesByUser.get(p.id) ?? [],
      company: p.company_id ? compsMap.get(p.company_id) ?? null : null,
    }));

    setItems(list);
  };

  useEffect(() => {
    load();
  }, []);

  const counts = useMemo(() => {
    if (!items) return { all: 0, super_admin: 0, admin: 0, vendor: 0, client: 0, inactive: 0 };
    let super_admin = 0,
      admin = 0,
      vendor = 0,
      client = 0,
      inactive = 0;
    items.forEach((u) => {
      if (!u.profile.is_active) inactive++;
      const rs = new Set(u.roles.map((r) => r.role));
      if (rs.has("super_admin")) super_admin++;
      else if (rs.has("admin")) admin++;
      else if (rs.has("vendor")) vendor++;
      else if (rs.has("client")) client++;
    });
    return { all: items.length, super_admin, admin, vendor, client, inactive };
  }, [items]);

  const filtered = useMemo(() => {
    if (!items) return [];
    const term = q.trim().toLowerCase();
    return items.filter((u) => {
      if (roleFilter !== "all") {
        if (!u.roles.some((r) => r.role === roleFilter)) return false;
      }
      if (companyFilter !== "all") {
        if (companyFilter === "_none") {
          if (u.profile.company_id) return false;
        } else if (u.profile.company_id !== companyFilter) return false;
      }
      if (!term) return true;
      const hay = [
        u.profile.full_name,
        u.profile.phone ?? "",
        u.profile.city ?? "",
        u.company?.display_name ?? "",
        u.company?.name ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(term);
    });
  }, [items, q, roleFilter, companyFilter]);

  const toggleActive = async (u: UserListItem, next: boolean) => {
    setBusyId(u.profile.id);
    const { error } = await supabase
      .from("profiles")
      .update({ is_active: next })
      .eq("id", u.profile.id);
    setBusyId(null);
    if (error) {
      toast.error("تعذّر تحديث حالة المستخدم");
      return;
    }
    toast.success(next ? "تم تفعيل المستخدم" : "تم تعطيل المستخدم");
    setItems((prev) =>
      prev
        ? prev.map((x) =>
            x.profile.id === u.profile.id
              ? { ...x, profile: { ...x.profile, is_active: next } }
              : x,
          )
        : prev,
    );
  };

  const setPrimaryRole = async (u: UserListItem, newRole: AppRole) => {
    if (u.roles.some((r) => r.role === "super_admin")) {
      toast.error("لا يمكن تعديل دور مسؤول منصة من هنا.");
      return;
    }
    if (!u.profile.company_id && (newRole === "admin" || newRole === "vendor")) {
      toast.error("هذا المستخدم غير مرتبط بشركة. لا يمكن إعطاؤه دور admin/vendor.");
      return;
    }

    setBusyId(u.profile.id);

    // Remove existing non-super roles
    const removable = u.roles.filter((r) => r.role !== "super_admin").map((r) => r.id);
    if (removable.length > 0) {
      const del = await supabase.from("user_roles").delete().in("id", removable);
      if (del.error) {
        setBusyId(null);
        toast.error("تعذّر تحديث الدور");
        return;
      }
    }

    const ins = await supabase.from("user_roles").insert({
      user_id: u.profile.id,
      role: newRole,
      company_id: newRole === "client" ? null : u.profile.company_id,
    });
    setBusyId(null);

    if (ins.error) {
      const { handleLimitError } = await import("@/lib/limitErrors");
      if (handleLimitError(ins.error, "مستخدم")) return;
      toast.error("تعذّر إعطاء الدور الجديد");
      return;
    }
    toast.success(`تم تعيين الدور: ${ROLE_LABEL[newRole]}`);
    await load();
  };

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">المستخدمون</h1>
          <p className="text-sm text-muted-foreground mt-1">
            عرض وإدارة جميع مستخدمي المنصة عبر الشركات.
          </p>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        <MiniCount label="الإجمالي" value={items === null ? null : counts.all} />
        <MiniCount label="مسؤولو المنصة" value={items === null ? null : counts.super_admin} tone="destructive" />
        <MiniCount label="مسؤولو شركات" value={items === null ? null : counts.admin} tone="primary" />
        <MiniCount label="بائعون" value={items === null ? null : counts.vendor} tone="success" />
        <MiniCount label="عملاء" value={items === null ? null : counts.client} />
        <MiniCount label="معطّلون" value={items === null ? null : counts.inactive} tone="muted" />
      </div>

      {/* Toolbar */}
      <Card className="p-3 shadow-soft">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ابحث بالاسم أو الهاتف أو المدينة…"
              className="pr-9"
            />
          </div>
          <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as typeof roleFilter)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="كل الأدوار" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الأدوار</SelectItem>
              <SelectItem value="super_admin">مسؤول المنصة</SelectItem>
              <SelectItem value="admin">مسؤول شركة</SelectItem>
              <SelectItem value="vendor">بائع</SelectItem>
              <SelectItem value="client">عميل</SelectItem>
            </SelectContent>
          </Select>
          <Select value={companyFilter} onValueChange={setCompanyFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="كل الشركات" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الشركات</SelectItem>
              <SelectItem value="_none">بدون شركة</SelectItem>
              {Array.from(companies.values())
                .sort((a, b) => (a.display_name || a.name).localeCompare(b.display_name || b.name))
                .map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.display_name || c.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* List */}
      {items === null ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Card key={i} className="p-4">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          <UsersIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
          لا يوجد مستخدمون يطابقون البحث.
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((u) => {
            const isSuper = u.roles.some((r) => r.role === "super_admin");
            const primaryRole: AppRole | undefined =
              (["super_admin", "admin", "vendor", "client"] as AppRole[]).find((r) =>
                u.roles.some((x) => x.role === r),
              ) ?? u.roles[0]?.role;

            return (
              <Card
                key={u.profile.id}
                className={cn(
                  "p-4 shadow-soft hover:shadow-elegant transition-shadow",
                  !u.profile.is_active && "opacity-60",
                )}
              >
                <div className="flex flex-wrap items-start gap-3">
                  <div className="h-10 w-10 rounded-full shrink-0 bg-primary/10 text-primary flex items-center justify-center font-bold">
                    {(u.profile.full_name || "?").charAt(0).toUpperCase()}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold truncate">
                        {u.profile.full_name || "بدون اسم"}
                      </p>
                      {primaryRole && (
                        <Badge variant="outline" className={cn("text-[10px] h-5", ROLE_TONE[primaryRole])}>
                          {ROLE_LABEL[primaryRole]}
                        </Badge>
                      )}
                      {!u.profile.is_active && (
                        <Badge variant="outline" className="text-[10px] h-5 border-destructive/40 text-destructive bg-destructive/5">
                          معطّل
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                      {u.company && (
                        <span className="inline-flex items-center gap-1">
                          <Building2 className="h-3 w-3" />
                          {u.company.display_name || u.company.name}
                        </span>
                      )}
                      {u.profile.phone && <span dir="ltr">{u.profile.phone}</span>}
                      {u.profile.city && <span>{u.profile.city}</span>}
                      <span>
                        انضم {new Date(u.profile.created_at).toLocaleDateString("ar-MA")}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {!isSuper && (
                      <Select
                        value={primaryRole ?? ""}
                        onValueChange={(v) => setPrimaryRole(u, v as AppRole)}
                        disabled={busyId === u.profile.id}
                      >
                        <SelectTrigger className="h-8 w-[140px] text-xs">
                          <SelectValue placeholder="اختر الدور" />
                        </SelectTrigger>
                        <SelectContent>
                          {ASSIGNABLE_ROLES.map((r) => (
                            <SelectItem key={r} value={r} className="text-xs">
                              {ROLE_LABEL[r]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {isSuper && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                        <UserCog className="h-3 w-3" />
                        محمي
                      </span>
                    )}
                    <Button
                      size="sm"
                      variant={u.profile.is_active ? "outline" : "default"}
                      className="h-8 text-xs"
                      disabled={busyId === u.profile.id || isSuper}
                      onClick={() => setConfirmAction({ user: u, next: !u.profile.is_active })}
                      title={isSuper ? "لا يمكن تعطيل مسؤول منصة من هنا" : undefined}
                    >
                      {busyId === u.profile.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : u.profile.is_active ? (
                        <>
                          <ShieldOff className="h-3 w-3 ml-1" />
                          تعطيل
                        </>
                      ) : (
                        <>
                          <Shield className="h-3 w-3 ml-1" />
                          تفعيل
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <AlertDialog
        open={!!confirmAction}
        onOpenChange={(o) => !o && setConfirmAction(null)}
      >
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.next ? "تفعيل المستخدم" : "تعطيل المستخدم"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.next
                ? `سيتمكن "${confirmAction.user.profile.full_name || "هذا المستخدم"}" من استخدام المنصة من جديد.`
                : `لن يتمكن "${confirmAction?.user.profile.full_name || "هذا المستخدم"}" من الوصول إلى لوحة الشركة بعد التعطيل.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmAction) toggleActive(confirmAction.user, confirmAction.next);
                setConfirmAction(null);
              }}
            >
              تأكيد
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function MiniCount({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number | null;
  tone?: "default" | "primary" | "success" | "destructive" | "muted";
}) {
  const toneMap = {
    default: "text-foreground",
    primary: "text-primary",
    success: "text-success",
    destructive: "text-destructive",
    muted: "text-muted-foreground",
  };
  return (
    <Card className="p-3 shadow-soft">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      {value === null ? (
        <Skeleton className="mt-1 h-6 w-12" />
      ) : (
        <p className={cn("mt-1 text-lg font-bold", toneMap[tone])}>{value}</p>
      )}
    </Card>
  );
}
