/**
 * Node ships its own `localStorage` global, which is inert unless the process
 * was started with `--localstorage-file`. It is defined before jsdom populates
 * the globals, so it shadows jsdom's implementation and the renderer's reads
 * come back undefined. Installing a plain in-memory store keeps the renderer
 * code under test unchanged — it is a real `localStorage` in Electron.
 */

if (!globalThis.localStorage) {
  const entries = new Map<string, string>();

  const store: Storage = {
    get length() {
      return entries.size;
    },
    key: (index) => [...entries.keys()][index] ?? null,
    getItem: (key) => entries.get(String(key)) ?? null,
    setItem: (key, value) => void entries.set(String(key), String(value)),
    removeItem: (key) => void entries.delete(String(key)),
    clear: () => entries.clear(),
  };

  Object.defineProperty(globalThis, "localStorage", {
    value: store,
    configurable: true,
    writable: true,
  });
}
