import { useLocation, useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "@/config/firebase";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

const PAGE_TITLES = {
  "/dashboard":  "Dashboard",
  "/students":   "Student Management",
  "/teachers":   "Teacher Management",
  "/attendance": "Attendance",
  "/academics":  "Academic Management",
  "/timetable":  "Class Timetable",
  "/fees":       "Fee Management",
  "/alumni":     "Alumni",
  "/books":      "Books & Content",
  "/notices":    "Notice Management",
  "/settings":   "Settings",
  "/exams":      "Exam Management",
  "/vehicle":    "Vehicle Tracking",
};

const getPageTitle = (pathname) => {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  // Handle dynamic segments like /students/:id, /teachers/:id
  const match = Object.entries(PAGE_TITLES).find(([path]) =>
    pathname.startsWith(path + "/")
  );
  return match?.[1] ?? "Dashboard";
};

const getInitials = (name) => {
  if (!name) return "P";
  return name.split(" ").filter(Boolean).map((w) => w[0].toUpperCase()).join("").slice(0, 2);
};

const Header = () => {
  const location = useLocation();
  const navigate  = useNavigate();

  const principalName = localStorage.getItem("principalName") || "";
  const pageTitle     = getPageTitle(location.pathname);
  const initials      = getInitials(principalName);
  // Show only first name to keep it compact
  const displayName   = principalName.split(" ")[0] || "Principal";

  const handleLogout = async () => {
    try {
      await signOut(auth);
      localStorage.clear();
      navigate("/login");
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  return (
    <header className="h-16 bg-white border-b flex items-center justify-between px-6 sticky top-0 z-10">
      {/* Current page title */}
      <h2 className="font-semibold text-gray-800 text-base">{pageTitle}</h2>

      {/* Right side */}
      <div className="flex items-center gap-3">
        {/* Avatar + name */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-semibold shrink-0 select-none">
            {initials}
          </div>
          <span className="text-sm font-medium text-gray-700 hidden sm:block">
            {displayName}
          </span>
        </div>

        {/* Divider */}
        <div className="w-px h-5 bg-gray-200" />

        {/* Logout */}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleLogout}
          className="gap-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 px-2"
        >
          <LogOut size={15} />
          <span className="hidden sm:inline text-sm">Logout</span>
        </Button>
      </div>
    </header>
  );
};

export default Header;
