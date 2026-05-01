import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  ShoppingBag,
  ClipboardList,
  Activity,
  LogOut,
  Leaf,
  Settings,
  Building2,
  UsersRound,
  Receipt,
  ChevronDown,
  Globe2,
  ShoppingCart,
  Package,
  BarChart3,
  Cog,
  Briefcase,
  ShieldCheck,
  Heart,
  MessageSquare,
  User as UserIcon,
  TrendingUp,
  FlaskConical,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useAuth } from "@/hooks/useAuth";
import { PLATFORM_NAME, PLATFORM_SUBTITLE, TENANT_FALLBACK_NAME } from "@/lib/platform";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import type { LucideIcon } from "lucide-react";

type NavItem = { title: string; url: string; icon: LucideIcon };
type NavSection = {
  id: string;
  label: string;
  icon: LucideIcon;
  items: NavItem[];
};

// ---------------- Client (marketplace shopper) ----------------
const clientTopItems: NavItem[] = [
  { title: "حسابي", url: "/client", icon: LayoutDashboard },
  { title: "البائعون", url: "/vendors", icon: ShoppingBag },
  { title: "طلباتي", url: "/client/orders", icon: ClipboardList },
  { title: "المفضلة", url: "/wishlist", icon: Heart },
  { title: "مراجعاتي", url: "/my-reviews", icon: MessageSquare },
];
const clientAccountItems: NavItem[] = [
  { title: "ملفي الشخصي", url: "/profile", icon: UserIcon },
  { title: "الإعدادات", url: "/settings", icon: Settings },
];

// ---------------- Vendor (workspace owner) — lives at /vendor/* ----------------
const vendorTop: NavItem[] = [
  { title: "لوحة التحكم", url: "/vendor", icon: LayoutDashboard },
];

const vendorSections: NavSection[] = [
  {
    id: "sales",
    label: "المبيعات",
    icon: ShoppingCart,
    items: [
      { title: "الطلبات", url: "/vendor/orders", icon: ClipboardList },
      { title: "الفواتير", url: "/vendor/invoices", icon: Receipt },
      { title: "المراجعات", url: "/vendor/reviews", icon: MessageSquare },
    ],
  },
  {
    id: "catalog",
    label: "الكتالوج",
    icon: Package,
    items: [{ title: "المنتجات", url: "/vendor/products", icon: Package }],
  },
  {
    id: "analytics",
    label: "التحليلات",
    icon: BarChart3,
    items: [
      { title: "التقارير", url: "/vendor/analytics", icon: BarChart3 },
      { title: "سجل النشاط", url: "/vendor/activity", icon: Activity },
    ],
  },
  {
    id: "settings",
    label: "الإعدادات",
    icon: Cog,
    items: [
      { title: "إعدادات المتجر", url: "/vendor/branding", icon: Settings },
      { title: "الفريق والصلاحيات", url: "/vendor/team", icon: UsersRound },
      { title: "فحص صحة الوسائط", url: "/vendor/storage-health", icon: Activity },
    ],
  },
];

// ---------------- Platform Admin — lives at /admin/* ----------------
const adminTop: NavItem[] = [
  { title: "لوحة الإدارة", url: "/admin", icon: ShieldCheck },
];

const adminSections: NavSection[] = [
  {
    id: "platform-admin",
    label: "الإدارة",
    icon: Globe2,
    items: [
      { title: "الشركات", url: "/admin/companies", icon: Building2 },
    ],
  },
];

// ---------------- Super Admin — lives at /super-admin/* ----------------
const superAdminTop: NavItem[] = [
  { title: "لوحة المنصة", url: "/super-admin", icon: LayoutDashboard },
];

