import { ReactNode, FC } from 'react';
import { LayoutDashboard, BookOpen, Zap } from 'lucide-react';

interface LayoutProps {
  children: ReactNode;
  activeView: string;
  onNavigate: (view: any) => void;
  onLogout: () => void;
  user?: any;
  isSidebarOpen?: boolean;
  onSidebarClose?: () => void;
}

export const Layout: FC<LayoutProps> = ({ 
  children, 
  activeView, 
  onNavigate, 
  isSidebarOpen,
  onSidebarClose
}) => {

  const navItems = [
    { id: 'DASHBOARD', label: 'Overview', icon: LayoutDashboard },
    // { id: 'COURSE_VIEW', label: 'My Curriculum', icon: BookOpen }, // Disabled
    { id: 'VALIDATOR', label: 'Real-World Validator', icon: Zap },
  ];

  return (
    <div className="flex min-h-screen bg-background text-gray-900 font-sans pt-16">
      
      {/* Overlay for mobile */}
      {isSidebarOpen && (
        <div 
            className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm transition-opacity"
            onClick={onSidebarClose}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed top-16 bottom-0 left-0 z-50 w-64 bg-surface border-r border-border flex flex-col transform transition-transform duration-300 ease-in-out lg:fixed lg:translate-x-0
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                    onNavigate(item.id);
                    if (onSidebarClose) onSidebarClose();
                }}
                className={`w-full flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                  isActive 
                    ? 'bg-gray-100 dark:bg-gray-800 text-contrast' 
                    : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
              >
                <Icon className={`mr-3 h-5 w-5 ${isActive ? 'text-contrast' : 'text-gray-400'}`} />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border bg-surface">
             <div className="text-xs text-gray-400 text-center">
                 v2.1.0 • Grow Wise
             </div>
        </div>
      </aside>

      {/* Main Content - Adjusted margin for fixed sidebar */}
      <main className="flex-1 lg:ml-64 p-4 lg:p-8 w-full overflow-x-hidden">
        <div className="max-w-6xl mx-auto h-full">
            {children}
        </div>
      </main>
    </div>
  );
};