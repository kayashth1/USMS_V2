import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/config/firebase";
import { Eye, EyeOff } from "lucide-react";

const Login = () => {
  const navigate = useNavigate();

  const [email,       setEmail]       = useState("");
  const [password,    setPassword]    = useState("");
  const [showPwd,     setShowPwd]     = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState("");

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");

    try {
      setLoading(true);

      const cred = await signInWithEmailAndPassword(auth, email, password);
      const uid  = cred.user.uid;

      // Check if superadmin
      const superadminSnap = await getDoc(doc(db, "superadmins", uid));
      if (superadminSnap.exists()) {
        localStorage.setItem("isSuperAdmin", "true");
        navigate("/superadmin");
        return;
      }

      // Check principal record
      const snap = await getDoc(doc(db, "principals", uid));
      if (!snap.exists()) throw new Error("Access denied: Not a principal account");

      const principal = snap.data();
      if (!principal.isActive) throw new Error("Account is deactivated");

      localStorage.setItem("principalSchoolId", principal.schoolId);
      localStorage.setItem("principalId", uid);
      localStorage.setItem("principalName", principal.fullName || principal.name || "");

      navigate("/dashboard");
    } catch (err) {
      console.error("Login error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-md p-8">

        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-indigo-600">USMS</h1>
          <p className="text-gray-600 mt-2">Principal Admin Login</p>
        </div>

        {/* Error */}
        {error && (
          <p className="mb-4 text-sm text-red-600 text-center">{error}</p>
        )}

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-5">

          <div>
            <label className="block text-sm font-medium text-gray-700">Email Address</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="principal@school.com"
              className="mt-1 w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Password</label>
            <div className="relative mt-1">
              <input
                type={showPwd ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-2 pr-10 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPwd((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 text-white py-2 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>

        {/* Footer */}
        <div className="mt-6 text-center text-sm text-gray-500">
          <p>
            Don't have login access?{" "}
            <a
              href="mailto:contact@eakpustak.com"
              className="text-indigo-600 hover:underline"
            >
              contact@eakpustak.com
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
