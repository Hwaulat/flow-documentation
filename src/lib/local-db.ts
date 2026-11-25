export type ProjectStatus = "active" | "on-hold" | "done";
export type PointSource = "Meeting" | "Call" | "WhatsApp" | "Email" | "Other";
export type AttachmentOwnerType = "project" | "feature" | "point";
export type TrashType = "project" | "feature" | "point" | "attachment";

export interface ProjectRecord {
  id: string;
  name: string;
  customerName: string;
  description: string;
  status: ProjectStatus;
  processFlow: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface FeatureRecord {
  id: string;
  projectId: string;
  name: string;
  flowNotes: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface PointRecord {
  id: string;
  featureId: string;
  content: string;
  mentionedOn: string;
  source: PointSource;
  statedBy: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface AttachmentRecord {
  id: string;
  ownerType: AttachmentOwnerType;
  ownerId: string;
  originalName: string;
  mimeType: string;
  size: number;
  caption: string;
  createdAt: string;
  deletedAt: string | null;
}

export interface StoredAttachment extends AttachmentRecord {
  blob: Blob;
}

export interface DatabaseSnapshot {
  projects: ProjectRecord[];
  features: FeatureRecord[];
  points: PointRecord[];
  attachments: AttachmentRecord[];
  lastBackupAt: string | null;
}

interface SettingRecord {
  key: string;
  value: string;
}

const DATABASE_NAME = "project-flow-local";
const DATABASE_VERSION = 1;
const STORE_NAMES = ["projects", "features", "points", "attachments", "settings"] as const;

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

export function isValidImageAttachment(mimeType: string, size: number): boolean {
  return IMAGE_TYPES.has(mimeType.toLowerCase()) && size > 0 && size <= MAX_ATTACHMENT_BYTES;
}

export function createId(): string {
  return crypto.randomUUID();
}

export function currentTimestamp(): string {
  return new Date().toISOString();
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("Penyimpanan lokal tidak tersedia di peramban ini."));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("projects")) {
        const store = database.createObjectStore("projects", { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt");
        store.createIndex("deletedAt", "deletedAt");
      }
      if (!database.objectStoreNames.contains("features")) {
        const store = database.createObjectStore("features", { keyPath: "id" });
        store.createIndex("projectId", "projectId");
        store.createIndex("deletedAt", "deletedAt");
      }
      if (!database.objectStoreNames.contains("points")) {
        const store = database.createObjectStore("points", { keyPath: "id" });
        store.createIndex("featureId", "featureId");
        store.createIndex("mentionedOn", "mentionedOn");
        store.createIndex("deletedAt", "deletedAt");
      }
      if (!database.objectStoreNames.contains("attachments")) {
        const store = database.createObjectStore("attachments", { keyPath: "id" });
        store.createIndex("ownerId", "ownerId");
        store.createIndex("ownerType", "ownerType");
        store.createIndex("deletedAt", "deletedAt");
      }
      if (!database.objectStoreNames.contains("settings")) {
        database.createObjectStore("settings", { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Gagal membuka penyimpanan lokal."));
    request.onblocked = () => reject(new Error("Penyimpanan sedang digunakan di tab lain."));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Gagal membaca penyimpanan lokal."));
  });
}

function transactionResult(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Perubahan lokal gagal disimpan."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Perubahan lokal dibatalkan."));
  });
}

export async function loadSnapshot(): Promise<DatabaseSnapshot> {
  const database = await openDatabase();
  const transaction = database.transaction([...STORE_NAMES], "readonly");
  const done = transactionResult(transaction);
  try {
    const projectsRequest = requestResult<ProjectRecord[]>(transaction.objectStore("projects").getAll());
    const featuresRequest = requestResult<FeatureRecord[]>(transaction.objectStore("features").getAll());
    const pointsRequest = requestResult<PointRecord[]>(transaction.objectStore("points").getAll());
    const attachmentsRequest = requestResult<StoredAttachment[]>(
      transaction.objectStore("attachments").getAll(),
    );
    const settingsRequest = requestResult<SettingRecord[]>(transaction.objectStore("settings").getAll());
    const [projects, features, points, storedAttachments, settings] = await Promise.all([
      projectsRequest,
      featuresRequest,
      pointsRequest,
      attachmentsRequest,
      settingsRequest,
    ]);
    await done;
    return {
      projects,
      features,
      points,
      attachments: storedAttachments.map(({ blob: _blob, ...attachment }) => attachment),
      lastBackupAt: settings.find((setting) => setting.key === "lastBackupAt")?.value ?? null,
    };
  } finally {
    database.close();
  }
}

export async function getAttachment(id: string): Promise<StoredAttachment | null> {
  const database = await openDatabase();
  const transaction = database.transaction("attachments", "readonly");
  const done = transactionResult(transaction);
  try {
    const attachment = await requestResult<StoredAttachment | undefined>(
      transaction.objectStore("attachments").get(id),
    );
    await done;
    return attachment ?? null;
  } finally {
    database.close();
  }
}

