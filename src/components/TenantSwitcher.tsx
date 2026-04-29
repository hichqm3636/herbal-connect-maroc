import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Building2, Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface CompanyRow {
  id: string;
  name: string;
  display_name: string;
  brand_color: string;
  logo_url: string | null;
}

/**
 * Header-level tenant switcher for super_admins.
 *
 * Visibility rules:
 *  - Only rendered for super_admin users.
 *  - HIDDEN entirely in platform mode (`/super-admin`, `/platform`, `/admin/*`)
 *    so super admins can never accidentally pick a tenant while operating
 *    Nexora's platform UI. To switch into a tenant they must navigate to
 *    `/super-admin/companies` deliberately.
 */
export function TenantSwitcher() {
  const { isSuperAdmin, mode, companyId, company, setActiveCompany } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<CompanyRow[] | null>(null);
  const [loading, setLoading] = useState(false);

  // Don't render at all unless super_admin AND in tenant mode.
  const shouldRender = isSuperAdmin && mode === "tenant";

  useEffect(() => {
    if (!open || rows !== null) return;
    let cancelled = false;
    setLoading(true);
    supabase
      .from("companies")
      .select("id, name, display_name, brand_color, logo_url")
      .order("display_name", { ascending: true })
      .then(({ data }) => {
        if (cancelled) return;
        setRows((data as CompanyRow[]) ?? []);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, rows]);

  if (!shouldRender) return null;

  const label = company?.display_name || company?.name || "اختر شركة";

  const pick = (id: string) => {
    setActiveCompany(id);
    setOpen(false);
    navigate({ to: "/super-admin" });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 max-w-[180px]"
          aria-label="تبديل الشركة"
        >
          <Building2 className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate text-xs">{label}</span>
          <ChevronsUpDown className="h-3 w-3 opacity-60 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0" dir="rtl">
        <div className="border-b px-3 py-2">
          <p className="text-xs font-semibold">تبديل الشركة</p>
          <p className="text-[10px] text-muted-foreground">
            اختر الشركة التي تريد إدارتها
          </p>
        </div>
        <div className="max-h-72 overflow-auto p-1">
          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : !rows || rows.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground py-6">
              لا توجد شركات.
            </p>
          ) : (
            rows.map((c) => {
              const active = c.id === companyId;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => pick(c.id)}
                  className={cn(
                    "w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-right hover:bg-accent transition-colors",
                    active && "bg-accent",
                  )}
                >
                  <div
                    className="h-6 w-6 rounded-md flex items-center justify-center text-[10px] font-bold text-white overflow-hidden shrink-0"
                    style={{ backgroundColor: c.brand_color }}
                  >
                    {c.logo_url ? (
                      <img src={c.logo_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      (c.display_name || c.name)[0]
                    )}
                  </div>
                  <span className="flex-1 text-xs truncate">
                    {c.display_name || c.name}
                  </span>
                  {active && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                </button>
              );
            })
          )}
        </div>
        <div className="border-t p-1">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              navigate({ to: "/super-admin/companies" });
            }}
            className="w-full text-right text-xs px-2 py-1.5 rounded-md hover:bg-accent text-muted-foreground"
          >
            إدارة كل الشركات…
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
