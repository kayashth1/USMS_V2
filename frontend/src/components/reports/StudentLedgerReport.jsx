import { useState, useMemo, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import {
  Download, FileSpreadsheet, Printer, Search, FileText,
  ArrowDownCircle, ArrowUpCircle, CheckCircle, XCircle, Edit, Info,
} from "lucide-react";
import { getStudentLedger } from "@/reports";
import { getStudentsBySchool } from "@/services/student.service";
import {
  TableSkeleton, ErrorState, EmptyState, downloadExcel, INR, fmtDate,
} from "./ReportShared";

const EVENT_CONFIG = {
  profile_created:     { icon: Info,             color: "text-blue-500",  bg: "bg-blue-50",   label: "Profile Created"       },
  opening_outstanding: { icon: ArrowDownCircle,  color: "text-red-500",   bg: "bg-red-50",    label: "Balance Carry Forward" },
  opening_credit:      { icon: ArrowUpCircle,    color: "text-green-500", bg: "bg-green-50",  label: "Opening Credit"        },
  installment:         { icon: FileText,          color: "text-gray-500",  bg: "bg-gray-100",  label: "Installment"           },
  payment:             { icon: CheckCircle,       color: "text-green-600", bg: "bg-green-50",  label: "Payment Received"      },
  payment_cancelled:   { icon: XCircle,           color: "text-red-500",   bg: "bg-red-50",    label: "Payment Cancelled"     },
  revision:            { icon: Edit,              color: "text-amber-500", bg: "bg-amber-50",  label: "Fee Revision"          },
};

function doCSV(events, student, academicYear) {
  const name    = student?.fullName ?? student?.name ?? "student";
  const headers = ["Date", "Type", "Description", "Debit (₹)", "Credit (₹)", "Balance (₹)"];
  const data    = events.map(e => [
    fmtDate(e.date), e.type, e.description,
    e.debit || "", e.credit || "", e.balance ?? "",
  ]);
  const lines = [headers, ...data].map(row =>
    row.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")
  );
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  Object.assign(document.createElement("a"), {
    href: url, download: `ledger-${name.replace(/\s+/g, "-")}-${academicYear}.csv`,
  }).click();
  URL.revokeObjectURL(url);
}

function doExcelExport(events, student, academicYear) {
  const name    = student?.fullName ?? student?.name ?? "student";
  const headers = ["Date", "Type", "Description", "Debit (₹)", "Credit (₹)", "Balance (₹)"];
  const data    = events.map(e => [
    fmtDate(e.date), e.type, e.description,
    e.debit || "", e.credit || "", e.balance ?? "",
  ]);
  downloadExcel(headers, data, `ledger-${name.replace(/\s+/g, "-")}-${academicYear}`);
}

function studentName(s) {
  if (!s) return "";
  return s.fullName ?? s.name ?? [s.firstName, s.lastName].filter(Boolean).join(" ");
}
function admissionId(s) {
  return s?.admissionId ?? s?.admissionNo ?? s?.enrollmentId ?? "";
}

export default function StudentLedgerReport({ schoolId, years, globalFilters }) {
  const [students,     setStudents]     = useState([]);
  const [search,       setSearch]       = useState(globalFilters?.search ?? "");
  const [selectedId,   setSelectedId]   = useState("");
  const [academicYear, setAcademicYear] = useState(globalFilters?.academicYear ?? "");
  const [ledger,       setLedger]       = useState(null);
  const [loading,      setLoading]      = useState(false);
  const [loadingList,  setLoadingList]  = useState(true);
  const [error,        setError]        = useState(null);

  useEffect(() => {
    if (!schoolId) return;
    getStudentsBySchool(schoolId)
      .then(list => setStudents(list))
      .catch(() => setStudents([]))
      .finally(() => setLoadingList(false));
  }, [schoolId]);

  useEffect(() => {
    if (globalFilters?.academicYear) setAcademicYear(globalFilters.academicYear);
  }, [globalFilters?.academicYear]);

  useEffect(() => {
    if (globalFilters?.search) setSearch(globalFilters.search);
  }, [globalFilters?.search]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return students;
    return students.filter(s => {
      const name = (s.fullName ?? s.name ?? `${s.firstName ?? ""} ${s.lastName ?? ""}`).toLowerCase();
      const adm  = (s.admissionId ?? s.admissionNo ?? "").toLowerCase();
      return name.includes(q) || adm.includes(q);
    });
  }, [students, search]);

  const selectedStudent = useMemo(
    () => students.find(s => s.id === selectedId) ?? null,
    [students, selectedId]
  );

  const handleRun = async () => {
    if (!selectedId || !academicYear) return;
    setLoading(true);
    setError(null);
    setLedger(null);
    try {
      const data = await getStudentLedger(selectedId, academicYear, schoolId);
      setLedger(data);
    } catch (e) {
      setError(e.message ?? "Failed to load ledger");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Filters */}
      <Card className="print:hidden">
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1 flex-1 min-w-48">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Student</label>
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <Input
                  placeholder="Search by name or admission no."
                  value={search}
                  onChange={e => { setSearch(e.target.value); setSelectedId(""); setLedger(null); }}
                  className="pl-8"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Academic Year</label>
              <Select value={academicYear} onValueChange={v => { setAcademicYear(v); setLedger(null); }}>
                <SelectTrigger className="w-32"><SelectValue placeholder="Year" /></SelectTrigger>
                <SelectContent>
                  {years.map(y => <SelectItem key={y.id} value={y.year}>{y.year}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2 items-end flex-wrap">
              <Button
                onClick={handleRun}
                disabled={!selectedId || !academicYear || loading}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {loading ? "Loading…" : "View Ledger"}
              </Button>

              {ledger?.events?.length > 0 && (
                <>
                  <Button variant="outline" size="sm" onClick={() => doCSV(ledger.events, ledger.student, academicYear)}>
                    <Download size={13} className="mr-1.5" /> CSV
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => doExcelExport(ledger.events, ledger.student, academicYear)}>
                    <FileSpreadsheet size={13} className="mr-1.5" /> Excel
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => window.print()}>
                    <Printer size={13} className="mr-1.5" /> Print
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Student dropdown */}
          {search.trim() && filtered.length > 0 && !selectedId && (
            <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-48 overflow-y-auto shadow-sm">
              {filtered.slice(0, 10).map(s => (
                <button
                  key={s.id}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-indigo-50 text-left"
                  onClick={() => { setSelectedId(s.id); setSearch(studentName(s)); }}
                >
                  <div className="h-7 w-7 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-semibold shrink-0">
                    {(studentName(s)?.[0] ?? "S").toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-800">{studentName(s)}</p>
                    <p className="text-xs text-gray-400">{admissionId(s)}</p>
                  </div>
                </button>
              ))}
              {filtered.length > 10 && (
                <p className="px-4 py-2 text-xs text-gray-400 text-center">
                  Showing 10 of {filtered.length} — refine your search
                </p>
              )}
            </div>
          )}

          {loadingList && (
            <p className="text-xs text-gray-400 animate-pulse">Loading students…</p>
          )}
        </CardContent>
      </Card>

      {error   && <ErrorState message={error} onRetry={handleRun} />}
      {loading && <TableSkeleton rows={10} cols={5} />}

      {!loading && ledger && !error && (
        <div className="space-y-5">
          {/* Profile header */}
          {ledger.profile ? (
            <Card>
              <CardContent className="p-5">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">
                      {studentName(ledger.student) || "Student"}
                    </h2>
                    <p className="text-sm text-gray-500">
                      {admissionId(ledger.student)} · {ledger.profile.classLabel} · {academicYear}
                    </p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Current Balance</p>
                    <p className={`text-2xl font-bold tabular-nums ${ledger.currentBalance > 0 ? "text-red-600" : "text-green-600"}`}>
                      {INR(Math.abs(ledger.currentBalance))}
                      {ledger.currentBalance < 0 && <span className="text-sm font-normal ml-1 text-green-500">CR</span>}
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-gray-100">
                  {[
                    { label: "Annual Fee",           value: INR(ledger.profile.netAnnualFee)       },
                    { label: "Opening Outstanding",  value: INR(ledger.profile.openingOutstanding) },
                    { label: "Opening Credit",       value: INR(ledger.profile.openingCredit)      },
                    { label: "Schedule",             value: ledger.profile.schedule, capitalize: true },
                  ].map(({ label, value, capitalize }) => (
                    <div key={label}>
                      <p className="text-xs text-gray-400">{label}</p>
                      <p className={`font-semibold ${capitalize ? "capitalize" : "tabular-nums"}`}>{value}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            <EmptyState icon={FileText} title={`No fee profile for ${academicYear}`} />
          )}

          {/* Timeline table */}
          {ledger.events.length > 0 && (
            <Card>
              <div className="px-4 py-3 border-b border-gray-100">
                <h3 className="font-semibold text-gray-700 text-sm">Transaction Timeline</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-135">
                  <thead className="bg-gray-50 text-xs uppercase text-gray-500 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">Date</th>
                      <th className="px-4 py-3 text-left font-medium">Description</th>
                      <th className="px-4 py-3 text-right font-medium">Debit</th>
                      <th className="px-4 py-3 text-right font-medium">Credit</th>
                      <th className="px-4 py-3 text-right font-medium">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {ledger.events.map((event, i) => {
                      const cfg  = EVENT_CONFIG[event.type] ?? EVENT_CONFIG.installment;
                      const Icon = cfg.icon;
                      return (
                        <tr key={i} className={`hover:bg-gray-50 ${event.type === "revision" ? "italic text-gray-400" : ""}`}>
                          <td className="px-4 py-3 whitespace-nowrap text-gray-500 text-xs">{fmtDate(event.date)}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className={`p-1 rounded-full ${cfg.bg} shrink-0`}>
                                <Icon size={11} className={cfg.color} />
                              </span>
                              <span className="text-gray-700">{event.description}</span>
                              {event.type === "installment" && event.meta?.status === "paid" && (
                                <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">Paid</span>
                              )}
                              {event.type === "payment" && event.meta?.paymentMode && (
                                <span className="text-xs text-gray-400">({event.meta.paymentMode})</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-red-600 font-medium">
                            {event.debit > 0 ? INR(event.debit) : ""}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-green-600 font-medium">
                            {event.credit > 0 ? INR(event.credit) : ""}
                          </td>
                          <td className={`px-4 py-3 text-right tabular-nums font-semibold ${(event.balance ?? 0) > 0 ? "text-red-600" : "text-green-600"}`}>
                            {event.type === "profile_created" ? "—" : (
                              <>
                                {INR(Math.abs(event.balance ?? 0))}
                                {(event.balance ?? 0) < 0 && <span className="text-xs font-normal ml-1">CR</span>}
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
