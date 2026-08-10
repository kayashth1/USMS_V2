import { useNavigate } from "react-router-dom";
import { CheckCircle2, Clock, ChevronRight, Users } from "lucide-react";

function fmtTime(ts) {
  if (!ts) return null;
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Shows which classes have completed attendance today and which are still pending.
 * Read-only — clicking a row navigates to ClassAttendance for monitoring detail.
 *
 * @param {Array} status  — from getSchoolTodayStatus()
 * @param {Array} classes — from getClassesBySchool()
 * @param {Object} teacherMap — { [teacherId]: { fullName, name } }
 */
const TodayOperationalView = ({ status = [], classes = [], teacherMap = {} }) => {
  const navigate = useNavigate();

  const classMap = {};
  classes.forEach((c) => { classMap[c.docId] = c; });

  const items = status
    .map((s) => {
      const cls = classMap[s.classId];
      return {
        ...s,
        label: cls ? `${cls.grade}-${cls.section}` : s.classId,
        sortKey: cls ? `${String(cls.grade).padStart(3, "0")}${cls.section}` : s.classId,
      };
    })
    .sort((a, b) => {
      // Pending first so principals see what needs action
      if (a.recorded !== b.recorded) return a.recorded ? 1 : -1;
      return a.sortKey.localeCompare(b.sortKey);
    });

  if (items.length === 0) {
    return (
      <div className="text-center py-10 text-gray-400 text-sm">
        No classes found for this school.
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-100">
      {items.map((item) => {
        const teacher = item.teacherId ? teacherMap[item.teacherId] : null;
        const teacherName = teacher?.fullName || teacher?.name || null;
        const markedTime = fmtTime(item.markedAt);

        return (
          <div
            key={item.classId}
            onClick={() => navigate(`/attendance/${item.classId}`)}
            className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 cursor-pointer transition-colors group"
          >
            {/* Status indicator */}
            <div className="shrink-0">
              {item.recorded ? (
                <CheckCircle2 size={20} className="text-green-500" />
              ) : (
                <Clock size={20} className="text-amber-400" />
              )}
            </div>

            {/* Class label */}
            <div className="w-16 shrink-0">
              <span className="text-sm font-semibold text-gray-800">{item.label}</span>
            </div>

            {/* Detail */}
            <div className="flex-1 min-w-0">
              {item.recorded ? (
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                    <Users size={11} />
                    <span className="text-green-600 font-medium">{item.present} present</span>
                    <span className="text-gray-300">·</span>
                    <span className="text-red-500 font-medium">{item.absent} absent</span>
                  </span>
                  {teacherName && (
                    <span className="text-xs text-gray-400 truncate">by {teacherName}</span>
                  )}
                  {markedTime && (
                    <span className="text-xs text-gray-400">{markedTime}</span>
                  )}
                </div>
              ) : (
                <span className="text-xs text-amber-600">Attendance not yet recorded</span>
              )}
            </div>

            {/* Attendance % badge (recorded only) */}
            {item.recorded && item.total > 0 && (
              <div className="shrink-0">
                <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${
                  (item.present / item.total) >= 0.75
                    ? "bg-green-100 text-green-700"
                    : "bg-red-100 text-red-700"
                }`}>
                  {Math.round((item.present / item.total) * 100)}%
                </span>
              </div>
            )}

            <ChevronRight size={14} className="shrink-0 text-gray-300 group-hover:text-gray-500 transition-colors" />
          </div>
        );
      })}
    </div>
  );
};

export default TodayOperationalView;
