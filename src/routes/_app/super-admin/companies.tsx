import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

interface Company {
  id: string;
  name: string;
  display_name: string;
  slug: string;
  brand_color: string;
}

export const Route = createFileRoute("/_app/super-admin/companies")({
  component: CompaniesPage,
});

function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  useEffect(() => {
    supabase.from("companies").select("id, name, display_name, slug, brand_color").order("created_at", { ascending: false })
      .then(({ data }) => setCompanies((data ?? []) as Company[]));
  }, []);
  return (
    <div className="space-y-4" dir="rtl">
      <h1 className="text-2xl font-bold">الشركات</h1>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {companies.map((c) => (
          <Card key={c.id} className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg" style={{ backgroundColor: c.brand_color }} />
            <div className="min-w-0">
              <p className="font-bold truncate">{c.display_name || c.name}</p>
              <p className="text-xs text-muted-foreground truncate">/{c.slug}</p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
