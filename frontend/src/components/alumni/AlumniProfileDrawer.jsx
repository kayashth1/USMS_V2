import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  User, Phone, Mail, MapPin, Calendar, GraduationCap,
  CreditCard, Receipt, ArrowUpCircle,
} from "lucide-react";
import { getAlumniProfile } from "@/services/alumni.service";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const INR = (n) =>
  n == null
    ? "—"
    : `₹${Number(n).toLocaleString("en-IN")}`;

function fmtDate(ts) {
  if (!ts) return "—";
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return String(ts);
  }
}

function fmtDateTime(ts) {
  if (!ts) return "—";
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return String(ts);
  }
}

// ─── Info Row ─────────────────────────────────────────────────────────────────

function InfoRow({ icon: Icon, label, value, mono = false }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <div className="mt-0.5 h-4 w-4 shrink-0 text-gray-400">
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-400">{label}</p>
        <p className={`text-sm text-gray-800 break-words ${mono ? "font-mono" : "font-medium"}`}>
          {value || "—"}
        </p>
      </div>
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function DrawerSkeleton() {
  return (
    <div className="space-y-4 animate-pulse p-4">
      <div className="flex items-center gap-4">
        <div className="h-16 w-16 rounded-full bg-gray-200" />
        <div className="space-y-2 flex-1">
          <div className="h-4 bg-gray-200 rounded w-48" />
          <div className="h-3 bg-gray-100 rounded w-32" />
        </div>
      </div>
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="h-10 bg-gray-100 rounded" />
      ))}
    </div>
  );
}

// ─── Fee Summary Card ─────────────────────────────────────────────────────────

