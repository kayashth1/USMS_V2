const _store  = new Map();
const TTL_MS  = 5 * 60 * 1000; // 5 minutes

export async function withCache(key, fn) {
  const entry = _store.get(key);
  if (entry && Date.now() < entry.expiresAt) return entry.data;
  const data = await fn();
  _store.set(key, { data, expiresAt: Date.now() + TTL_MS });
  return data;
}

export function bustCache(prefix) {
  for (const k of _store.keys()) {
    if (k.startsWith(prefix)) _store.delete(k);
  }
}

export function clearAllCache() {
  _store.clear();
}
