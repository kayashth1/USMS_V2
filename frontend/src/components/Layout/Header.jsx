import { Bell, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "@/config/firebase";

const Header = () => {
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      // Firebase logout
      await signOut(auth);

      // Clear local storage
      localStorage.clear();

      // Redirect to login
      navigate("/login");
    } catch (error) {
      console.error("Logout failed:", error);
      alert("Failed to logout. Try again.");
    }
  };

  return (
    <header className="h-16 bg-white border-b flex items-center justify-between px-6">
      <h2 className="font-semibold text-gray-800">
        Principal Dashboard
      </h2>

      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon">
          <Bell size={18} />
        </Button>

        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center text-sm">
            P
          </div>

          <span className="text-sm text-gray-700">
            Principal
          </span>

          {/* LOGOUT */}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleLogout}
            title="Logout"
          >
            <LogOut size={18} />
          </Button>
        </div>
      </div>
    </header>
  );
};

export default Header;