function FeeSummaryCard({ profile }) {
  if (!profile) return (
    <p className="text-sm text-gray-400 italic py-4">No fee profile found for graduation year.</p>
  );

  const totalPaid = (profile.netAnnualFee ?? 0) - (profile.balance ?? 0);

  return (
    <div className="grid grid-cols-2 gap-3">
      {[
        { label: "Gross Annual Fee",     value: INR(profile.grossAnnualFee),    color: "bg-gray-50" },
        { label: "Net Annual Fee",       value: INR(profile.netAnnualFee),      color: "bg-indigo-50" },
        { label: "Opening Balance",      value: INR(profile.openingOutstanding),color: profile.openingOutstanding > 0 ? "bg-red-50" : "bg-gray-50" },
        { label: "Opening Credit",       value: INR(profile.openingCredit),     color: profile.openingCredit > 0 ? "bg-green-50" : "bg-gray-50" },
        { label: "Profile Status",       value: profile.status,                 color: profile.status === "closed" ? "bg-gray-50" : "bg-amber-50" },
        { label: "Schedule",             value: profile.schedule ?? "—",        color: "bg-gray-50" },
      ].map(({ label, value, color }) => (
        <div key={label} className={`rounded-lg px-3 py-2 ${color}`}>
          <p className="text-xs text-gray-500">{label}</p>
          <p className="text-sm font-semibold capitalize">{value}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Payment History Table ─────────────────────────────────────────────────────

function PaymentHistoryTable({ payments }) {
  if (!payments.length) return (
    <p className="text-sm text-gray-400 italic py-4">No payments found for graduation year.</p>
  );

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b">
          <tr>
            <th className="px-3 py-2.5 text-left font-medium text-gray-600">Receipt</th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-600">Date</th>
            <th className="px-3 py-2.5 text-right font-medium text-gray-600">Amount</th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-600">Mode</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {payments.map((p) => (
            <tr key={p.id} className="hover:bg-gray-50">
              <td className="px-3 py-2.5 font-mono text-xs">{p.receiptNo ?? "—"}</td>
              <td className="px-3 py-2.5 text-gray-600 text-xs">{fmtDate(p.paymentDate)}</td>
              <td className="px-3 py-2.5 text-right font-medium tabular-nums">
                {INR(p.paymentAmount)}
              </td>
              <td className="px-3 py-2.5 text-gray-500 capitalize">{p.paymentMode ?? "—"}</td>
            </tr>
          ))}
          <tr className="bg-gray-50 font-medium">
            <td colSpan={2} className="px-3 py-2 text-right text-gray-600">Total Paid</td>
            <td className="px-3 py-2 text-right tabular-nums">
              {INR(payments.reduce((s, p) => s + (p.paymentAmount ?? 0), 0))}
            </td>
            <td />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ─── Promotion History Card ───────────────────────────────────────────────────

function PromotionHistoryCard({ promotionHistory }) {
  if (!promotionHistory?.length) return (
    <p className="text-sm text-gray-400 italic py-4">No promotion history recorded.</p>
  );

  return (
    <div className="space-y-2">
      {promotionHistory.map((h, i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm">
          <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
            <ArrowUpCircle className="h-4 w-4 text-indigo-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-800">
              {h.fromClassLabel ?? "—"} → {h.toClassLabel ?? "—"}
            </p>
            <p className="text-xs text-gray-400">{fmtDate(h.promotedAt)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── All Fee Profiles Timeline ────────────────────────────────────────────────

function AcademicHistoryCard({ profiles }) {
  if (!profiles?.length) return (
    <p className="text-sm text-gray-400 italic py-4">No academic year records found.</p>
  );

  const STATUS_COLORS = {
    draft:  "bg-amber-100 text-amber-700",
    active: "bg-green-100 text-green-700",
    closed: "bg-gray-100 text-gray-500",
  };

  return (
    <div className="space-y-2">
      {profiles.map((p) => (
        <div key={p.id} className="flex items-center justify-between rounded-lg border px-3 py-2.5 text-sm">
          <div>
            <p className="font-medium text-gray-800">{p.academicYear ?? "—"}</p>
            <p className="text-xs text-gray-400">{p.classLabel ?? "—"}</p>
          </div>
          <div className="flex items-center gap-3 text-right">
            <div>
              <p className="text-xs text-gray-400">Net Fee</p>
              <p className="font-medium tabular-nums">{INR(p.netAnnualFee)}</p>
            </div>
            <Badge className={STATUS_COLORS[p.status] ?? "bg-gray-100 text-gray-500"}>
              {p.status}
            </Badge>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main Drawer ─────────────────────────────────────────────────────────────

export default function AlumniProfileDrawer({ student, open, onClose }) {
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);
  const [profile,  setProfile]  = useState(null);  // { student, feeProfiles, payments }

  useEffect(() => {
    if (!open || !student?.id) { setProfile(null); return; }
    setLoading(true);
    setError(null);
    getAlumniProfile(student.id)
      .then(setProfile)
      .catch((e) => setError(e.message ?? "Failed to load profile."))
      .finally(() => setLoading(false));
  }, [open, student?.id]);

  const gradYearProfile = profile?.feeProfiles?.find(
    (p) => p.academicYear === student?.graduatedAcademicYear
  ) ?? profile?.feeProfiles?.[0] ?? null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[92vh] flex flex-col overflow-hidden p-0">
        {/* Fixed header */}
        <div className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogHeader>
            {/* Photo + Name */}
            <div className="flex items-center gap-4">
              {student?.photo ? (
                <img
                  src={student.photo}
                  alt={student.name}
                  className="h-16 w-16 rounded-full object-cover border"
                />
              ) : (
                <div className="h-16 w-16 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                  <span className="text-xl font-bold text-indigo-600">
                    {student?.name?.[0]?.toUpperCase() ?? "?"}
                  </span>
                </div>
              )}
              <div>
                <DialogTitle className="text-lg">{student?.name ?? "—"}</DialogTitle>
                <p className="text-sm text-gray-500">
                  Admission #{student?.admissionId}
                  {student?.rollNo && student.rollNo !== "—" && ` · Roll ${student.rollNo}`}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge className="bg-purple-100 text-purple-700 text-xs">
                    Alumni
                  </Badge>
                  <Badge className="bg-gray-100 text-gray-600 text-xs">
                    {student?.graduatedAcademicYear ?? "—"}
                  </Badge>
                  {student?.gender && (
                    <Badge className="bg-blue-50 text-blue-600 text-xs capitalize">
                      {student.gender}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </DialogHeader>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <DrawerSkeleton />
          ) : error ? (
            <div className="p-6">
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            </div>
          ) : (
            <Tabs defaultValue="info" className="h-full">
              <div className="sticky top-0 bg-white border-b z-10 px-6">
                <TabsList className="mt-2 mb-0">
                  <TabsTrigger value="info">Student Info</TabsTrigger>
                  <TabsTrigger value="academic">Academic</TabsTrigger>
                  <TabsTrigger value="fees">Fees</TabsTrigger>
                  <TabsTrigger value="history">Promotion History</TabsTrigger>
                </TabsList>
              </div>

              {/* Tab: Student Info */}
              <TabsContent value="info" className="px-6 py-4 space-y-4">
                <Card className="border-0 shadow-none bg-gray-50/50">
                  <CardHeader className="pb-1 pt-3 px-4">
                    <CardTitle className="text-sm text-gray-500 font-medium uppercase tracking-wide">
                      Personal Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-3 divide-y">
                    <InfoRow icon={User}     label="Full Name"       value={profile?.student?.name ?? student?.name} />
                    <InfoRow icon={CreditCard} label="Admission No." value={student?.admissionId} mono />
                    <InfoRow icon={User}     label="Roll Number"     value={student?.rollNo} mono />
                    <InfoRow icon={User}     label="Gender"          value={student?.gender} />
                    <InfoRow icon={Calendar} label="Admission Date"  value={fmtDate(student?.admissionDate)} />
                    <InfoRow icon={Calendar} label="Graduation Date" value={fmtDateTime(student?.graduatedAt)} />
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-none bg-gray-50/50">
                  <CardHeader className="pb-1 pt-3 px-4">
                    <CardTitle className="text-sm text-gray-500 font-medium uppercase tracking-wide">
                      Contact
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-3 divide-y">
                    <InfoRow icon={Phone}  label="Phone"       value={student?.phone} />
                    <InfoRow icon={Mail}   label="Email"       value={student?.email} />
                    <InfoRow icon={User}   label="Parent"      value={student?.parentName} />
                    <InfoRow icon={Phone}  label="Parent Phone" value={student?.parentPhone} />
                    <InfoRow icon={MapPin} label="Address"     value={student?.address} />
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Tab: Academic */}
              <TabsContent value="academic" className="px-6 py-4 space-y-4">
                <Card className="border-0 shadow-none bg-gray-50/50">
                  <CardHeader className="pb-1 pt-3 px-4">
                    <CardTitle className="text-sm text-gray-500 font-medium uppercase tracking-wide">
                      Graduation Details
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-3 divide-y">
                    <InfoRow icon={GraduationCap} label="Graduated Class"  value={student?.graduatedClassLabel} />
                    <InfoRow icon={Calendar}      label="Academic Year"    value={student?.graduatedAcademicYear} />
                    <InfoRow icon={Calendar}      label="Graduation Date"  value={fmtDateTime(student?.graduatedAt)} />
                  </CardContent>
                </Card>

                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Academic Year History</p>
                  <AcademicHistoryCard profiles={profile?.feeProfiles} />
                </div>
              </TabsContent>

              {/* Tab: Fees */}
              <TabsContent value="fees" className="px-6 py-4 space-y-4">
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">
                    Fee Profile — {student?.graduatedAcademicYear ?? "Graduation Year"}
                  </p>
                  <FeeSummaryCard profile={gradYearProfile} />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Payment History</p>
                  <PaymentHistoryTable payments={profile?.payments ?? []} />
                </div>
              </TabsContent>

              {/* Tab: Promotion History */}
              <TabsContent value="history" className="px-6 py-4">
                <p className="text-sm font-medium text-gray-700 mb-2">Promotion Timeline</p>
                <PromotionHistoryCard promotionHistory={profile?.student?.promotionHistory} />
              </TabsContent>
            </Tabs>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
