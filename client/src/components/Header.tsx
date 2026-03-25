import { FC, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ChevronRight, LayoutDashboard, LogOut, Menu, Sparkles, X } from "lucide-react";
import { Button } from "./Button";
import { ThemeToggle } from "./ThemeToggle";
import { User } from "../types";
import { productRoutePrefixes } from "./navigation";
import { StatusPill, cn } from "./ui";

interface HeaderProps {
  user: User | null;
  onLogout: () => void;
  onMenuToggle?: () => void;
}

export const Header: FC<HeaderProps> = ({ user, onLogout, onMenuToggle }) => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isDashboardView = productRoutePrefixes.some((routePrefix) => pathname.startsWith(routePrefix));
  const isSignupRoute = pathname === "/signup";
  const isLoginRoute = pathname === "/login";
  const activeProductLabel = useMemo(() => {
    if (pathname.startsWith("/dashboard")) return "Overview";
    if (pathname.startsWith("/course")) return "Learning Path";
    if (pathname.startsWith("/validator")) return "Validator";
    if (pathname.startsWith("/evaluation")) return "Evaluation Report";
    if (pathname.startsWith("/improvement")) return "Progress Analysis";
    if (pathname.startsWith("/account")) return "Account & Security";
    return "Workspace";
  }, [pathname]);

  const scrollToSection = (id: string) => {
    const doScroll = () => {
      const element = document.getElementById(id);
      if (element) {
        element.scrollIntoView({ behavior: "smooth" });
      }
    };

    if (pathname !== "/") {
      navigate("/");
      window.setTimeout(doScroll, 150);
    } else {
      doScroll();
    }

    setMobileMenuOpen(false);
  };

  return (
    <header className="fixed inset-x-0 top-0 z-[70] border-b border-border/80 bg-background/82 backdrop-blur-xl">
      <div className="page-shell flex h-16 items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {isDashboardView && user && (
            <button
              onClick={onMenuToggle}
              className="rounded-full border border-border bg-surface/80 p-2 text-muted-foreground transition-colors hover:text-contrast lg:hidden"
            >
              <Menu className="h-6 w-6" />
            </button>
          )}

          <button
            type="button"
            className="group flex items-center gap-3"
            onClick={() => navigate(user && isDashboardView ? "/dashboard" : "/")}
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-primary/15 bg-primary/10 text-primary shadow-soft">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="flex flex-col items-start">
              <span className="font-display text-[1.55rem] font-semibold leading-none text-contrast">
                Grow Wise
              </span>
            </div>
          </button>

          {isDashboardView && (
            <div className="hidden items-center gap-2 lg:flex">
              <div className="h-7 w-px bg-border" />
              <StatusPill tone="accent">
                <Sparkles className="h-3.5 w-3.5" />
                {activeProductLabel}
              </StatusPill>
            </div>
          )}
        </div>

        <div className="hidden items-center space-x-8 md:flex">
          {!isDashboardView && (
            <>
              <button
                onClick={() => scrollToSection("testimonials")}
                className="text-sm font-medium text-muted-foreground transition-colors hover:text-contrast"
              >
                Testimonials
              </button>
              <button
                onClick={() => scrollToSection("pricing")}
                className="text-sm font-medium text-muted-foreground transition-colors hover:text-contrast"
              >
                Pricing
              </button>
              <button
                onClick={() => navigate("/blog")}
                className="text-sm font-medium text-muted-foreground transition-colors hover:text-contrast"
              >
                Blog
              </button>
            </>
          )}
        </div>

        <div className="flex items-center gap-3">
          <ThemeToggle />

          {user ? (
            <div className="flex items-center gap-3">
              {!isDashboardView && (
                <Button size="sm" onClick={() => navigate("/dashboard")} className="hidden sm:inline-flex">
                  <LayoutDashboard className="h-4 w-4" />
                  Dashboard
                </Button>
              )}

              <div className="hidden items-center gap-3 rounded-full border border-border bg-surface/80 px-2.5 py-1.5 sm:flex">
                <div className="text-right hidden md:block">
                  <div className="text-sm font-medium text-contrast">{user.name}</div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    {user.isPro ? "Pro" : "Free"}
                  </div>
                </div>
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-contrast text-background font-bold">
                  {user.name?.[0] || "U"}
                </div>
              </div>

              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  void onLogout();
                }}
                className="!h-10 !w-10 !rounded-full !px-0"
                title="Log Out"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <>
              {!isLoginRoute && (
                <button
                  onClick={() => navigate("/login")}
                  className="hidden text-sm font-medium text-muted-foreground transition-colors hover:text-contrast sm:block"
                >
                  Login
                </button>
              )}
              <Button size="sm" onClick={() => navigate(isSignupRoute ? "/login" : "/signup")}>
                {isSignupRoute ? "Log In" : "Get Started"}
              </Button>
            </>
          )}

          {!isDashboardView && (
            <button
              className="rounded-full border border-border bg-surface/80 p-2 md:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          )}
        </div>
      </div>

      {!isDashboardView && mobileMenuOpen && (
        <div className="animate-fade-in border-t border-border bg-background/96 px-4 py-4 md:hidden">
          <div className="page-shell flex flex-col space-y-4">
            <button onClick={() => scrollToSection("testimonials")} className="text-left py-2 font-medium text-muted-foreground">
              Testimonials
            </button>
            <button onClick={() => scrollToSection("pricing")} className="text-left py-2 font-medium text-muted-foreground">
              Pricing
            </button>
            <button onClick={() => navigate("/blog")} className="text-left py-2 font-medium text-muted-foreground">
              Blog
            </button>
            {!user && (
              <button onClick={() => navigate("/login")} className="text-left py-2 font-medium text-muted-foreground">
                Login
              </button>
            )}
            <button
              onClick={() => setMobileMenuOpen(false)}
              className={cn("flex items-center gap-2 text-sm font-semibold text-primary")}
            >
              Continue
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
