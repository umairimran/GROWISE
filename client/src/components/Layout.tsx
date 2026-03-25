import { FC, ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { Button } from "./Button";
import { defaultProductBadge, learnerNavItems, productStatusItems } from "./navigation";
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
            "fixed inset-y-16 left-0 z-50 w-[min(86vw,320px)] px-4 py-5 transition-transform duration-300 ease-out lg:static lg:inset-auto lg:z-auto lg:w-80 lg:translate-x-0 lg:px-0 lg:py-0",
            isSidebarOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <Panel className="flex h-[calc(100vh-104px)] flex-col gap-5 p-4 lg:sticky lg:top-[84px] lg:h-[calc(100vh-104px)]" muted>
            <div className="space-y-4">
              <StatusPill tone="accent">
                <BadgeIcon className="h-3.5 w-3.5" />
                {badgeLabel}
              </StatusPill>
              <div>
                <h2 className="font-display text-2xl font-semibold text-contrast">Workspace</h2>
              </div>
            </div>

            <nav className="panel-grid">
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
                      "flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm font-medium transition-all",
                      isActive
                        ? "border-primary/20 bg-primary/10 text-primary shadow-soft"
                        : "border-border bg-surface/70 text-muted-foreground hover:border-primary/20 hover:bg-primary/5 hover:text-contrast",
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-10 w-10 items-center justify-center rounded-2xl",
                        isActive ? "bg-primary text-white" : "bg-contrast/5 text-muted-foreground",
                      )}
                    >
                      <Icon className="h-4.5 w-4.5" />
                    </div>
                    <div className="flex-1">
                      <div>{item.label}</div>
                      <div className="mt-0.5 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                        {item.path.replace("/", "") || "home"}
                      </div>
                    </div>
                    <ArrowUpRight className="h-4 w-4 opacity-50" />
                  </button>
                );
              })}
            </nav>

            <div className="section-divider" />

            <div className="panel-grid text-sm">
              {productStatusItems.map((item) => (
                <div key={item.label} className="metric-strip !p-4">
                  <div className="metric-label">{item.label}</div>
                  <div className="mt-1 text-base font-semibold text-contrast">{item.value}</div>
                </div>
              ))}
            </div>

            <div className="mt-auto flex gap-2">
              <Button size="sm" className="flex-1" onClick={() => navigate("/skills")}>
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
