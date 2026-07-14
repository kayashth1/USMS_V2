import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PageLoader } from "@/components/ui/spinner";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";

import { useNavigate } from "react-router-dom";
import { getBatches, BatchStatus, PromotionType } from "@/promotion";
import { getClassesBySchool } from "@/services/class.service";
import PromotionWizard from "@/components/promotion/PromotionWizard";
import {
  ArrowUpCircle, CheckCircle, Clock, XCircle, AlertTriangle, Plus,
} from "lucide-react";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_STYLES = {
  [BatchStatus.DRAFT]:           "bg-gray-100 text-gray-600",
  [BatchStatus.RUNNING]:         "bg-blue-100 text-blue-700",
  [BatchStatus.COMPLETED]:       "bg-green-100 text-green-700",
  [BatchStatus.PARTIAL_SUCCESS]: "bg-yellow-100 text-yellow-700",
  [BatchStatus.FAILED]:          "bg-red-100 text-red-700",
  [BatchStatus.CANCELLED]:       "bg-gray-100 text-gray-400",
};

const STATUS_LABELS = {
  [BatchStatus.DRAFT]:           "Draft",
  [BatchStatus.RUNNING]:         "Running",
  [BatchStatus.COMPLETED]:       "Completed",
  [BatchStatus.PARTIAL_SUCCESS]: "Partial Success",
  [BatchStatus.FAILED]:          "Failed",
  [BatchStatus.CANCELLED]:       "Cancelled",
};

const TYPE_LABELS = {
  [PromotionType.CLASS_PROMOTION]: "Promotion",
  [PromotionType.GRADUATION]:      "Graduation",
};

function classLabel(classes, classId) {
  if (!classId) return "—";
  const c = classes.find((x) => x.docId === classId);
  return c ? `${c.grade}-${c.section}` : classId;
}

