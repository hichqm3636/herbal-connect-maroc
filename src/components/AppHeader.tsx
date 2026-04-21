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
    <header className="sticky top-0 z-30 flex h-16 w-full items-center gap-2 sm:gap-3 overflow-hidden border-b bg-background/95 backdrop-blur ps-3 pe-3 sm:ps-4 sm:pe-4">
      <SidebarTrigger className="text-foreground hover:text-primary shrink-0" />
      <Separator orientation="vertical" className="h-6 hidden sm:block" />
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
        {logo ? (
          <img
            src={logo}
            alt={name}
            className="h-8 w-8 sm:h-9 sm:w-9 rounded-full object-cover ring-1 ring-border shrink-0"
          />
        ) : (
          <div
            className="h-8 w-8 sm:h-9 sm:w-9 rounded-full flex items-center justify-center text-xs sm:text-sm font-bold text-primary-foreground shrink-0 shadow-sm"
            style={{ background: "var(--company-brand, var(--primary))" }}
            aria-hidden="true"
          >
            {initial}
          </div>
        )}
        <div className="flex flex-col leading-tight min-w-0">
          <span className="text-xs sm:text-sm font-bold truncate">{name}</span>
          <span className="text-[10px] sm:text-[11px] text-muted-foreground truncate">
            بوابة الموزعين
          </span>
        </div>
      </div>
      <div className="ms-auto ps-2 shrink-0">
        <CartButton />
      </div>
    </header>
  );
}