const superAdminSections: NavSection[] = [
  {
    id: "platform",
    label: "المنصة",
    icon: Globe2,
    items: [
      { title: "الشركات", url: "/super-admin/companies", icon: Building2 },
      { title: "نمو العملاء", url: "/super-admin/growth", icon: TrendingUp },
      { title: "تجارب A/B", url: "/super-admin/ab-tests", icon: FlaskConical },
    ],
  },
];

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { marketplaceRole, signOut, user, company, mode } = useAuth();
  const isPlatform = mode === "platform";

  const isClient = marketplaceRole === "client";
  const isVendor = marketplaceRole === "vendor";
  const isAdmin = marketplaceRole === "admin";
  const isSuperAdmin = marketplaceRole === "super_admin";

  const { isMobile, setOpenMobile, state } = useSidebar();
  const collapsed = state === "collapsed";

  const isActive = (path: string) => {
    if (path === "/super-admin") return location.pathname === "/super-admin";
    if (path === "/admin") return location.pathname === "/admin";
    if (path === "/vendor") return location.pathname === "/vendor";
    return location.pathname === path || location.pathname.startsWith(path + "/");
  };

  // Pick exactly one menu based on the canonical marketplace role.
  // Priority is enforced by useAuth (super_admin > admin > vendor > client),
  // so these branches are mutually exclusive.
  const activeSections: NavSection[] = isSuperAdmin
    ? superAdminSections
    : isAdmin
      ? adminSections
      : isVendor
        ? vendorSections
        : [];

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const s of activeSections) {
      initial[s.id] = s.items.some((i) => isActive(i.url));
    }
    return initial;
  });

  useEffect(() => {
    setOpenGroups((prev) => {
      const next = { ...prev };
      for (const s of activeSections) {
        if (s.items.some((i) => isActive(i.url))) next[s.id] = true;
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const handleNavClick = () => {
    if (isMobile) setOpenMobile(false);
  };

  const handleSignOut = async () => {
    if (isMobile) setOpenMobile(false);
    await signOut();
    navigate({ to: "/login" });
  };

  const renderTopItems = (items: NavItem[]) => (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.url}>
              <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                <Link to={item.url} onClick={handleNavClick}>
                  <item.icon className="h-4 w-4" />
                  <span>{item.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );

  const renderSection = (section: NavSection) => {
    const sectionActive = section.items.some((i) => isActive(i.url));
    const open = openGroups[section.id] ?? sectionActive;

    if (collapsed) {
      return (
        <SidebarGroup key={section.id}>
          <SidebarGroupContent>
            <SidebarMenu>
              {section.items.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.url)}
                    tooltip={item.title}
                  >
                    <Link to={item.url} onClick={handleNavClick}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      );
    }

    return (
      <Collapsible
        key={section.id}
        open={open}
        onOpenChange={(o) => setOpenGroups((p) => ({ ...p, [section.id]: o }))}
        className="group/collapsible"
      >
        <SidebarGroup>
          <SidebarGroupLabel asChild>
            <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors">
              <span className="flex items-center gap-2">
                <section.icon className="h-3.5 w-3.5" />
                {section.label}
              </span>
              <ChevronDown className="h-3.5 w-3.5 transition-transform duration-200 group-data-[state=closed]/collapsible:-rotate-90" />
            </CollapsibleTrigger>
          </SidebarGroupLabel>
          <CollapsibleContent>
            <SidebarGroupContent>
              <SidebarMenuSub>
                {section.items.map((item) => (
                  <SidebarMenuSubItem key={item.url}>
                    <SidebarMenuSubButton asChild isActive={isActive(item.url)}>
                      <Link to={item.url} onClick={handleNavClick}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                ))}
              </SidebarMenuSub>
            </SidebarGroupContent>
          </CollapsibleContent>
        </SidebarGroup>
      </Collapsible>
    );
  };

  const headerSubtitle = isSuperAdmin
    ? PLATFORM_SUBTITLE
    : isAdmin
      ? "إدارة المنصة"
      : isVendor
        ? "مساحة عمل البائع"
        : isClient
          ? "حساب عميل"
          : "";

  // Treat only platform admins as platform chrome; company admins use vendor chrome.
  const showPlatformChrome = isPlatform || isSuperAdmin || isAdmin;

  return (
    <Sidebar id="app-sidebar" collapsible="icon" side="right">
      <SidebarHeader className="border-b">
        <div className="flex items-center gap-2 px-2 py-3">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-glow overflow-hidden text-primary-foreground"
            style={!showPlatformChrome && company?.brand_color ? { backgroundColor: company.brand_color } : undefined}
          >
            {showPlatformChrome ? (
              <div className="flex h-full w-full items-center justify-center bg-gradient-primary">
                <Globe2 className="h-5 w-5" />
              </div>
            ) : company?.logo_url ? (
              <img src={company.logo_url} alt="logo" className="h-full w-full object-cover" />
            ) : company?.brand_color ? (
              <span className="text-sm font-bold">
                {(company.display_name || company.name || "C")[0].toUpperCase()}
              </span>
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-primary">
                <Leaf className="h-5 w-5" />
              </div>
            )}
          </div>
          <div className="flex flex-col group-data-[collapsible=icon]:hidden min-w-0">
            <span className="text-sm font-bold leading-tight truncate">
              {showPlatformChrome
                ? PLATFORM_NAME
                : (company?.display_name || company?.name || TENANT_FALLBACK_NAME)}
            </span>
            <span className="text-xs text-muted-foreground truncate flex items-center gap-1">
              {isSuperAdmin || isAdmin ? (
                <>
                  <Globe2 className="h-3 w-3" /> {headerSubtitle}
                </>
              ) : isVendor ? (
                <>
                  <Briefcase className="h-3 w-3" /> {headerSubtitle}
                </>
              ) : (
                headerSubtitle
              )}
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {/* Render exactly ONE menu based on the single canonical role. */}
        {isClient && (
          <>
            {renderTopItems(clientTopItems)}
            {renderTopItems(clientAccountItems)}
          </>
        )}

        {isVendor && (
          <>
            {renderTopItems(vendorTop)}
            {vendorSections.map(renderSection)}
          </>
        )}

        {isAdmin && (
          <>
            {renderTopItems(adminTop)}
            {adminSections.map(renderSection)}
          </>
        )}

        {isSuperAdmin && (
          <>
            {renderTopItems(superAdminTop)}
            {superAdminSections.map(renderSection)}
          </>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t">
        <div className="flex items-center gap-2 px-2 py-2 group-data-[collapsible=icon]:hidden">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-accent-foreground text-xs font-semibold">
            {user?.email?.[0]?.toUpperCase() ?? "U"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium">{user?.email}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleSignOut}
          className="w-full justify-start gap-2"
        >
          <LogOut className="h-4 w-4" />
          <span className="group-data-[collapsible=icon]:hidden">تسجيل الخروج</span>
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
