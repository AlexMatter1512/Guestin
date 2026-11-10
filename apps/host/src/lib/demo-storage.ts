const values = new Map<string, string>();
const memory: Storage = {
  get length() {
    return values.size;
  },
  key: (i) => [...values.keys()][i] ?? null,
  getItem: (k) => values.get(k) ?? null,
  setItem: (k, v) => {
    values.set(k, String(v));
  },
  removeItem: (k) => {
    values.delete(k);
  },
  clear: () => values.clear(),
};
export const hostStorage: Storage =
  import.meta.env.MODE === "demo" || typeof localStorage === "undefined"
    ? memory
    : localStorage;
