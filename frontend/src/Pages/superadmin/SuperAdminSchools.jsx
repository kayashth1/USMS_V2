import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Eye } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getAllSchools } from "@/services/superadmin.service";

const PLAN_STYLES = {
  free:    "bg-gray-100 text-gray-700",
  premium: "bg-amber-100 text-amber-700",
};

const SuperAdminSchools = () => {
  const navigate = useNavigate();
  const [schools, setSchools] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAllSchools()
      .then(setSchools)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Schools</h1>
          <p className="text-gray-500">All onboarded schools on the platform</p>
        </div>
        <Button onClick={() => navigate("/superadmin/schools/new")} className="gap-2">
          <Plus size={16} />
          Add School
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <table className="w-full text-sm">
              <thead className="border-b bg-gray-50">
                <tr>
                  {["School", "Code", "Email", "Plan", "Status", "Actions"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left font-medium text-gray-600">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b">
                    {Array.from({ length: 6 }).map((__, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-gray-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : schools.length === 0 ? (
            <p className="p-6 text-gray-500">No schools yet. Add your first school.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b bg-gray-50">
                <tr>
                  {["School", "Code", "Email", "Plan", "Status", "Actions"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left font-medium text-gray-600">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {schools.map((school) => (
                  <tr key={school.id} className="border-b last:border-0 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium">{school.name}</td>
                    <td className="px-4 py-3 text-gray-500">{school.code || "—"}</td>
                    <td className="px-4 py-3 text-gray-500">{school.email || "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${PLAN_STYLES[school.plan] || PLAN_STYLES.free}`}>
                        {school.plan || "free"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={school.isActive === false ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}>
                        {school.isActive === false ? "Inactive" : "Active"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() => navigate(`/superadmin/schools/${school.id}`)}
                      >
                        <Eye size={14} />
                        View
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SuperAdminSchools;
