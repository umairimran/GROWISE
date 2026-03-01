import { FC, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { LogOut, LayoutDashboard, Menu, X } from "lucide-react";
import { Button } from "./Button";
import { ThemeToggle } from "./ThemeToggle";
import { User } from "../types";

interface HeaderProps {
  user: User | null;
  onLogout: () => void;
  onMenuToggle?: () => void;
}

export const Header: FC<HeaderProps> = ({ user, onLogout, onMenuToggle }) => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isDashboardView =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/validator") ||
    pathname.startsWith("/course") ||
    pathname.startsWith("/account");
  const isSignupRoute = pathname === "/signup";

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
    <header className="fixed w-full bg-background/80 backdrop-blur-md z-[60] border-b border-border transition-all duration-300 h-16">
      <div className="w-full h-full px-4 sm:px-6 lg:px-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {isDashboardView && user && (
            <button
              onClick={onMenuToggle}
              className="lg:hidden p-2 -ml-2 text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
            >
              <Menu className="h-6 w-6" />
            </button>
          )}

          <div
            className="font-serif text-2xl font-bold text-contrast tracking-tight cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => navigate("/")}
          >
            Grow Wise
          </div>
        </div>

        <div className="hidden md:flex items-center space-x-8">
          {!isDashboardView && (
            <>
              <button
                onClick={() => scrollToSection("testimonials")}
                className="text-sm font-medium text-gray-600 hover:text-contrast transition-colors relative group"
              >
                Testimonials
                <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-contrast transition-all group-hover:w-full"></span>
              </button>
              <button
                onClick={() => scrollToSection("pricing")}
                className="text-sm font-medium text-gray-600 hover:text-contrast transition-colors relative group"
              >
                Pricing
                <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-contrast transition-all group-hover:w-full"></span>
              </button>
              <button
                onClick={() => navigate("/blog")}
                className="text-sm font-medium text-gray-600 hover:text-contrast transition-colors relative group"
              >
                Blog
                <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-contrast transition-all group-hover:w-full"></span>
              </button>
            </>
          )}
        </div>

        <div className="flex items-center space-x-4">
          <ThemeToggle />

          {user ? (
            <div className="flex items-center gap-3">
              {!isDashboardView && (
                <Button size="sm" onClick={() => navigate("/dashboard")} className="flex items-center gap-2">
                  <LayoutDashboard className="h-4 w-4" />
                  <span className="hidden sm:inline">Dashboard</span>
                </Button>
              )}

              <div className="hidden sm:flex items-center gap-3 pl-3 border-l border-border">
                <div className="text-right hidden md:block">
                  <div className="text-sm font-medium text-contrast">{user.name}</div>
                  <div className="text-[10px] text-gray-500 uppercase tracking-wide">
                    {user.isPro ? "Pro" : "Free"}
                  </div>
                </div>
                <div className="h-8 w-8 rounded-full bg-accent text-white flex items-center justify-center font-bold">
                  {user.name?.[0] || "U"}
                </div>
              </div>

              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  void onLogout();
                }}
                className="text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                title="Log Out"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <>
              <button
                onClick={() => navigate("/login")}
                className="hidden sm:block text-sm font-medium text-gray-600 hover:text-contrast transition-colors"
              >
                Login
              </button>
              <Button size="sm" onClick={() => navigate(isSignupRoute ? "/login" : "/signup")}>
                {isSignupRoute ? "Log In" : "Get Started"}
              </Button>
            </>
          )}

          {!isDashboardView && (
            <button className="md:hidden p-2" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          )}
        </div>
      </div>

      {!isDashboardView && mobileMenuOpen && (
        <div className="md:hidden absolute top-16 left-0 right-0 bg-background border-b border-border p-4 shadow-lg animate-fade-in">
          <div className="flex flex-col space-y-4">
            <button onClick={() => scrollToSection("testimonials")} className="text-left py-2 font-medium text-gray-600">
              Testimonials
            </button>
            <button onClick={() => scrollToSection("pricing")} className="text-left py-2 font-medium text-gray-600">
              Pricing
            </button>
            <button onClick={() => navigate("/blog")} className="text-left py-2 font-medium text-gray-600">
              Blog
            </button>
            {!user && (
              <button onClick={() => navigate("/login")} className="text-left py-2 font-medium text-gray-600">
                Login
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
