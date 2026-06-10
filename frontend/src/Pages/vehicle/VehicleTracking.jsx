import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Bus, MapPin, Route, Plus, Crown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSchoolPlan } from "@/hooks/useSchoolPlan";

const MOCK_STATS = [
  { label: "Total Buses",    value: "0", color: "text-indigo-600" },
  { label: "Active Routes",  value: "0", color: "text-green-600"  },
  { label: "Total Stops",    value: "0", color: "text-blue-600"   },
  { label: "Live Now",       value: "0", color: "text-amber-600"  },
];

const VehicleTracking = () => {
  const navigate = useNavigate();
  const { isFree, isPremium, loading } = useSchoolPlan();

  useEffect(() => {
    if (!loading && isFree) navigate("/dashboard", { replace: true });
  }, [isFree, loading, navigate]);

  if (loading || !isPremium) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">Vehicle Tracking</h1>
            <span className="flex items-center gap-1 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
              <Crown size={10} /> Premium
            </span>
          </div>
          <p className="text-gray-500 mt-1">Monitor school bus routes and track vehicles live on a map.</p>
        </div>
        <Button disabled className="gap-2 opacity-50 cursor-not-allowed">
          <Plus size={15} /> Add Vehicle
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {MOCK_STATS.map(({ label, value, color }) => (
          <Card key={label}>
            <CardContent className="p-4 space-y-1">
              <p className="text-xs text-gray-500">{label}</p>
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Map placeholder + Route list */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Map */}
        <Card className="lg:col-span-2">
          <CardContent className="p-0">
            <div className="border-b px-4 py-3 bg-gray-50 flex items-center gap-2">
              <MapPin size={14} className="text-gray-500" />
              <p className="text-sm font-medium text-gray-700">Live Map</p>
            </div>
            <div className="flex flex-col items-center justify-center h-64 space-y-3 bg-gray-50/50">
              <div className="h-14 w-14 rounded-xl bg-indigo-50 flex items-center justify-center">
                <MapPin size={26} className="text-indigo-400" />
              </div>
              <div className="text-center">
                <p className="font-medium text-gray-700">Live map coming soon</p>
                <p className="text-sm text-gray-400 mt-1">GPS tracking will appear here.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Routes */}
        <Card>
          <CardContent className="p-0">
            <div className="border-b px-4 py-3 bg-gray-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Route size={14} className="text-gray-500" />
                <p className="text-sm font-medium text-gray-700">Routes</p>
              </div>
              <Badge variant="outline" className="text-xs">0 routes</Badge>
            </div>
            <div className="flex flex-col items-center justify-center h-64 space-y-2 text-center px-4">
              <Bus size={28} className="text-gray-300" />
              <p className="text-sm text-gray-400">No routes added yet.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default VehicleTracking;
