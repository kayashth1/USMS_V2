import { CheckCircle2, XCircle, Clock, User, BookOpen, CalendarDays } from "lucide-react";

const MONTH_ABBR = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function fmtDate(dateStr) {
  const [y, m, d] = dateStr.split("-");
  return `${parseInt(d, 10)} ${MONTH_ABBR[parseInt(m, 10) - 1]} ${y}`;
}

function fmtTime(ts) {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Shows attendance detail for one day in a class.
 * This is a read-only view — principals can see who marked what and when.
 *
 * @param {string}     date        — "yyyy-MM-dd"
 * @param {Object}     dayData     — monthData.days[date]
 * @param {Array}      students    — from Firestore students collection for this class
 * @param {Object}     teacherMap  — { [teacherId]: teacherDoc }
 * @param {Object}     subjectMap  — { [subjectId]: subjectDoc }
 * @param {Object}     periodMap   — { [periodId]: periodDoc }
 * @param {function}   onClose
 */
const DayDetailPanel = ({ date, dayData, students = [], teacherMap = {}, subjectMap = {}, periodMap = {}, onClose }) => {
  if (!dayData || !date) return null;

  const records = dayData.records ?? {};
  const teacher = dayData.teacherId ? teacherMap[dayData.teacherId] : null;
  const subject = dayData.subjectId ? subjectMap[dayData.subjectId] : null;
  const period  = dayData.periodId  ? periodMap[dayData.periodId]  : null;

  // Build student rows, sorted by roll number
  const studentMap = {};
  students.forEach((s) => { studentMap[s.id] = s; });

  const rows = Object.entries(records)
    .map(([studentId, present]) => ({
      studentId,
      present,
      name: studentMap[studentId]?.fullName ?? "Unknown Student",
      roll: studentMap[studentId]?.roll ?? studentMap[studentId]?.rollNumber ?? "—",
      rollNum: parseInt(studentMap[studentId]?.roll ?? studentMap[studentId]?.rollNumber ?? "999", 10),
    }))
    .sort((a, b) => a.rollNum - b.rollNum);

  const presentCount = rows.filter((r) => r.present).length;
  const absentCount  = rows.filter((r) => !r.present).length;

  return (
    <div className="border border-gray-200 rounded-xl bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b border-gray-100 bg-gray-50">
        <div>
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Attendance Detail</p>
          <h3 className="text-base font-semibold text-gray-800 mt-0.5">{fmtDate(date)}</h3>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none mt-0.5">✕</button>
        )}
      </div>

      {/* Metadata */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 border-b border-gray-100">
        <MetaItem icon={User} label="Recorded by">
          {teacher?.fullName || teacher?.name || dayData.teacherId || "—"}
        </MetaItem>
        <MetaItem icon={Clock} label="Time">
          {fmtTime(dayData.markedAt)}
        </MetaItem>
        <MetaItem icon={BookOpen} label="Subject">
          {subject?.name ?? dayData.subjectId ?? "—"}
        </MetaItem>
        <MetaItem icon={CalendarDays} label="Period">
          {period ? `${period.name} (${period.from}–${period.to})` : dayData.periodId ?? "—"}
        </MetaItem>
      </div>

      {/* Summary strip */}
      <div className="flex items-center gap-6 px-4 py-2 bg-gray-50 border-b border-gray-100 text-sm">
        <span className="text-green-600 font-semibold">{presentCount} present</span>
        <span className="text-red-500 font-semibold">{absentCount} absent</span>
        <span className="text-gray-400">{rows.length} total</span>
        {rows.length > 0 && (
          <span className="ml-auto text-gray-500 font-medium">
            {Math.round((presentCount / rows.length) * 100)}% attendance
          </span>
        )}
      </div>

      {/* Student list */}
      <div className="max-h-72 overflow-y-auto divide-y divide-gray-50">
        {rows.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-8">No student records found.</p>
        ) : (
          rows.map((row) => (
            <div key={row.studentId} className="flex items-center gap-3 px-4 py-2.5">
              {row.present ? (
                <CheckCircle2 size={16} className="text-green-500 shrink-0" />
              ) : (
                <XCircle size={16} className="text-red-400 shrink-0" />
              )}
              <span className="text-xs text-gray-400 w-8 shrink-0 font-mono">{row.roll}</span>
              <span className="text-sm text-gray-800 flex-1">{row.name}</span>
              <span className={`text-xs font-medium ${row.present ? "text-green-600" : "text-red-500"}`}>
                {row.present ? "Present" : "Absent"}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

const MetaItem = ({ icon: Icon, label, children }) => (
  <div className="flex items-start gap-2 min-w-0">
    <Icon size={14} className="text-gray-400 shrink-0 mt-0.5" />
    <div className="min-w-0">
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-sm font-medium text-gray-700 truncate">{children}</p>
    </div>
  </div>
);

export default DayDetailPanel;
