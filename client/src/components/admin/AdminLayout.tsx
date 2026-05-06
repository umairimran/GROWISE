import { FC, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  BookOpen,
  Users,
  Database,
  BarChart2,
  Settings,
  ChevronLeft,
  Menu,
  LogOut,
  ExternalLink,
} from "lucide-react";
import { authService } from "../../api/services/auth";

interface NavItem {
  label: string;
  to: string;
  icon: FC<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", to: "/admin/dashboard", icon: LayoutDashboard },
  { label: "Tracks", to: "/admin/tracks", icon: BookOpen },
  { label: "Knowledge Base", to: "/admin/knowledge-base", icon: Database },
  { label: "Users", to: "/admin/users", icon: Users },
  { label: "Analytics", to: "/admin/analytics", icon: BarChart2 },
  { label: "Settings", to: "/admin/settings", icon: Settings },
];

export const AdminLayout: FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await authService.logout();
    } catch {
      // ignore
    }
    navigate("/", { replace: true });
  };

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-950 overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`flex flex-col bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 transition-all duration-300 ${
          collapsed ? "w-16" : "w-56"
        } flex-shrink-0`}
      >
        {/* Logo area */}
        <div className="flex items-center justify-between px-4 h-16 border-b border-gray-200 dark:border-gray-800">
          {!collapsed && (
            <span className="font-bold text-emerald-600 dark:text-emerald-400 text-sm tracking-wide">
              GROW WISE
            </span>
          )}
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400"
          >
            {collapsed ? <Menu className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Admin badge */}
        {!collapsed && (
          <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-800">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
              Admin Panel
            </span>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 py-3 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map(({ label, to, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 mx-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"
                    : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100"
                }`
              }
              title={collapsed ? label : undefined}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {!collapsed && <span>{label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Bottom actions */}
        <div className="py-3 border-t border-gray-200 dark:border-gray-800 space-y-0.5">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-3 mx-2 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100 w-[calc(100%-16px)] transition-colors"
            title={collapsed ? "Back to App" : undefined}
          >
            <ExternalLink className="w-4 h-4 flex-shrink-0" />
            {!collapsed && <span>Back to App</span>}
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 mx-2 px-3 py-2.5 rounded-lg text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 w-[calc(100%-16px)] transition-colors"
            title={collapsed ? "Logout" : undefined}
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            {!collapsed && <span>Logout</span>}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <header className="h-16 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex items-center px-6 gap-4 flex-shrink-0">
          <h1 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Admin Dashboard
          </h1>
          <div className="flex-1" />
          <span className="text-xs px-2 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 font-semibold">
            Admin
          </span>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
