/**
 * Wraps `load` so each key loads once and later calls share the result. A
 * failed load is forgotten, so asking again tries again.
 */
export function loadOnce<K, V>(load: (key: K) => Promise<V>): (key: K) => Promise<V> {
  const loaded = new Map<K, Promise<V>>();
  return (key) => {
    let value = loaded.get(key);
    if (!value) {
      value = load(key);
      value.catch(() => loaded.delete(key));
      loaded.set(key, value);
    }
    return value;
  };
}
