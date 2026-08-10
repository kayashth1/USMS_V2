import { Clock } from "lucide-react";

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
 * Read-only log of all attendance recordings for one class in one month.
 * Used by principals to monitor teacher compliance — who recorded, when, for which period.
 *
 * @param {Array}  entries    — from getClassTeacherActivityLog()
 * @param {Object} teacherMap — { [teacherId]: teacherDoc }
 * @param {Object} subjectMap — { [subjectId]: subjectDoc }
 * @param {Object} periodMap  — { [periodId]: periodDoc }
 */
const TeacherActivityLog = ({ entries = [], teacherMap = {}, subjectMap = {}, periodMap = {} }) => {
  if (entries.length === 0) {
    return (
      <div className="text-center py-10 text-gray-400 text-sm">
        No attendance recorded this month.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            <Th>Date</Th>
            <Th>Teacher</Th>
            <Th>Subject</Th>
            <Th>Period</Th>
            <Th right>Present</Th>
            <Th right>Absent</Th>
            <Th right>Time</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {entries.map((entry) => {
            const teacher = entry.teacherId ? teacherMap[entry.teacherId] : null;
            const subject = entry.subjectId ? subjectMap[entry.subjectId] : null;
            const period  = entry.periodId  ? periodMap[entry.periodId]  : null;

            return (
              <tr key={entry.date} className="hover:bg-gray-50">
                <td className="px-3 py-3 text-gray-700 font-medium whitespace-nowrap">
                  {fmtDate(entry.date)}
                </td>
                <td className="px-3 py-3 text-gray-700">
                  {teacher?.fullName || teacher?.name || (
                    <span className="text-gray-400 text-xs font-mono">{entry.teacherId ?? "—"}</span>
                  )}
                </td>
                <td className="px-3 py-3 text-gray-600">
                  {subject?.name ?? (
                    <span className="text-gray-400 text-xs">{entry.subjectId ?? "—"}</span>
                  )}
                </td>
                <td className="px-3 py-3 text-gray-600">
                  {period
                    ? <span>{period.name} <span className="text-gray-400 text-xs">{period.from}–{period.to}</span></span>
                    : <span className="text-gray-400 text-xs">{entry.periodId ?? "—"}</span>
                  }
                </td>
                <td className="px-3 py-3 text-right text-green-600 font-semibold">{entry.present}</td>
                <td className="px-3 py-3 text-right text-red-500">{entry.absent}</td>
                <td className="px-3 py-3 text-right text-gray-400 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1">
                    <Clock size={11} />
                    {fmtTime(entry.markedAt)}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

const Th = ({ children, right }) => (
  <th className={`px-3 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide ${right ? "text-right" : "text-left"}`}>
    {children}
  </th>
);

export default TeacherActivityLog;
