import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/config/firebase";
import { currentAcademicYear as calcDefault } from "@/services/fees.service";

let _cache = null;

export const invalidateSchoolSettingsCache = () => { _cache = null; };

export const useSchoolSettings = (schoolId) => {
  const [data, setData] = useState(
    _cache ?? { academicYear: calcDefault(), feeSchedule: "monthly", holidayMonths: [] }
  );
  const [loading, setLoading] = useState(!_cache);

  useEffect(() => {
    if (!schoolId || _cache) { setLoading(false); return; }
    getDoc(doc(db, "schools", schoolId))
      .then((snap) => {
        if (snap.exists()) {
          const d = snap.data();
          _cache = {
            academicYear:  d.feeAcademicYear  || calcDefault(),
            feeSchedule:   d.feeSchedule      || "monthly",
            holidayMonths: d.holidayMonths    || [],
          };
          setData(_cache);
        }
      })
      .finally(() => setLoading(false));
  }, [schoolId]);

  return { ...data, loading };
};
