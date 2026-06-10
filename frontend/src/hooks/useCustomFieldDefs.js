import { useState, useEffect } from "react";
import { getCustomFieldDefs } from "@/services/customFieldDef.service";

// Module-level cache: avoids re-fetching on every dialog open.
// Key format: "schoolId_entity"
const _cache = {};

export function useCustomFieldDefs(schoolId, entity) {
  const key = `${schoolId}_${entity}`;
  const [defs, setDefs] = useState(_cache[key] || []);
  const [loading, setLoading] = useState(!_cache[key] && !!schoolId && !!entity);

  useEffect(() => {
    if (!schoolId || !entity) return;

    if (_cache[key]) {
      setDefs(_cache[key]);
      setLoading(false);
      return;
    }

    setLoading(true);
    getCustomFieldDefs(schoolId, entity)
      .then((data) => {
        _cache[key] = data;
        setDefs(data);
      })
      .catch((err) => {
        console.warn("Failed to load custom field defs:", err);
        setDefs([]);
      })
      .finally(() => setLoading(false));
  }, [key, schoolId, entity]);

  // Call after creating/updating/deleting a field def to bust the cache
  const refresh = () => {
    delete _cache[key];
    setLoading(true);
    getCustomFieldDefs(schoolId, entity)
      .then((data) => {
        _cache[key] = data;
        setDefs(data);
      })
      .catch((err) => {
        console.warn("Failed to refresh custom field defs:", err);
        setDefs([]);
      })
      .finally(() => setLoading(false));
  };

  return { defs, loading, refresh };
}
