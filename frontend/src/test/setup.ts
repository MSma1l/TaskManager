import '@testing-library/jest-dom';

// Node 25 ships an experimental global `localStorage` that shadows jsdom's and
// throws on use. Install a minimal in-memory Storage so components that read
// `localStorage` (e.g. the i18n provider) work under the test runtime.
function createMemoryStorage(): Storage {
  let store: Record<string, string> = {};
  return {
    get length() {
      return Object.keys(store).length;
    },
    clear() {
      store = {};
    },
    getItem(key: string) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    key(index: number) {
      return Object.keys(store)[index] ?? null;
    },
    removeItem(key: string) {
      delete store[key];
    },
    setItem(key: string, value: string) {
      store[key] = String(value);
    },
  };
}

for (const target of [globalThis, window]) {
  Object.defineProperty(target, 'localStorage', {
    configurable: true,
    writable: true,
    value: createMemoryStorage(),
  });
}