export async function saveProject(record: ProjectRecord): Promise<void> {
  await saveRecord("projects", record);
}

export async function saveFeature(record: FeatureRecord): Promise<void> {
  await saveRecord("features", record);
}

export async function savePoint(record: PointRecord): Promise<void> {
  await saveRecord("points", record);
}

export async function saveAttachment(record: StoredAttachment): Promise<void> {
  await saveRecord("attachments", record);
}

async function saveRecord(storeName: (typeof STORE_NAMES)[number], record: unknown): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(storeName, "readwrite");
  const done = transactionResult(transaction);
  try {
    transaction.objectStore(storeName).put(record);
    await done;
  } finally {
    database.close();
  }
}

export async function markDeleted(type: TrashType, id: string): Promise<void> {
  const storeName = type === "attachment" ? "attachments" : `${type}s`;
  const database = await openDatabase();
  const transaction = database.transaction(storeName, "readwrite");
  const done = transactionResult(transaction);
  try {
    const store = transaction.objectStore(storeName);
    const record = (await requestResult<Record<string, unknown> | undefined>(store.get(id))) ?? null;
    if (record) store.put({ ...record, deletedAt: currentTimestamp() });
    await done;
  } finally {
    database.close();
  }
}

export async function restoreDeleted(type: TrashType, id: string): Promise<void> {
  const storeName = type === "attachment" ? "attachments" : `${type}s`;
  const database = await openDatabase();
  const transaction = database.transaction(storeName, "readwrite");
  const done = transactionResult(transaction);
  try {
    const store = transaction.objectStore(storeName);
    const record = (await requestResult<Record<string, unknown> | undefined>(store.get(id))) ?? null;
    if (record) store.put({ ...record, deletedAt: null });
    await done;
  } finally {
    database.close();
  }
}

export async function purgeDeleted(type: TrashType, id: string): Promise<void> {
  if (type === "attachment") {
    await deleteFromStore("attachments", id);
    return;
  }

  const snapshot = await loadSnapshot();
  const featureIds = type === "project"
    ? snapshot.features.filter((feature) => feature.projectId === id).map((feature) => feature.id)
    : type === "feature" ? [id] : [];
  const pointIds = type === "point"
    ? [id]
    : snapshot.points.filter((point) => featureIds.includes(point.featureId)).map((point) => point.id);
  const attachmentIds = snapshot.attachments
    .filter((attachment) => {
      if (type === "project" && attachment.ownerType === "project" && attachment.ownerId === id) return true;
      if (attachment.ownerType === "feature" && featureIds.includes(attachment.ownerId)) return true;
      return attachment.ownerType === "point" && pointIds.includes(attachment.ownerId);
    })
    .map((attachment) => attachment.id);

  const database = await openDatabase();
  const transaction = database.transaction(["projects", "features", "points", "attachments"], "readwrite");
  const done = transactionResult(transaction);
  try {
    if (type === "project") transaction.objectStore("projects").delete(id);
    for (const featureId of featureIds) transaction.objectStore("features").delete(featureId);
    for (const pointId of pointIds) transaction.objectStore("points").delete(pointId);
    for (const attachmentId of attachmentIds) transaction.objectStore("attachments").delete(attachmentId);
    await done;
  } finally {
    database.close();
  }
}

async function deleteFromStore(storeName: string, id: string): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(storeName, "readwrite");
  const done = transactionResult(transaction);
  try {
    transaction.objectStore(storeName).delete(id);
    await done;
  } finally {
    database.close();
  }
}

export async function saveLastBackupAt(value: string): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction("settings", "readwrite");
  const done = transactionResult(transaction);
  try {
    transaction.objectStore("settings").put({ key: "lastBackupAt", value } satisfies SettingRecord);
    await done;
  } finally {
    database.close();
  }
}

export async function replaceAllData(
  snapshot: DatabaseSnapshot,
  attachments: StoredAttachment[],
): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction([...STORE_NAMES], "readwrite");
  const done = transactionResult(transaction);
  try {
    for (const storeName of STORE_NAMES) transaction.objectStore(storeName).clear();
    for (const project of snapshot.projects) transaction.objectStore("projects").put(project);
    for (const feature of snapshot.features) transaction.objectStore("features").put(feature);
    for (const point of snapshot.points) transaction.objectStore("points").put(point);
    for (const attachment of attachments) transaction.objectStore("attachments").put(attachment);
    if (snapshot.lastBackupAt) {
      transaction.objectStore("settings").put({ key: "lastBackupAt", value: snapshot.lastBackupAt } satisfies SettingRecord);
    }
    await done;
  } finally {
    database.close();
  }
}