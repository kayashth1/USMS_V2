import { useState } from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard, Bell, Users, GraduationCap, ClipboardList,
  BarChart3, BookOpen, Settings, CalendarDays, Wallet, UserCheck,
  FileText, Bus, ChevronLeft, ChevronRight, Crown,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useSchoolPlan } from "@/hooks/useSchoolPlan";
import PremiumModal from "@/components/common/PremiumModal";

const menuItems = [
  { title: "Dashboard",           path: "/dashboard",  icon: LayoutDashboard },
  { title: "Notice Management",   path: "/notices",    icon: Bell },
  { title: "Teacher Management",  path: "/teachers",   icon: Users },
  { title: "Student Management",  path: "/students",   icon: GraduationCap },
  { title: "Attendance",          path: "/attendance", icon: ClipboardList },
  { title: "Academic Management", path: "/academics",  icon: BarChart3 },
  { title: "Class Timetable",     path: "/timetable",  icon: CalendarDays },
  { title: "Fee Management",      path: "/fees",       icon: Wallet },
  { title: "Alumni",              path: "/alumni",     icon: UserCheck },
  { title: "Books & Content",     path: "/books",      icon: BookOpen },
  { title: "Exam Management",     path: "/exams",      icon: FileText,  premium: true },
  { title: "Vehicle Tracking",    path: "/vehicle",    icon: Bus,       premium: true },
  { title: "Settings",            path: "/settings",   icon: Settings },
];

const Sidebar = () => {
  const [collapsed,      setCollapsed]      = useState(false);
  const [lockedFeature,  setLockedFeature]  = useState(null);
  const { isFree } = useSchoolPlan();

  const handlePremiumClick = (e, title) => {
    if (isFree) {
      e.preventDefault();
      setLockedFeature(title);
    }
  };

  return (
    <>
      <aside
        className={cn(
          "min-h-screen border-r bg-white py-6 flex flex-col shrink-0 transition-all duration-300 overflow-hidden",
          collapsed ? "w-16 px-2" : "w-64 px-4"
        )}
      >
        {/* Logo + Toggle */}
        <div className={cn("flex items-center mb-8", collapsed ? "flex-col gap-3" : "gap-3 px-2")}>
          <div className="h-10 w-10 rounded-lg bg-indigo-600 flex items-center justify-center text-white shrink-0">
            🎓
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <h1 className="font-bold text-gray-800">USMS</h1>
              <p className="text-xs text-gray-500">Admin Panel</p>
            </div>
          )}
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="h-7 w-7 rounded-md border border-gray-200 bg-white flex items-center justify-center text-gray-500 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-300 transition-colors shrink-0 shadow-sm"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>

        {/* Menu */}
        <nav className="space-y-1 flex-1">
          {menuItems.map(({ title, path, icon: Icon, premium }) => (
            <NavLink
              key={title}
              to={path}
              title={collapsed ? title : undefined}
              onClick={premium ? (e) => handlePremiumClick(e, title) : undefined}
            >
              {({ isActive }) => (
                <Button
                  variant={isActive ? "default" : "ghost"}
                  className={cn(
                    "w-full",
                    collapsed ? "justify-center px-0" : "justify-start gap-3",
                    isActive && "bg-indigo-600 text-white hover:bg-indigo-600"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {!collapsed && (
                    <span className="flex-1 text-left">{title}</span>
                  )}
                  {!collapsed && premium && (
                    <Crown size={12} className="text-amber-500 shrink-0" />
                  )}
                </Button>
              )}
            </NavLink>
          ))}
        </nav>
      </aside>

      <PremiumModal
        open={!!lockedFeature}
        feature={lockedFeature}
        onClose={() => setLockedFeature(null)}
      />
    </>
  );
};

export default Sidebar;
