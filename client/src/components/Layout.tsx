import { FC, ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { Button } from "./Button";
import { defaultProductBadge, learnerNavItems } from "./navigation";
import { Panel, StatusPill, cn } from "./ui";

interface LayoutProps {
  children: ReactNode;
  isSidebarOpen?: boolean;
  onSidebarClose?: () => void;
}

export const Layout: FC<LayoutProps> = ({ children, isSidebarOpen, onSidebarClose }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { icon: BadgeIcon, label: badgeLabel } = defaultProductBadge;
  const primaryNavItems = learnerNavItems.filter((item) =>
    ["/dashboard", "/course", "/validator", "/account"].includes(item.path),
  );

  return (
    <div className="min-h-screen bg-background pt-16 text-contrast">
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/45 backdrop-blur-sm transition-opacity lg:hidden"
          onClick={onSidebarClose}
        />
      )}

      <div className="page-shell flex gap-6 py-5">
        <aside
          className={cn(
            "fixed inset-y-16 left-0 z-50 w-[min(86vw,280px)] px-4 py-5 transition-transform duration-300 ease-out lg:static lg:inset-auto lg:z-auto lg:w-64 lg:translate-x-0 lg:px-0 lg:py-0",
            isSidebarOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <Panel className="flex flex-col gap-5 p-4 lg:sticky lg:top-[84px]" muted>
            <div className="space-y-3">
              <StatusPill tone="accent">
                <BadgeIcon className="h-3.5 w-3.5" />
                {badgeLabel}
              </StatusPill>
              <h2 className="font-display text-xl font-semibold text-contrast">Workspace</h2>
            </div>

            <nav className="flex flex-col gap-1.5">
              {primaryNavItems.map((item) => {
                const Icon = item.icon;
                const isActive =
                  location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);

                return (
                  <button
                    key={item.path}
                    onClick={() => {
                      navigate(item.path);
                      onSidebarClose?.();
                    }}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition-all",
                      isActive
                        ? "border-primary/25 bg-primary/10 text-primary"
                        : "border-transparent text-muted-foreground hover:border-border hover:bg-surface/70 hover:text-contrast",
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                        isActive ? "bg-primary text-white" : "bg-contrast/5 text-muted-foreground",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="truncate">{item.label}</div>
                      <div className="mt-0.5 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                        {item.path.replace("/", "") || "home"}
                      </div>
                    </div>
                    <ArrowUpRight className="h-3.5 w-3.5 shrink-0 opacity-40" />
                  </button>
                );
              })}
            </nav>

            <div className="pt-2">
              <Button size="sm" className="w-full" onClick={() => navigate("/skills")}>
                Choose Track
              </Button>
            </div>
          </Panel>
        </aside>

        <main className="min-w-0 flex-1 overflow-x-hidden pb-10">
          {children}
        </main>
      </div>
    </div>
  );
};
