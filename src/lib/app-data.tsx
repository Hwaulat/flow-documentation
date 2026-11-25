import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

import { loadSnapshot, removeLegacyDummyData, type DatabaseSnapshot } from "@/lib/local-db";

const EMPTY_SNAPSHOT: DatabaseSnapshot = {
  projects: [],
  features: [],
  points: [],
  attachments: [],
  lastBackupAt: null,
};

interface AppDataContextValue {
  snapshot: DatabaseSnapshot;
  ready: boolean;
  storageError: string | null;
  reload: () => Promise<void>;
}

const AppDataContext = createContext<AppDataContextValue | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const nextSnapshot = await loadSnapshot();
    setSnapshot(nextSnapshot);
    setStorageError(null);
  }, []);

  useEffect(() => {
    let active = true;

    if (typeof navigator !== "undefined" && navigator.storage?.persist) {
      void navigator.storage.persist().catch(() => {
        // Ignore storage persistence denial
      });
    }

    void removeLegacyDummyData()
      .catch(() => {
        // Ignore cleanup failure and proceed to load snapshot
      })
      .then(() => loadSnapshot())
      .then((nextSnapshot) => {
        if (active) {
          setSnapshot(nextSnapshot);
          setStorageError(null);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setStorageError(error instanceof Error ? error.message : "Penyimpanan lokal tidak dapat dibuka.");
        }
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <AppDataContext.Provider value={{ snapshot, ready, storageError, reload }}>
      {children}
    </AppDataContext.Provider>
  );
}

export function useAppData(): AppDataContextValue {
  const value = useContext(AppDataContext);
  if (!value) throw new Error("useAppData harus digunakan di dalam AppDataProvider.");
  return value;
}