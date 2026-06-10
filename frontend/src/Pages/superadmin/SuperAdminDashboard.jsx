import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { School, Users, GraduationCap, CheckCircle } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getPlatformStats, getRecentSchools } from "@/services/superadmin.service";

const PLAN_STYLES = {
  free:    "bg-gray-100 text-gray-700",
  premium: "bg-amber-100 text-amber-700",
};

const SuperAdminDashboard = () => {
  const navigate = useNavigate();
  const [stats,         setStats]         = useState(null);
  const [recentSchools, setRecentSchools] = useState([]);
  const [loading,       setLoading]       = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [s, r] = await Promise.all([getPlatformStats(), getRecentSchools()]);
        setStats(s);
        setRecentSchools(r);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) return <p className="text-gray-500">Loading dashboard...</p>;

  const statCards = [
    { label: "Total Schools",   value: stats?.totalSchools,  icon: School,        color: "text-indigo-600 bg-indigo-50"  },
    { label: "Active Schools",  value: stats?.activeSchools, icon: CheckCircle,   color: "text-green-600 bg-green-50"    },
    { label: "Total Students",  value: stats?.totalStudents, icon: GraduationCap, color: "text-blue-600 bg-blue-50"      },
    { label: "Total Teachers",  value: stats?.totalTeachers, icon: Users,         color: "text-amber-600 bg-amber-50"    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-gray-500">Platform-wide overview</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <CardContent className="p-5 flex items-center gap-4">
              <div className={`h-11 w-11 rounded-xl flex items-center justify-center ${color}`}>
                <Icon size={22} />
              </div>
              <div>
                <p className="text-2xl font-bold">{value ?? "-"}</p>
                <p className="text-sm text-gray-500">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent Schools */}
      <Card>
        <CardContent className="p-6">
          <h2 className="text-lg font-semibold mb-4">Recently Added Schools</h2>
          {recentSchools.length === 0 ? (
            <p className="text-gray-500 text-sm">No schools added yet.</p>
          ) : (
            <div className="space-y-2">
              {recentSchools.map((school) => (
                <div
                  key={school.id}
                  onClick={() => navigate(`/superadmin/schools/${school.id}`)}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <div>
                    <p className="font-medium">{school.name}</p>
                    <p className="text-sm text-gray-500">{school.email || "—"}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${PLAN_STYLES[school.plan] || PLAN_STYLES.free}`}>
                      {school.plan || "free"}
                    </span>
                    <Badge className={school.isActive === false ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}>
                      {school.isActive === false ? "Inactive" : "Active"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SuperAdminDashboard;
