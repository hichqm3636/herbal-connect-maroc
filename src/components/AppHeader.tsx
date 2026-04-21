import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { CartButton } from "@/components/CartSheet";
import { useAuth } from "@/hooks/useAuth";

export function AppHeader() {
  const { company } = useAuth();
  const name = company?.display_name || company?.name || "DistribHub";
  const logo = company?.logo_url;
  const initial = name.charAt(0).toUpperCase();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/95 backdrop-blur px-4">
      <SidebarTrigger className="text-foreground hover:text-primary shrink-0" />
      <Separator orientation="vertical" className="h-6" />
      <div className="flex items-center gap-3 min-w-0">
        {logo ? (
          <img
            src={logo}
            alt={name}
            className="h-9 w-9 rounded-full object-cover ring-1 ring-border shrink-0"
          />
        ) : (
          <div
            className="h-9 w-9 rounded-full flex items-center justify-center text-sm font-bold text-primary-foreground shrink-0 shadow-sm"
            style={{ background: "var(--company-brand, var(--primary))" }}
            aria-hidden="true"
          >
            {initial}
          </div>
        )}
        <div className="flex flex-col leading-tight min-w-0">
          <span className="text-sm font-bold truncate">{name}</span>
          <span className="text-[11px] text-muted-foreground truncate">
            بوابة الموزعين
          </span>
        </div>
      </div>
      <div className="ms-auto">
        <CartButton />
      </div>
    </header>
  );
}
