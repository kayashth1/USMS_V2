import { useEffect, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import { getAllSchools } from "@/services/superadmin.service";
import { Visibility } from "@/library";

const OPTIONS = [
  { value: Visibility.FREE,             label: "Free",             desc: "Available to all schools" },
  { value: Visibility.PREMIUM,          label: "Premium",          desc: "Premium-plan schools only" },
  { value: Visibility.SELECTED_SCHOOLS, label: "Selected Schools", desc: "Choose specific schools" },
];

export default function VisibilitySelector({ visibility, selectedSchoolIds = [], onChange }) {
  const [schools,  setSchools]  = useState([]);
  const [loadingSc, setLoadingSc] = useState(false);

  useEffect(() => {
    if (visibility !== Visibility.SELECTED_SCHOOLS || schools.length > 0) return;
    setLoadingSc(true);
    getAllSchools()
      .then(setSchools)
      .catch(console.error)
      .finally(() => setLoadingSc(false));
  }, [visibility]);

  const toggleSchool = (id) => {
    const next = selectedSchoolIds.includes(id)
      ? selectedSchoolIds.filter((s) => s !== id)
      : [...selectedSchoolIds, id];
    onChange({ visibility, selectedSchoolIds: next });
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-3">
        {OPTIONS.map(({ value, label, desc }) => (
          <button
            key={value}
            type="button"
            onClick={() => onChange({ visibility: value, selectedSchoolIds })}
            className={`flex-1 border rounded-lg p-3 text-left transition-colors ${
              visibility === value
                ? "border-indigo-500 bg-indigo-50"
                : "border-gray-200 hover:border-gray-300"
            }`}
          >
            <p className={`text-sm font-medium ${visibility === value ? "text-indigo-700" : "text-gray-800"}`}>
              {label}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
          </button>
        ))}
      </div>

      {visibility === Visibility.SELECTED_SCHOOLS && (
        <div className="border rounded-lg p-3 space-y-2 max-h-44 overflow-y-auto">
          {loadingSc ? (
            <div className="flex justify-center py-4"><Spinner /></div>
          ) : schools.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-2">No schools found</p>
          ) : (
            schools.map((s) => (
              <label key={s.id} className="flex items-center gap-2.5 cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5">
                <Checkbox
                  checked={selectedSchoolIds.includes(s.id)}
                  onCheckedChange={() => toggleSchool(s.id)}
                />
                <span className="text-sm text-gray-700">{s.name}</span>
                <span className="text-xs text-gray-400 ml-auto capitalize">{s.plan || "free"}</span>
              </label>
            ))
          )}
          {selectedSchoolIds.length > 0 && (
            <p className="text-xs text-indigo-600 font-medium pt-1 border-t">
              {selectedSchoolIds.length} school{selectedSchoolIds.length > 1 ? "s" : ""} selected
            </p>
          )}
        </div>
      )}
    </div>
  );
}
