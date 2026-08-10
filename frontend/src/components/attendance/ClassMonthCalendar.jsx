const WEEK_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

/**
 * Calendar for a class's monthly attendance.
 * Green  = attendance recorded on this day.
 * Hollow = past day with no attendance record.
 * Gray   = future day (not shown).
 *
 * Clicking a day with attendance calls onDateSelect(dateStr).
 *
 * @param {Object|null} monthData    — from getMonthAttendance() — full month doc data
 * @param {number}      calYear      — calendar year, e.g. 2026
 * @param {string}      month        — 2-char month string, e.g. "07"
 * @param {string|null} selectedDate — currently selected "yyyy-MM-dd"
 * @param {function}    onDateSelect — called with "yyyy-MM-dd"
 */
const ClassMonthCalendar = ({ monthData, calYear, month, selectedDate, onDateSelect }) => {
  const days = monthData?.days ?? {};
  const monthIndex = parseInt(month, 10) - 1; // 0-based
  const daysInMonth = new Date(calYear, monthIndex + 1, 0).getDate();
  const firstDayOfWeek = new Date(calYear, monthIndex, 1).getDay(); // 0=Sun

  const today = new Date();
  const isCurrentMonth = calYear === today.getFullYear() && monthIndex === today.getMonth();
  const todayDate = today.getDate();

  return (
    <div>
      <p className="text-xs text-gray-400 mb-3 text-center">
        {MONTH_NAMES[monthIndex]} {calYear}
      </p>

      {/* Week labels */}
      <div className="grid grid-cols-7 mb-1">
        {WEEK_LABELS.map((d) => (
          <div key={d} className="text-center text-xs font-medium text-gray-400 py-1">{d}</div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-1">
        {/* Empty leading cells */}
        {Array.from({ length: firstDayOfWeek }).map((_, i) => (
          <div key={`e-${i}`} />
        ))}

        {Array.from({ length: daysInMonth }).map((_, i) => {
          const dayNum = i + 1;

          // Hide future days in the current month
          if (isCurrentMonth && dayNum > todayDate) {
            return <div key={dayNum} />;
          }

          const dayStr = String(dayNum).padStart(2, "0");
          const dateKey = `${calYear}-${month}-${dayStr}`;
          const hasRecord = !!days[dateKey];
          const isSelected = dateKey === selectedDate;

          let cellClass = "h-9 flex items-center justify-center rounded-md text-sm font-medium transition-colors ";
          if (isSelected && hasRecord) {
            cellClass += "ring-2 ring-indigo-500 ring-offset-1 bg-green-500 text-white";
          } else if (hasRecord) {
            cellClass += "bg-green-100 text-green-800 hover:bg-green-200 cursor-pointer";
          } else {
            cellClass += "text-gray-300 bg-gray-50";
          }

          return (
            <div
              key={dayNum}
              className={cellClass}
              onClick={() => hasRecord && onDateSelect(dateKey)}
              title={hasRecord ? `View attendance for ${dateKey}` : "No attendance recorded"}
            >
              {dayNum}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-4 mt-4 justify-center">
        <span className="flex items-center gap-1.5 text-xs text-gray-400">
          <span className="w-3 h-3 rounded-sm bg-green-100 border border-green-200 inline-block" />
          Recorded
        </span>
        <span className="flex items-center gap-1.5 text-xs text-gray-400">
          <span className="w-3 h-3 rounded-sm bg-gray-50 border border-gray-200 inline-block" />
          No record
        </span>
      </div>
    </div>
  );
};

export default ClassMonthCalendar;
