import type { StagedEvidenceRecord } from "@/lib/evidence-integrity";

const DATABASE_NAME = "aviatrack-evidence-staging";
const DATABASE_VERSION = 1;
const STORE_NAME = "evidence";

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("Persistent browser evidence storage is unavailable."));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onerror = () => reject(request.error || new Error("Unable to open evidence staging storage."));
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("draftId", "draftId", { unique: false });
        store.createIndex("observationId", "observationId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function runRequest<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const request = operation(transaction.objectStore(STORE_NAME));
    request.onerror = () => reject(request.error || new Error("Evidence staging operation failed."));
    request.onsuccess = () => resolve(request.result);
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => {
      database.close();
      reject(transaction.error || new Error("Evidence staging transaction failed."));
    };
  });
}

export function putStagedEvidence(record: StagedEvidenceRecord): Promise<IDBValidKey> {
  return runRequest("readwrite", store => store.put(record));
}

export function getStagedEvidence(id: string): Promise<StagedEvidenceRecord | undefined> {
  return runRequest("readonly", store => store.get(id));
}

export async function getStagedEvidenceMany(ids: string[]): Promise<StagedEvidenceRecord[]> {
  const records = await Promise.all(ids.map(id => getStagedEvidence(id)));
  return records.filter((record): record is StagedEvidenceRecord => Boolean(record));
}

export function deleteStagedEvidence(id: string): Promise<undefined> {
  return runRequest("readwrite", store => store.delete(id)) as Promise<undefined>;
}

export async function deleteStagedEvidenceMany(ids: string[]): Promise<void> {
  await Promise.all(ids.map(id => deleteStagedEvidence(id)));
}