function formatDate(ts) {
  if (!ts) return "—";
  const d = ts.toDate?.() ?? new Date(ts);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

// ─── Batch Table ─────────────────────────────────────────────────────────────

function BatchTable({ batches, classes, onRowClick }) {
  if (batches.length === 0) {
    return (
      <div className="py-16 text-center text-gray-400">
        <ArrowUpCircle className="mx-auto mb-3 h-10 w-10 opacity-30" />
        <p className="text-sm">No promotion batches found.</p>
        <p className="text-xs mt-1">Create a batch using the button above.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Type</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">From Year</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">To Year</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Source Class</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Dest Class</th>
            <th className="px-4 py-3 text-center font-medium text-gray-600">Students</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Created</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {batches.map((b) => (
            <tr
              key={b.batchId}
              className="hover:bg-gray-50 cursor-pointer"
              onClick={() => onRowClick?.(b.batchId)}
            >
              <td className="px-4 py-3">
                <Badge
                  className={
                    b.promotionType === PromotionType.GRADUATION
                      ? "bg-purple-100 text-purple-700"
                      : "bg-blue-100 text-blue-700"
                  }
                >
                  {TYPE_LABELS[b.promotionType] ?? b.promotionType}
                </Badge>
              </td>
              <td className="px-4 py-3 font-medium">{b.fromAcademicYear}</td>
              <td className="px-4 py-3 text-gray-600">{b.toAcademicYear}</td>
              <td className="px-4 py-3">{classLabel(classes, b.fromClassId)}</td>
              <td className="px-4 py-3 text-gray-500">
                {b.promotionType === PromotionType.GRADUATION
                  ? <span className="italic text-gray-400">—</span>
                  : classLabel(classes, b.toClassId)}
              </td>
              <td className="px-4 py-3 text-center">
                <span className="font-medium">{b.totalStudents}</span>
                {b.completedStudents > 0 && (
                  <span className="text-gray-400 text-xs ml-1">
                    ({b.completedStudents} done)
                  </span>
                )}
              </td>
              <td className="px-4 py-3">
                <Badge className={STATUS_STYLES[b.status] ?? "bg-gray-100 text-gray-500"}>
                  {STATUS_LABELS[b.status] ?? b.status}
                </Badge>
              </td>
              <td className="px-4 py-3 text-gray-500 text-xs">
                {formatDate(b.requestedAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Summary Card ─────────────────────────────────────────────────────────────

function SummaryCard({ label, value, icon: Icon, colorClass }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 py-4">
        <div className={`p-2 rounded-lg ${colorClass}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-sm text-gray-500">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Year filter ──────────────────────────────────────────────────────────────

function YearFilter({ batches, value, onChange }) {
  const years = useMemo(() => {
    const s = new Set(batches.map((b) => b.fromAcademicYear).filter(Boolean));
    return [...s].sort((a, b) => b.localeCompare(a));
  }, [batches]);

  if (years.length < 2) return null;

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-40">
        <SelectValue placeholder="All years" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All years</SelectItem>
        {years.map((y) => (
          <SelectItem key={y} value={y}>{y}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Promotion() {
  const schoolId = localStorage.getItem("principalSchoolId");
  const navigate = useNavigate();

  const [batches,     setBatches]     = useState([]);
  const [classes,     setClasses]     = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [loadError,   setLoadError]   = useState(null);
  const [wizardOpen,  setWizardOpen]  = useState(false);
  const [yearFilter,  setYearFilter]  = useState("all");

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [b, cls] = await Promise.all([
        getBatches(schoolId),
        getClassesBySchool(schoolId),
      ]);
      setBatches(b);
      setClasses(cls);
    } catch (e) {
      setLoadError(e.message ?? "Failed to load promotion data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (schoolId) load();
  }, [schoolId]);

  // Summary counts
  const totalBatches = batches.length;
  const draftCount   = batches.filter((b) => b.status === BatchStatus.DRAFT).length;
  const doneCount    = batches.filter(
    (b) => b.status === BatchStatus.COMPLETED || b.status === BatchStatus.PARTIAL_SUCCESS
  ).length;
  const failedCount  = batches.filter(
    (b) => b.status === BatchStatus.FAILED || b.status === BatchStatus.CANCELLED
  ).length;

  // Filtered batches
  const filtered = useMemo(() => {
    if (!yearFilter || yearFilter === "all") return batches;
    return batches.filter((b) => b.fromAcademicYear === yearFilter);
  }, [batches, yearFilter]);

  const historyBatches = useMemo(
    () =>
      filtered.filter((b) =>
        [
          BatchStatus.COMPLETED,
          BatchStatus.PARTIAL_SUCCESS,
          BatchStatus.FAILED,
          BatchStatus.CANCELLED,
        ].includes(b.status)
      ),
    [filtered]
  );

  if (loading) return <PageLoader label="Loading promotions…" />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Promotion Management</h1>
          <p className="text-gray-500 text-sm">
            Manage student promotions and graduation batches
          </p>
        </div>
        <Button onClick={() => setWizardOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          New Promotion Batch
        </Button>
      </div>

      {loadError && (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <SummaryCard
          label="Total Batches"
          value={totalBatches}
          icon={ArrowUpCircle}
          colorClass="bg-indigo-100 text-indigo-600"
        />
        <SummaryCard
          label="Draft"
          value={draftCount}
          icon={Clock}
          colorClass="bg-gray-100 text-gray-500"
        />
        <SummaryCard
          label="Completed"
          value={doneCount}
          icon={CheckCircle}
          colorClass="bg-green-100 text-green-600"
        />
        <SummaryCard
          label="Failed / Cancelled"
          value={failedCount}
          icon={XCircle}
          colorClass="bg-red-100 text-red-500"
        />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="batches">
        <div className="flex items-center justify-between mb-3">
          <TabsList>
            <TabsTrigger value="batches">Promotion Batches</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>
          <YearFilter
            batches={batches}
            value={yearFilter}
            onChange={setYearFilter}
          />
        </div>

        <TabsContent value="batches">
          <BatchTable
            batches={filtered}
            classes={classes}
            onRowClick={(id) => navigate(`/promotion/${id}`)}
          />
        </TabsContent>

        <TabsContent value="history">
          <BatchTable
            batches={historyBatches}
            classes={classes}
            onRowClick={(id) => navigate(`/promotion/${id}`)}
          />
        </TabsContent>
      </Tabs>

      {/* Wizard */}
      <PromotionWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onSuccess={() => {
          setWizardOpen(false);
          load();
        }}
      />
    </div>
  );
}
