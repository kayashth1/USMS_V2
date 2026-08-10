import { useState } from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "@/config/firebase";
import { ToastProvider }          from "@/components/ui/toast";
import { ConfirmDialogProvider }  from "@/components/ui/confirm-dialog";
import { LayoutDashboard, School, LibraryBig, LogOut, ChevronLeft, ChevronRight } from "lucide-react";

const NAV_ITEMS = [
  { to: "/superadmin",         label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/superadmin/schools", label: "Schools",   icon: School },
  { to: "/superadmin/library", label: "Library",   icon: LibraryBig },
];

const SuperAdminLayout = () => {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  const handleLogout = async () => {
    await signOut(auth);
    localStorage.removeItem("isSuperAdmin");
    navigate("/login");
  };

  return (
    <ToastProvider>
    <ConfirmDialogProvider>
    <div className="flex h-screen bg-gray-50">
      {/* ── Sidebar ── */}
      <aside
        className={`${
          collapsed ? "w-16" : "w-60"
        } bg-gray-900 text-white flex flex-col shrink-0 transition-all duration-300 overflow-hidden`}
      >
        {/* Header */}
        <div className={`flex items-center border-b border-gray-700 ${collapsed ? "justify-center p-4" : "p-5 justify-between"}`}>
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-xs font-semibold text-indigo-400 uppercase tracking-widest mb-0.5">
                USMS Platform
              </p>
              <h1 className="text-lg font-bold">Super Admin</h1>
            </div>
          )}
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="text-gray-400 hover:text-white p-1 rounded-md hover:bg-gray-700 transition-colors shrink-0"
          >
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-2 space-y-1">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              title={collapsed ? label : undefined}
              className={({ isActive }) =>
                `flex items-center ${collapsed ? "justify-center" : "gap-3"} px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-indigo-600 text-white"
                    : "text-gray-400 hover:bg-gray-800 hover:text-white"
                }`
              }
            >
              <Icon size={17} />
              {!collapsed && <span>{label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Logout */}
        <div className="p-2 border-t border-gray-700">
          <button
            onClick={handleLogout}
            title={collapsed ? "Logout" : undefined}
            className={`flex items-center ${collapsed ? "justify-center" : "gap-3"} w-full px-3 py-2.5 rounded-lg text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition-colors`}
          >
            <LogOut size={17} />
            {!collapsed && <span>Logout</span>}
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="flex-1 overflow-y-auto p-6">
        <Outlet />
      </main>
    </div>
    </ConfirmDialogProvider>
    </ToastProvider>
  );
};

export default SuperAdminLayout;
