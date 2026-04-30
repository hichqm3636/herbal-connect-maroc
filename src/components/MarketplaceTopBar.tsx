import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { ShoppingBag, ClipboardList, User, LogOut, Menu, Leaf, Heart, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CartButton } from "@/components/CartSheet";
import { NotificationsBell } from "@/components/NotificationsBell";
import { useAuth } from "@/hooks/useAuth";
import { PLATFORM_NAME } from "@/lib/platform";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const NAV = [
  { to: "/vendors", label: "البائعون", icon: ShoppingBag },
  { to: "/orders", label: "طلباتي", icon: ClipboardList },
  { to: "/wishlist", label: "المفضلة", icon: Heart },
  { to: "/my-reviews", label: "مراجعاتي", icon: MessageSquare },
] as const;

/**
 * Marketplace top-bar — used for the CLIENT surface only.
 * No sidebar. Pure top navigation. Mobile collapses to a Sheet menu.
 */
export function MarketplaceTopBar() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + "/");

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/login" });
  };

  const initial = (user?.email?.[0] ?? "U").toUpperCase();

  return (
    <header
      role="banner"
      className="sticky top-0 z-30 w-full border-b bg-background/95 backdrop-blur"
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-3 sm:gap-4 sm:px-4">
        {/* Brand */}
        <Link
          to="/vendors"
          className="flex items-center gap-2 shrink-0"
          aria-label={PLATFORM_NAME}
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-primary text-primary-foreground shadow-glow">
            <Leaf className="h-5 w-5" />
          </div>
          <span className="hidden text-sm font-extrabold sm:inline">
            {PLATFORM_NAME}
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-1 ms-4 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive(item.to)
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              }`}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Right cluster */}
        <div className="ms-auto flex items-center gap-1 sm:gap-2">
          <NotificationsBell />
          <CartButton />

          {/* Account — desktop dropdown */}
          <div className="hidden md:block">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="حسابي">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
                    {initial}
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">
                  {user?.email}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/profile" className="flex items-center gap-2">
                    <User className="h-4 w-4" />
                    ملفي الشخصي
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/settings" className="flex items-center gap-2">
                    <User className="h-4 w-4" />
                    الإعدادات
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} className="gap-2 text-destructive focus:text-destructive">
                  <LogOut className="h-4 w-4" />
                  تسجيل الخروج
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Mobile menu */}
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="القائمة">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <SheetHeader>
                <SheetTitle className="text-right">القائمة</SheetTitle>
              </SheetHeader>
              <div className="mt-6 flex flex-col gap-1">
                {NAV.map((item) => (
                  <SheetClose asChild key={item.to}>
                    <Link
                      to={item.to}
                      className={`flex items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium ${
                        isActive(item.to)
                          ? "bg-accent text-foreground"
                          : "text-muted-foreground hover:bg-accent/50"
                      }`}
                    >
                      <item.icon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  </SheetClose>
                ))}
                <SheetClose asChild>
                  <Link
                    to="/settings"
                    className="flex items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent/50"
                  >
                    <User className="h-4 w-4" />
                    حسابي
                  </Link>
                </SheetClose>
              </div>
              <div className="mt-6 border-t pt-4">
                <p className="px-3 pb-2 text-xs text-muted-foreground truncate">
                  {user?.email}
                </p>
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-2 text-destructive hover:text-destructive"
                  onClick={handleSignOut}
                >
                  <LogOut className="h-4 w-4" />
                  تسجيل الخروج
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
