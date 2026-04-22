import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { CartButton } from "@/components/CartSheet";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "@tanstack/react-router";
import { useHeaderPreview } from "@/hooks/useHeaderPreview";

export function AppHeader() {
  const { company } = useAuth();
  const { open, openMobile, isMobile } = useSidebar();
  const location = useLocation();
  const [previewMode] = useHeaderPreview();
  const isOpen = isMobile ? openMobile : open;

  // Platform routes (Super Admin / platform admin) always show Nexora branding,
  // never the tenant company name. The settings preview toggle can override this.
  const path = location.pathname;
  const routeIsPlatform =
    path === "/super-admin" ||
    path.startsWith("/super-admin/") ||
    path === "/admin" ||
    path.startsWith("/admin/");
  const isPlatformRoute =
    previewMode === "platform"
      ? true
      : previewMode === "tenant"
        ? false
        : routeIsPlatform;

  const tenantName = company?.display_name || company?.name || "DistribHub";
  const name = isPlatformRoute ? "Nexora" : tenantName;
  const logo = isPlatformRoute ? null : company?.logo_url;
  const subtitle = isPlatformRoute ? "منصة Nexora" : "بوابة الموزعين";
  const initial = name.charAt(0).toUpperCase();
  const sidebarLabel = isOpen
    ? "إغلاق الشريط الجانبي"
    : "فتح الشريط الجانبي";

  return (
    <header
      role="banner"
      aria-label="ترويسة التطبيق"
      className="sticky top-0 z-30 flex h-16 w-full items-center gap-2 sm:gap-3 overflow-hidden border-b bg-background/95 backdrop-blur ps-3 pe-3 sm:ps-4 sm:pe-4"
    >
      <SidebarTrigger
        className="text-foreground hover:text-primary shrink-0"
        aria-label={sidebarLabel}
        aria-expanded={isOpen}
        aria-controls="app-sidebar"
        title={sidebarLabel}
      />
      <Separator
        orientation="vertical"
        className="h-6 hidden sm:block"
        aria-hidden="true"
      />
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
        {logo ? (
          <img
            src={logo}
            alt={`شعار ${name}`}
            className="h-8 w-8 sm:h-9 sm:w-9 rounded-full object-cover ring-1 ring-border shrink-0"
          />
        ) : (
          <div
            role="img"
            aria-label={`شعار ${name}`}
            className="h-8 w-8 sm:h-9 sm:w-9 rounded-full flex items-center justify-center text-xs sm:text-sm font-bold text-primary-foreground shrink-0 shadow-sm"
            style={{ background: "var(--company-brand, var(--primary))" }}
          >
            <span aria-hidden="true">{initial}</span>
          </div>
        )}
        <div className="flex flex-col leading-tight min-w-0">
          <span className="text-xs sm:text-sm font-bold truncate">{name}</span>
          <span className="text-[10px] sm:text-[11px] text-muted-foreground truncate">
            {subtitle}
          </span>
        </div>
      </div>
      <div className="ms-auto ps-2 shrink-0">
        <CartButton />
      </div>
    </header>
  );
}
