// IndexedDB keeps full review collections out of localStorage's small quota.
function openCache() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('competitor-analysis', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('cache');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function accessCache(mode, items) {
  const db = await openCache();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('cache', mode);
    const store = transaction.objectStore('cache');
    const request = mode === 'readwrite' ? store.put(items, 'items') : store.get('items');
    transaction.oncomplete = () => { db.close(); resolve(request.result); };
    transaction.onerror = () => { db.close(); reject(transaction.error); };
    transaction.onabort = () => { db.close(); reject(transaction.error); };
  });
}

export const loadCompetitorCache = () => accessCache('readonly');
export const saveCompetitorCache = items => accessCache('readwrite', items);
