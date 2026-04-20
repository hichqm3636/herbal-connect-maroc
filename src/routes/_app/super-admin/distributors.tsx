import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpDown,
  Building2,
  Loader2,
  MapPin,
  Search,
  ShieldCheck,
  ShieldOff,
  Users,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { formatMAD, formatDateAr } from "@/lib/format";

export const Route = createFileRoute("/_app/super-admin/distributors")({
  component: SuperAdminDistributors,
  head: () => ({ meta: [{ title: "موزّعو المنصة — لوحة المنصة" }] }),
});

interface CompanyLite {
  id: string;
  display_name: string | null;
  name: string;
}

interface TerritoryLite {
  id: string;
  name: string;
  company_id: string;
}

interface DistRow {
  id: string;
  full_name: string;
  phone: string | null;
  is_active: boolean;
  company_id: string | null;
  territory_id: string | null;
  totalOrders: number;
  totalRevenue: number;
  lastOrderAt: string | null;
}

type SortKey = "name" | "orders" | "revenue" | "last";

function SuperAdminDistributors() {
  const [companies, setCompanies] = useState<CompanyLite[]>([]);
  const [territories, setTerritories] = useState<TerritoryLite[]>([]);
  const [rows, setRows] = useState<DistRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState<string>("all");
  const [territoryFilter, setTerritoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [sortBy, setSortBy] = useState<SortKey>("revenue");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [
        { data: comps },
        { data: terrs },
        { data: profs },
        { data: ords },
      ] = await Promise.all([
        supabase.from("companies").select("id, display_name, name").order("display_name"),
        supabase.from("territories").select("id, name, company_id"),
        supabase
          .from("profiles")
          .select("id, full_name, phone, is_active, company_id, territory_id"),
        supabase.from("orders").select("distributor_id, status, total_mad, created_at"),
      ]);

      setCompanies((comps ?? []) as CompanyLite[]);
      setTerritories((terrs ?? []) as TerritoryLite[]);

      const aggMap = new Map<
        string,
        { orders: number; revenue: number; last: string | null }
      >();
      for (const o of ords ?? []) {
        if (o.status === "cancelled") continue;
        const cur = aggMap.get(o.distributor_id) ?? {
          orders: 0,
          revenue: 0,
          last: null as string | null,
        };
        cur.orders += 1;
        cur.revenue += Number(o.total_mad);
        if (!cur.last || new Date(o.created_at) > new Date(cur.last)) {
          cur.last = o.created_at;
        }
        aggMap.set(o.distributor_id, cur);
      }

      const out: DistRow[] = (profs ?? []).map((p) => {
        const a = aggMap.get(p.id);
        return {
          id: p.id,
          full_name: p.full_name ?? "",
          phone: p.phone,
          is_active: p.is_active,
          company_id: p.company_id,
          territory_id: p.territory_id,
          totalOrders: a?.orders ?? 0,
          totalRevenue: a?.revenue ?? 0,
          lastOrderAt: a?.last ?? null,
        };
      });
      setRows(out);
      setLoading(false);
    })();
  }, []);

  const companyById = useMemo(() => {
    const m = new Map<string, CompanyLite>();
    companies.forEach((c) => m.set(c.id, c));
    return m;
  }, [companies]);

  const territoryById = useMemo(() => {
    const m = new Map<string, TerritoryLite>();
    territories.forEach((t) => m.set(t.id, t));
    return m;
  }, [territories]);

  const territoriesForFilter = useMemo(() => {
    if (companyFilter === "all") return territories;
    return territories.filter((t) => t.company_id === companyFilter);
  }, [territories, companyFilter]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = rows.filter((r) => {
      if (q && !(r.full_name.toLowerCase().includes(q) || (r.phone ?? "").includes(q))) {
        return false;
      }
      if (companyFilter !== "all" && r.company_id !== companyFilter) return false;
      if (territoryFilter !== "all" && r.territory_id !== territoryFilter) return false;
      if (statusFilter === "active" && !r.is_active) return false;
      if (statusFilter === "inactive" && r.is_active) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      switch (sortBy) {
        case "orders":
          return b.totalOrders - a.totalOrders;
        case "revenue":
          return b.totalRevenue - a.totalRevenue;
        case "last":
          return (
            new Date(b.lastOrderAt ?? 0).getTime() -
            new Date(a.lastOrderAt ?? 0).getTime()
          );
        default:
          return a.full_name.localeCompare(b.full_name, "ar");
      }
    });
    return list;
  }, [rows, search, companyFilter, territoryFilter, statusFilter, sortBy]);

  const summary = useMemo(() => {
    let active = 0;
    let inactive = 0;
    for (const r of rows) {
      if (r.is_active) active++;
      else inactive++;
    }
    return { total: rows.length, active, inactive };
  }, [rows]);

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">موزّعو المنصة</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {filtered.length} من {summary.total} موزع · مفعّلون {summary.active} · معطّلون{" "}
          {summary.inactive}
        </p>
      </div>

      {/* Filters */}
      <Card className="shadow-soft">
        <CardContent className="pt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="relative sm:col-span-2 lg:col-span-2">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث بالاسم أو الهاتف"
              className="pr-9"
            />
          </div>
          <Select value={companyFilter} onValueChange={(v) => { setCompanyFilter(v); setTerritoryFilter("all"); }}>
            <SelectTrigger>
              <SelectValue placeholder="الشركة" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الشركات</SelectItem>
              {companies.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.display_name || c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={territoryFilter} onValueChange={setTerritoryFilter}>
            <SelectTrigger>
              <SelectValue placeholder="المنطقة" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل المناطق</SelectItem>
              {territoriesForFilter.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={sortBy}
            onValueChange={(v) => setSortBy(v as SortKey)}
          >
            <SelectTrigger>
              <ArrowUpDown className="ml-2 h-3.5 w-3.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="revenue">ترتيب: الإيرادات</SelectItem>
              <SelectItem value="orders">ترتيب: عدد الطلبات</SelectItem>
              <SelectItem value="last">ترتيب: آخر طلب</SelectItem>
              <SelectItem value="name">ترتيب: الاسم</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Status pills */}
      <div className="flex flex-wrap gap-2">
        {(
          [
            { key: "all", label: "الكل", count: summary.total },
            { key: "active", label: "مفعّلون", count: summary.active },
            { key: "inactive", label: "معطّلون", count: summary.inactive },
          ] as const
        ).map((p) => (
          <Button
            key={p.key}
            type="button"
            size="sm"
            variant={statusFilter === p.key ? "default" : "outline"}
            onClick={() => setStatusFilter(p.key)}
            className="gap-1.5"
          >
            {p.label}
            <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
              {p.count}
            </Badge>
          </Button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center">
          <Users className="h-10 w-10 mx-auto text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground mt-3">لا يوجد موزّعون مطابقون.</p>
        </Card>
      ) : (
        <Card className="shadow-soft">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">القائمة</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {filtered.map((d) => {
                const c = d.company_id ? companyById.get(d.company_id) : null;
                const t = d.territory_id ? territoryById.get(d.territory_id) : null;
                return (
                  <Link
                    key={d.id}
                    to="/admin/distributors/$id"
                    params={{ id: d.id }}
                    className="flex flex-col gap-2 p-4 hover:bg-muted/40 transition sm:flex-row sm:items-center sm:gap-4"
                  >
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-accent-foreground font-semibold shrink-0">
                        {d.full_name?.[0] ?? "?"}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold truncate">{d.full_name || "—"}</p>
                          {d.is_active ? (
                            <Badge className="text-[10px] gap-1 bg-success/15 text-success-foreground border border-success/30 hover:bg-success/20">
                              <ShieldCheck className="h-3 w-3" />
                              مفعّل
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] gap-1">
                              <ShieldOff className="h-3 w-3" />
                              معطّل
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate" dir="ltr">
                          {d.phone || "—"}
                        </p>
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {c && (
                            <Badge variant="outline" className="text-[10px] gap-1 border-primary/30 text-primary">
                              <Building2 className="h-3 w-3" />
                              {c.display_name || c.name}
                            </Badge>
                          )}
                          {t && (
                            <Badge variant="outline" className="text-[10px] gap-1">
                              <MapPin className="h-3 w-3" />
                              {t.name}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3 sm:flex sm:items-center sm:gap-6 text-xs sm:text-sm">
                      <div className="text-center sm:text-right">
                        <p className="text-[10px] text-muted-foreground">الطلبات</p>
                        <p className="font-semibold">{d.totalOrders}</p>
                      </div>
                      <div className="text-center sm:text-right">
                        <p className="text-[10px] text-muted-foreground">الإيرادات</p>
                        <p className="font-semibold whitespace-nowrap">
                          {formatMAD(d.totalRevenue)}
                        </p>
                      </div>
                      <div className="text-center sm:text-right">
                        <p className="text-[10px] text-muted-foreground">آخر طلب</p>
                        <p className="font-medium whitespace-nowrap">
                          {d.lastOrderAt ? formatDateAr(d.lastOrderAt) : "—"}
                        </p>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
