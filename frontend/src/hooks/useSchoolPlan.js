import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/config/firebase";

let _cachedPlan = null;

export function useSchoolPlan() {
  const schoolId = localStorage.getItem("principalSchoolId");
  const [plan,    setPlan]    = useState(_cachedPlan);
  const [loading, setLoading] = useState(!_cachedPlan);

  useEffect(() => {
    if (!schoolId) { setLoading(false); return; }
    if (_cachedPlan) { setPlan(_cachedPlan); setLoading(false); return; }

    getDoc(doc(db, "schools", schoolId))
      .then((snap) => {
        const p = snap.exists() ? (snap.data().plan || "free") : "free";
        _cachedPlan = p;
        setPlan(p);
      })
      .catch(() => setPlan("free"))
      .finally(() => setLoading(false));
  }, [schoolId]);

  const isPremium = plan === "premium";
  // isFree is false while loading — prevents redirects before plan is known
  const isFree = !loading && !isPremium;

  return { plan, isPremium, isFree, loading };
}
