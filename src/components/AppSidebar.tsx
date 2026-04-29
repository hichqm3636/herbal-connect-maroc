import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  ShoppingBag,
  ClipboardList,
  Users,
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

// ----- Client (buyer) menu — marketplace shopper -----
const clientTopItems: NavItem[] = [
  { title: "البائعون", url: "/vendors", icon: ShoppingBag },
  { title: "طلباتي", url: "/orders", icon: ClipboardList },
];

const clientAccountItems: NavItem[] = [
  { title: "الإعدادات", url: "/settings", icon: Settings },
];

// ----- Vendor / Company Admin (Workspace Mode) -----
const vendorTop: NavItem[] = [
  { title: "لوحة التحكم", url: "/admin", icon: LayoutDashboard },
];

const vendorSections: NavSection[] = [
  {
    id: "sales",
    label: "المبيعات",
    icon: ShoppingCart,
    items: [
      { title: "الطلبات", url: "/admin/orders", icon: ClipboardList },
      { title: "الفواتير", url: "/admin/invoices", icon: Receipt },
    ],
  },
  {
    id: "catalog",
    label: "الكتالوج",
    icon: Package,
    items: [
      { title: "المنتجات", url: "/admin/products", icon: Package },
    ],
  },
  {
    id: "analytics",
    label: "التحليلات",
    icon: BarChart3,
    items: [
      { title: "التقارير", url: "/admin/analytics", icon: BarChart3 },
      { title: "سجل النشاط", url: "/admin/activity", icon: Activity },
    ],
  },
  {
    id: "settings",
    label: "الإعدادات",
    icon: Cog,
    items: [
      { title: "إعدادات المتجر", url: "/admin/branding", icon: Settings },
      { title: "الفريق والصلاحيات", url: "/admin/team", icon: UsersRound },
      { title: "فحص صحة الوسائط", url: "/admin/storage-health", icon: Activity },
    ],
  },
];

// Legacy alias kept for the renderer logic below
const companyAdminTop = vendorTop;
const companyAdminSections = vendorSections;

// ----- Super Admin (Platform Mode) -----
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
    ],
  },
];

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAdmin, isSuperAdmin, roles, signOut, user, company, mode, canAccessDistributorFeatures } = useAuth();
  const isPlatform = mode === "platform";
  const isPlatformOwner = isPlatform || (isSuperAdmin && !roles.includes("admin"));
  const isCompanyAdmin = isAdmin && !isPlatformOwner;
  const isDistributor = !isAdmin && !isPlatformOwner;
  const { isMobile, setOpenMobile, state } = useSidebar();
  const collapsed = state === "collapsed";

  const isActive = (path: string) => {
    if (path === "/super-admin") return location.pathname === "/super-admin";
    if (path === "/admin") return location.pathname === "/admin";
    return location.pathname === path || location.pathname.startsWith(path + "/");
  };

  // Pick the active sections list for the current role
  const activeSections: NavSection[] = isPlatformOwner
    ? superAdminSections
    : isCompanyAdmin
      ? companyAdminSections
      : [];

  // Track which collapsible groups are open. A group auto-opens when one of
  // its children is the active route.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const s of activeSections) {
      initial[s.id] = s.items.some((i) => isActive(i.url));
    }
    return initial;
  });

  // Re-open the group containing the active route on navigation.
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

    // When the sidebar is collapsed (icon-only), render flat items so tooltips
    // still work and the chevron UI doesn't get cut off.
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

  return (
    <Sidebar id="app-sidebar" collapsible="icon" side="right">
      <SidebarHeader className="border-b">
        <div className="flex items-center gap-2 px-2 py-3">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-glow overflow-hidden text-primary-foreground"
            style={!isPlatform && company?.brand_color ? { backgroundColor: company.brand_color } : undefined}
          >
            {isPlatform ? (
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
              {isPlatform
                ? PLATFORM_NAME
                : (company?.display_name || company?.name || TENANT_FALLBACK_NAME)}
            </span>
            <span className="text-xs text-muted-foreground truncate flex items-center gap-1">
              {isPlatform ? (
                <>
                  <Globe2 className="h-3 w-3" /> {PLATFORM_SUBTITLE}
                </>
              ) : isCompanyAdmin ? (
                <>
                  <Briefcase className="h-3 w-3" /> مساحة عمل الشركة
                </>
              ) : (
                "منصة إدارة الموزعين"
              )}
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {/* Client (marketplace shopper) — flat menu */}
        {isDistributor && renderTopItems(clientTopItems)}
        {isDistributor && renderTopItems(clientAccountItems)}

        {/* Company Admin — Dashboard + grouped sections */}
        {isCompanyAdmin && (
          <>
            {renderTopItems(companyAdminTop)}
            {companyAdminSections.map(renderSection)}
          </>
        )}

        {/* Super Admin — Dashboard + grouped sections (Platform group only here) */}
        {isPlatformOwner && (
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
