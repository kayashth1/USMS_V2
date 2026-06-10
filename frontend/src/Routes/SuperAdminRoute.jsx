import { Navigate } from "react-router-dom";

const SuperAdminRoute = ({ children }) => {
  const isSuperAdmin = localStorage.getItem("isSuperAdmin") === "true";
  if (!isSuperAdmin) return <Navigate to="/login" replace />;
  return children;
};

export default SuperAdminRoute;
