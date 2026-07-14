import Sidebar from "./Sidebar";
import Header from "./Header";
import { Outlet } from "react-router-dom";
import { ToastProvider } from "@/components/ui/toast";
import { ConfirmDialogProvider } from "@/components/ui/confirm-dialog";

const AdminLayout = () => {
  return (
    <ToastProvider>
      <ConfirmDialogProvider>
        <div className="flex min-h-screen bg-gray-50">
          <Sidebar />

          <div className="flex flex-col flex-1">
            <Header />
            <main className="flex-1 p-6">
              <Outlet />
            </main>
          </div>
        </div>
      </ConfirmDialogProvider>
    </ToastProvider>
  );
};

export default AdminLayout;
