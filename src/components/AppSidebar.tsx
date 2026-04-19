import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  ShoppingBag,
  ClipboardList,
  Award,
  ShieldCheck,
  Boxes,
  Users,
  Activity,
  MapPin,
  LogOut,
  Leaf,
  Settings,
  Zap,
  Palette,
  Building2,
  Tag,
  BarChart3,
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
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

const distributorItems = [
  { title: "لوحة التحكم", url: "/dashboard", icon: LayoutDashboard },
  { title: "المنتجات", url: "/products", icon: ShoppingBag },
  { title: "طلب سريع", url: "/quick-order", icon: Zap },
  { title: "طلباتي", url: "/orders", icon: ClipboardList },
  { title: "نقاط الولاء", url: "/loyalty", icon: Award },
  { title: "الإعدادات", url: "/settings", icon: Settings },
];

const adminItems = [
  { title: "لوحة الإدارة", url: "/admin", icon: ShieldCheck },
  { title: "إدارة المنتجات", url: "/admin/products", icon: Boxes },
  { title: "إدارة الموزعين", url: "/admin/distributors", icon: Users },
  { title: "فئات التسعير", url: "/admin/pricing-tiers", icon: Tag },
  { title: "إدارة المناطق", url: "/admin/territories", icon: MapPin },
  { title: "إدارة الطلبات", url: "/admin/orders", icon: ClipboardList },
  { title: "ذكاء السوق", url: "/admin/analytics", icon: BarChart3 },
  { title: "هوية الشركة", url: "/admin/branding", icon: Palette },
  { title: "سجل النشاط", url: "/admin/activity", icon: Activity },
];

const superAdminItems = [
  { title: "الشركات", url: "/super-admin/companies", icon: Building2 },
];

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAdmin, isSuperAdmin, roles, signOut, user, company } = useAuth();
  // Platform Owner = super_admin only (not also admin of a company)
  const isPlatformOwner = isSuperAdmin && !roles.includes("admin");
  // Company Admin = admin role (super_admin operating inside a company also acts as admin here)
  const isCompanyAdmin = isAdmin && !isPlatformOwner;
  // Distributor menu only for actual distributors (not admins, not platform owner)
  const isDistributor = !isAdmin && !isPlatformOwner;
  const { isMobile, setOpenMobile } = useSidebar();
  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + "/");

  const handleNavClick = () => {
    if (isMobile) setOpenMobile(false);
  };

  const handleSignOut = async () => {
    if (isMobile) setOpenMobile(false);
    await signOut();
    navigate({ to: "/login" });
  };

  return (
    <Sidebar collapsible="icon" side="right">
      <SidebarHeader className="border-b">
        <div className="flex items-center gap-2 px-2 py-3">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-glow overflow-hidden text-primary-foreground"
            style={company?.brand_color ? { backgroundColor: company.brand_color } : undefined}
          >
            {company?.logo_url ? (
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
              {company?.display_name || company?.name || "Partner Hub"}
            </span>
            <span className="text-xs text-muted-foreground truncate">منصة إدارة الموزعين والطلبات</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>الموزع</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {distributorItems.map((item) => (
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

        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>الإدارة</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminItems.map((item) => (
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
        )}

        {isSuperAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>المدير الأعلى</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {superAdminItems.map((item) => (
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
