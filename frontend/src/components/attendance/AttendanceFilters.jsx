import { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  query,
  where,
  collectionGroup,
} from "firebase/firestore";
import { db } from "@/config/firebase";

const AttendanceFilters = ({ filters, setFilters }) => {
  const schoolId = localStorage.getItem("principalSchoolId");

  const [classes, setClasses] = useState([]);
  const [years, setYears] = useState([]);
  const [months, setMonths] = useState([]);
  const [loading, setLoading] = useState(false);

  /* =======================
     FETCH CLASSES
  ======================= */
  useEffect(() => {
    if (!schoolId) return;

    const fetchClasses = async () => {
      const q = query(
        collection(db, "classes"),
        where("schoolId", "==", schoolId),
        where("isActive", "==", true)
      );

      const snap = await getDocs(q);

      setClasses(
        snap.docs.map((d) => ({
          id: d.id,
          label: `${d.data().grade}-${d.data().section}`,
        }))
      );
    };

    fetchClasses();
  }, [schoolId]);

  /* =======================
     FETCH ALL YEARS (GLOBAL)
  ======================= */
  useEffect(() => {
    const fetchYears = async () => {
      setLoading(true);

      const snap = await getDocs(
        collectionGroup(db, "years")
      );

      const yearSet = new Set();
      snap.docs.forEach((d) => yearSet.add(d.id));

      setYears([...yearSet].sort());
      setLoading(false);
    };

    fetchYears();
  }, []);

  /* =======================
     FETCH ALL MONTHS (GLOBAL)
  ======================= */
  useEffect(() => {
    if (!filters.year) {
      setMonths([]);
      return;
    }

    const fetchMonths = async () => {
      setLoading(true);

      const snap = await getDocs(
        collectionGroup(db, "months")
      );

      const monthSet = new Set();

      snap.docs.forEach((d) => {
        const yearId = d.ref.parent.parent.id;
        if (yearId === filters.year) {
          monthSet.add(d.id);
        }
      });

      setMonths([...monthSet].sort());
      setLoading(false);
    };

    fetchMonths();
  }, [filters.year]);

  return (
    <div className="mb-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

        {/* CLASS */}
        <div>
          <label className="block text-m mb-1 font-semibold">Class</label>
          <select
            className="w-full border rounded px-3 py-2"
            value={filters.classId}
            onChange={(e) =>
              setFilters({
                classId: e.target.value,
                year: filters.year,
                month: filters.month,
              })
            }
          >
            <option value="" >Select Class</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        {/* YEAR */}
        <div>
          <label className="block text-m mb-1 font-semibold">Year</label>
          <select
            className="w-full border rounded px-3 py-2"
            value={filters.year}
            onChange={(e) =>
              setFilters((p) => ({
                ...p,
                year: e.target.value,
                month: "",
              }))
            }
          >
            <option value="">Select Year</option>
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        {/* MONTH */}
        <div>
          <label className="block text-m mb-1 font-semibold">Month</label>
          <select
            className="w-full border rounded px-3 py-2"
            value={filters.month}
            onChange={(e) =>
              setFilters((p) => ({ ...p, month: e.target.value }))
            }
            disabled={!months.length}
          >
            <option value="">Select Month</option>
            {months.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
      </div>

      {loading && <p className="mt-3 text-sm">Loading…</p>}
    </div>
  );
};

export default AttendanceFilters;
