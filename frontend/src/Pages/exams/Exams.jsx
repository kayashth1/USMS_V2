import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, Plus, Crown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSchoolPlan } from "@/hooks/useSchoolPlan";

const MOCK_STATS = [
  { label: "Total Exams",   value: "0", color: "text-indigo-600 bg-indigo-50" },
  { label: "Upcoming",      value: "0", color: "text-blue-600 bg-blue-50"     },
  { label: "Ongoing",       value: "0", color: "text-amber-600 bg-amber-50"   },
  { label: "Completed",     value: "0", color: "text-green-600 bg-green-50"   },
];

const Exams = () => {
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
            <h1 className="text-2xl font-semibold">Exam Management</h1>
            <span className="flex items-center gap-1 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
              <Crown size={10} /> Premium
            </span>
          </div>
          <p className="text-gray-500 mt-1">Manage exams, schedules, and real-time performance tracking.</p>
        </div>
        <Button disabled className="gap-2 opacity-50 cursor-not-allowed">
          <Plus size={15} /> Create Exam
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {MOCK_STATS.map(({ label, value, color }) => (
          <Card key={label}>
            <CardContent className="p-4 space-y-1">
              <p className="text-xs text-gray-500">{label}</p>
              <p className={`text-2xl font-bold ${color.split(" ")[0]}`}>{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Table shell */}
      <Card>
        <CardContent className="p-0">
          <div className="border-b px-4 py-3 flex items-center justify-between bg-gray-50">
            <p className="text-sm font-medium text-gray-700">Exam Schedule</p>
            <Badge variant="outline" className="text-xs">0 exams</Badge>
          </div>
          <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
            <div className="h-14 w-14 rounded-xl bg-indigo-50 flex items-center justify-center">
              <FileText size={26} className="text-indigo-400" />
            </div>
            <div>
              <p className="font-medium text-gray-700">No exams yet</p>
              <p className="text-sm text-gray-400 mt-1">
                Exam creation and scheduling is coming soon.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Exams;
