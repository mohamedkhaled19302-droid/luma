/**
 * Minimal promise-based IndexedDB wrapper. Used as the default backend for
 * the storage abstraction. Kept small on purpose.
 */

const DB_NAME = 'luma'
const STORE = 'kv'
const QUEUE_STORE = 'mutations'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export function supportsIndexedDB(): boolean {
  try {
    return typeof indexedDB !== 'undefined'
  } catch {
    return false
  }
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb()
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction([STORE, QUEUE_STORE], mode)
    const request = fn(tx.objectStore(STORE))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    tx.oncomplete = () => db.close()
  })
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  if (!supportsIndexedDB()) return undefined
  return withStore<T>('readonly', (store) => store.get(key) as IDBRequest<T>)
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  if (!supportsIndexedDB()) return
  await withStore('readwrite', (store) => store.put(value, key) as unknown as IDBRequest<void>)
}

export async function kvDel(key: string): Promise<void> {
  if (!supportsIndexedDB()) return
  await withStore('readwrite', (store) => store.delete(key) as IDBRequest<void>)
}

export async function kvGetAll(
  prefix = '',
): Promise<Array<{ key: string; value: unknown }>> {
  if (!supportsIndexedDB()) return []
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const store = tx.objectStore(STORE)
    const request = store.getAll()
    request.onsuccess = () => {
      const values = (request.result as unknown[]) ?? []
      const keysRequest = store.getAllKeys()
      keysRequest.onsuccess = () => {
        const keys = (keysRequest.result as IDBValidKey[]) ?? []
        const out: Array<{ key: string; value: unknown }> = []
        keys.forEach((key, index) => {
          const strKey = String(key)
          if (strKey.startsWith(prefix)) out.push({ key: strKey, value: values[index] })
        })
        db.close()
        resolve(out)
      }
      keysRequest.onerror = () => reject(keysRequest.error)
    }
    request.onerror = () => reject(request.error)
  })
}

export type QueuedMutationRecord = {
  id: string
  entity: string
  operation: 'upsert' | 'delete'
  record: Record<string, unknown> | null
  createdAt: string
}

export async function queueMutationGetAll(): Promise<QueuedMutationRecord[]> {
  if (!supportsIndexedDB()) return []
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readonly')
    const request = tx.objectStore(QUEUE_STORE).getAll()
    request.onsuccess = () => resolve((request.result as QueuedMutationRecord[]) ?? [])
    request.onerror = () => reject(request.error)
  })
}

export async function queueMutationAdd(record: QueuedMutationRecord): Promise<void> {
  if (!supportsIndexedDB()) return
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readwrite')
    tx.objectStore(QUEUE_STORE).put(record)
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => reject(tx.error)
  })
}

export async function queueMutationRemove(id: string): Promise<void> {
  if (!supportsIndexedDB()) return
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readwrite')
    tx.objectStore(QUEUE_STORE).delete(id)
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => reject(tx.error)
  })
}