import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Bell,
  Users,
  GraduationCap,
  ClipboardList,
  BarChart3,
  BookOpen,
  Settings,
  CalendarDays,
  Wallet,
  UserCheck,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const menuItems = [
  { title: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
  { title: "Notice Management", path: "/notices", icon: Bell },
  { title: "Teacher Management", path: "/teachers", icon: Users },
  { title: "Student Management", path: "/students", icon: GraduationCap },
  { title: "Attendance", path: "/attendance", icon: ClipboardList },
  { title: "Academic Management", path: "/academics", icon: BarChart3 },
  { title: "Class Timetable", path: "/timetable", icon: CalendarDays },
  { title: "Fee Management", path: "/fees", icon: Wallet },
  { title: "Alumni", path: "/alumni", icon: UserCheck },
  { title: "Books & Content", path: "/books", icon: BookOpen },
  { title: "Settings", path: "/settings", icon: Settings },
];

const Sidebar = () => {
  return (
    <aside className="w-64 min-h-screen border-r bg-white px-4 py-6">
      
      {/* Logo */}
      <div className="flex items-center gap-3 px-2 mb-8">
        <div className="h-10 w-10 rounded-lg bg-indigo-600 flex items-center justify-center text-white">
          🎓
        </div>
        <div>
          <h1 className="font-bold text-gray-800">USMS</h1>
          <p className="text-xs text-gray-500">Admin Panel</p>
        </div>
      </div>

      {/* Menu */}
      <nav className="space-y-1">
        {menuItems.map(({ title, path, icon: Icon }) => (
          <NavLink key={title} to={path}>
            {({ isActive }) => (
              <Button
                variant={isActive ? "default" : "ghost"}
                className={cn(
                  "w-full justify-start gap-3",
                  isActive && "bg-indigo-600 text-white hover:bg-indigo-600"
                )}
              >
                <Icon className="h-4 w-4" />
                {title}
              </Button>
            )}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
};

export default Sidebar;
