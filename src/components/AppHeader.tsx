import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { CartButton } from "@/components/CartSheet";
import { TenantSwitcher } from "@/components/TenantSwitcher";
import { NotificationsBell } from "@/components/NotificationsBell";
import { useAuth } from "@/hooks/useAuth";
import { PLATFORM_NAME, PLATFORM_SUBTITLE, TENANT_FALLBACK_NAME } from "@/lib/platform";

export function AppHeader() {
  const { company, mode, isClient } = useAuth();
  const { open, openMobile, isMobile } = useSidebar();
  const isOpen = isMobile ? openMobile : open;

  // Single source of truth: auth.mode. In platform mode we IGNORE company
  // context entirely — no tenant name, no tenant logo, no tenant brand color
  // can leak into Nexora's chrome.
  const isPlatform = mode === "platform";

  const name = isPlatform
    ? PLATFORM_NAME
    : (company?.display_name || company?.name || TENANT_FALLBACK_NAME);
  const logo = isPlatform ? null : company?.logo_url ?? null;
  const subtitle = isPlatform ? PLATFORM_SUBTITLE : "بوابة الموزعين";
  const initial = name.charAt(0).toUpperCase();

  // Avoid binding the tenant brand variable in platform mode.
  const avatarStyle = isPlatform
    ? { background: "var(--primary)" }
    : { background: "var(--company-brand, var(--primary))" };

  const sidebarLabel = isOpen ? "إغلاق الشريط الجانبي" : "فتح الشريط الجانبي";

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
            style={avatarStyle}
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
      <div className="ms-auto ps-2 shrink-0 flex items-center gap-2">
        <TenantSwitcher />
        {!isPlatform && <NotificationsBell />}
        {!isPlatform && isClient && <CartButton />}
      </div>
    </header>
  );
}
