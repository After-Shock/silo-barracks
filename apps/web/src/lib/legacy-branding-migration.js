const replacements = [
  [/^jellyglance_/, "silo_barracks_"],
  [/^jellyglance-/, "silo-barracks-"],
  [/^jellyglance:/, "silo-barracks:"],
  [new RegExp("^Jelly" + "Glance"), "Barracks"],
  [new RegExp("^JELLY" + "GLANCE_"), "SILO_BARRACKS_"],
];

export function migrateLegacyBrowserState(storage = globalThis.localStorage) {
  if (!storage) return;
  let keys;
  try { keys = Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter(Boolean); }
  catch { return; }
  for (const oldKey of keys) {
    let newKey = oldKey;
    for (const [pattern, replacement] of replacements) newKey = newKey.replace(pattern, replacement);
    if (newKey === oldKey) continue;
    try {
      if (storage.getItem(newKey) === null) storage.setItem(newKey, storage.getItem(oldKey));
    } catch { /* Existing preferences remain usable through their legacy key. */ }
  }
}
