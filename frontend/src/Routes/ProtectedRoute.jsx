import { Navigate } from "react-router-dom";
import { useEffect, useState } from "react";

const ProtectedRoute = ({ children, role }) => {
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    const principalId = localStorage.getItem("principalId");
    const principalSchoolId = localStorage.getItem("principalSchoolId");
    // const storedRole = localStorage.getItem("role");

    // ❌ Not logged in
    if (!principalId || !principalSchoolId) {
      setAllowed(false);
      setChecking(false);
      return;
    }

    // ✅ All good
    setAllowed(true);
    setChecking(false);
  }, [role]);

  if (checking) {
    return (
      <p className="p-6 text-gray-500">
        Checking authentication...
      </p>
    );
  }

  if (!allowed) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

export default ProtectedRoute;
