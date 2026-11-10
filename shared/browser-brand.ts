// Migrate non-secret browser preferences; old guest credentials must be discarded.
export function migrateBrowserPreferences(storage: Storage) {
  try {
    for (const key of Object.keys(storage)) {
      if (!key.startsWith("oshost.")) continue;
      if (!key.endsWith(".code") && !key.endsWith(".pending")) {
        const next = "guestin." + key.slice(7);
        if (storage.getItem(next) === null)
          storage.setItem(next, storage.getItem(key)!);
      }
      storage.removeItem(key);
    }
  } catch {
    /* Storage is optional. */
  }
}
