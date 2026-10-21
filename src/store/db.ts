/** Almacenamiento local: IndexedDB (con localStorage de reserva para los datos). */

const DB_NAME = 'diaadia';
const DB_VERSION = 1;
const LS_PREFIX = 'diaadia:';

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDB(): Promise<IDBDatabase | null> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        if (typeof indexedDB === 'undefined') return resolve(null);
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
          if (!db.objectStoreNames.contains('files')) db.createObjectStore('files');
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return dbPromise;
}

function run<T>(store: 'kv' | 'files', mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        if (!db) return reject(new Error('IndexedDB no disponible'));
        const tx = db.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error ?? req.error);
        tx.onabort = () => reject(tx.error ?? new Error('Transacción cancelada'));
      }),
  );
}

export const kv = {
  async get<T>(key: string): Promise<T | undefined> {
    try {
      const v = await run<T>('kv', 'readonly', (s) => s.get(key) as IDBRequest<T>);
      if (v !== undefined) return v;
    } catch {
      /* reserva */
    }
    try {
      const raw = localStorage.getItem(LS_PREFIX + key);
      return raw ? (JSON.parse(raw) as T) : undefined;
    } catch {
      return undefined;
    }
  },
  async set<T>(key: string, value: T): Promise<void> {
    try {
      await run('kv', 'readwrite', (s) => s.put(value, key));
      return;
    } catch {
      /* reserva */
    }
    try {
      localStorage.setItem(LS_PREFIX + key, JSON.stringify(value));
    } catch {
      /* sin espacio */
    }
  },
};

export const files = {
  async get(id: string): Promise<Blob | undefined> {
    try {
      return await run<Blob | undefined>('files', 'readonly', (s) => s.get(id) as IDBRequest<Blob | undefined>);
    } catch {
      return undefined;
    }
  },
  async put(id: string, blob: Blob): Promise<void> {
    await run('files', 'readwrite', (s) => s.put(blob, id));
  },
  async del(id: string): Promise<void> {
    try {
      await run('files', 'readwrite', (s) => s.delete(id));
    } catch {
      /* nada */
    }
  },
  async keys(): Promise<string[]> {
    try {
      return (await run<IDBValidKey[]>('files', 'readonly', (s) => s.getAllKeys())).map(String);
    } catch {
      return [];
    }
  },
};

/** Pide al navegador que no borre los datos si falta espacio. */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
