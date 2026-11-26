import {
  formatSupabaseError,
  getSupabaseClient,
  SUPABASE_STORAGE_BUCKET,
} from "@/lib/supabase";

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

interface ProjectRow {
  id: string;
  name: string;
  customer_name: string;
  description: string;
  status: ProjectStatus;
  process_flow: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface FeatureRow {
  id: string;
  project_id: string;
  name: string;
  flow_notes: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface PointRow {
  id: string;
  feature_id: string;
  content: string;
  mentioned_on: string;
  source: PointSource;
  stated_by: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface AttachmentRow {
  id: string;
  owner_type: AttachmentOwnerType;
  owner_id: string;
  original_name: string;
  mime_type: string;
  size: number;
  caption: string;
  storage_path: string;
  created_at: string;
  deleted_at: string | null;
}

interface AppSettingRow {
  key: string;
  value: string;
}

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

function toProjectRecord(row: ProjectRow): ProjectRecord {
  return {
    id: row.id,
    name: row.name,
    customerName: row.customer_name,
    description: row.description,
    status: row.status,
    processFlow: row.process_flow,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function toProjectRow(record: ProjectRecord): ProjectRow {
  return {
    id: record.id,
    name: record.name,
    customer_name: record.customerName,
    description: record.description,
    status: record.status,
    process_flow: record.processFlow,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    deleted_at: record.deletedAt,
  };
}

function toFeatureRecord(row: FeatureRow): FeatureRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    flowNotes: row.flow_notes,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function toFeatureRow(record: FeatureRecord): FeatureRow {
  return {
    id: record.id,
    project_id: record.projectId,
    name: record.name,
    flow_notes: record.flowNotes,
    sort_order: record.sortOrder,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    deleted_at: record.deletedAt,
  };
}

function toPointRecord(row: PointRow): PointRecord {
  return {
    id: row.id,
    featureId: row.feature_id,
    content: row.content,
    mentionedOn: row.mentioned_on,
    source: row.source,
    statedBy: row.stated_by,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function toPointRow(record: PointRecord): PointRow {
  return {
    id: record.id,
    feature_id: record.featureId,
    content: record.content,
    mentioned_on: record.mentionedOn,
    source: record.source,
    stated_by: record.statedBy,
    sort_order: record.sortOrder,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    deleted_at: record.deletedAt,
  };
}

function toAttachmentRecord(row: AttachmentRow): AttachmentRecord {
  return {
    id: row.id,
    ownerType: row.owner_type,
    ownerId: row.owner_id,
    originalName: row.original_name,
    mimeType: row.mime_type,
    size: row.size,
    caption: row.caption,
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
  };
}

function buildStoragePath(attachment: Pick<AttachmentRecord, "id" | "ownerType" | "ownerId" | "originalName">): string {
  const ext = attachment.originalName.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "bin";
  return `${attachment.ownerType}/${attachment.ownerId}/${attachment.id}.${ext}`;
}

function toAttachmentRow(record: AttachmentRecord, storagePath?: string): AttachmentRow {
  return {
    id: record.id,
    owner_type: record.ownerType,
    owner_id: record.ownerId,
    original_name: record.originalName,
    mime_type: record.mimeType,
    size: record.size,
    caption: record.caption,
    storage_path: storagePath ?? buildStoragePath(record),
    created_at: record.createdAt,
    deleted_at: record.deletedAt,
  };
}

export async function loadSnapshot(): Promise<DatabaseSnapshot> {
  const supabase = getSupabaseClient();
  const [projectsRes, featuresRes, pointsRes, attachmentsRes, settingsRes] = await Promise.all([
    supabase.from("projects").select("*"),
    supabase.from("features").select("*"),
    supabase.from("points").select("*"),
    supabase.from("attachments").select("*"),
    supabase.from("app_settings").select("*"),
  ]);

  const firstError =
    projectsRes.error ??
    featuresRes.error ??
    pointsRes.error ??
    attachmentsRes.error ??
    settingsRes.error;
  if (firstError) {
    throw formatSupabaseError(firstError, "Gagal memuat data dari Supabase.");
  }

  const projects = ((projectsRes.data ?? []) as ProjectRow[]).map(toProjectRecord);
  const features = ((featuresRes.data ?? []) as FeatureRow[]).map(toFeatureRecord);
  const points = ((pointsRes.data ?? []) as PointRow[]).map(toPointRecord);
  const attachments = ((attachmentsRes.data ?? []) as AttachmentRow[]).map(toAttachmentRecord);
  const settings = (settingsRes.data ?? []) as AppSettingRow[];

  return {
    projects,
    features,
    points,
    attachments,
    lastBackupAt: settings.find((setting) => setting.key === "lastBackupAt")?.value ?? null,
  };
}

export async function getAttachment(id: string): Promise<StoredAttachment | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("attachments")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw formatSupabaseError(error, "Gagal membaca metadata lampiran.");
  if (!data) return null;

  const row = data as AttachmentRow;
  const { data: blob, error: storageError } = await supabase.storage
    .from(SUPABASE_STORAGE_BUCKET)
    .download(row.storage_path);
  if (storageError || !blob) {
    throw formatSupabaseError(storageError, `Gagal mengunduh gambar “${row.original_name}”.`);
  }

  return {
    ...toAttachmentRecord(row),
    blob,
  };
}

export async function saveProject(record: ProjectRecord): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("projects")
    .upsert(toProjectRow(record), { onConflict: "id" });
  if (error) throw formatSupabaseError(error, "Gagal menyimpan proyek ke Supabase.");
}

export async function saveFeature(record: FeatureRecord): Promise<void> {
  await saveFeatures([record]);
}

export async function saveFeatures(records: FeatureRecord[]): Promise<void> {
  if (records.length === 0) return;
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("features")
    .upsert(records.map(toFeatureRow), { onConflict: "id" });
  if (error) throw formatSupabaseError(error, "Gagal menyimpan fitur ke Supabase.");
}

export async function savePoint(record: PointRecord): Promise<void> {
  await savePoints([record]);
}

export async function savePoints(records: PointRecord[]): Promise<void> {
  if (records.length === 0) return;
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("points")
    .upsert(records.map(toPointRow), { onConflict: "id" });
  if (error) throw formatSupabaseError(error, "Gagal menyimpan poin pelanggan ke Supabase.");
}

export async function touchProject(projectId: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("projects")
    .update({ updated_at: currentTimestamp() })
    .eq("id", projectId);
  if (error) throw formatSupabaseError(error, "Gagal memperbarui waktu proyek.");
}

export async function saveAttachment(record: StoredAttachment): Promise<void> {
  const supabase = getSupabaseClient();
  const storagePath = buildStoragePath(record);

  const { error: uploadError } = await supabase.storage
    .from(SUPABASE_STORAGE_BUCKET)
    .upload(storagePath, record.blob, {
      contentType: record.mimeType,
      upsert: true,
    });
  if (uploadError) {
    throw formatSupabaseError(uploadError, `Gagal mengunggah gambar “${record.originalName}”.`);
  }

  const { error: dbError } = await supabase
    .from("attachments")
    .upsert(toAttachmentRow(record, storagePath), { onConflict: "id" });
  if (dbError) {
    throw formatSupabaseError(dbError, "Gagal menyimpan metadata lampiran.");
  }
}

export async function updateAttachmentCaption(id: string, caption: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("attachments").update({ caption }).eq("id", id);
  if (error) throw formatSupabaseError(error, "Gagal memperbarui keterangan gambar.");
}

export async function duplicatePointWithAttachments(
  sourcePoint: PointRecord,
  nextSortOrder: number,
): Promise<PointRecord> {
  const supabase = getSupabaseClient();
  const now = currentTimestamp();
  const duplicatedPoint: PointRecord = {
    ...sourcePoint,
    id: createId(),
    sortOrder: nextSortOrder,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };

  await savePoint(duplicatedPoint);

  const { data: rows, error: fetchError } = await supabase
    .from("attachments")
    .select("*")
    .eq("owner_type", "point")
    .eq("owner_id", sourcePoint.id)
    .is("deleted_at", null);

  if (fetchError) {
    throw formatSupabaseError(fetchError, "Gagal membaca lampiran poin yang diduplikasi.");
  }

  for (const row of (rows ?? []) as AttachmentRow[]) {
    const newId = createId();
    const newRecord: AttachmentRecord = {
      id: newId,
      ownerType: "point",
      ownerId: duplicatedPoint.id,
      originalName: row.original_name,
      mimeType: row.mime_type,
      size: row.size,
      caption: row.caption,
      createdAt: now,
      deletedAt: null,
    };
    const nextPath = buildStoragePath(newRecord);
    const { error: copyError } = await supabase.storage
      .from(SUPABASE_STORAGE_BUCKET)
      .copy(row.storage_path, nextPath);

    if (copyError) {
      const { data: downloaded } = await supabase.storage
        .from(SUPABASE_STORAGE_BUCKET)
        .download(row.storage_path);
      if (!downloaded) continue;
      const { error: uploadError } = await supabase.storage
        .from(SUPABASE_STORAGE_BUCKET)
        .upload(nextPath, downloaded, { contentType: row.mime_type, upsert: true });
      if (uploadError) continue;
    }

    const { error: insertError } = await supabase
      .from("attachments")
      .insert(toAttachmentRow(newRecord, nextPath));
    if (insertError) {
      throw formatSupabaseError(insertError, "Gagal menyalin metadata lampiran poin.");
    }
  }

  return duplicatedPoint;
}

function tableNameForType(type: TrashType): "projects" | "features" | "points" | "attachments" {
  return type === "attachment" ? "attachments" : `${type}s`;
}

export async function markDeleted(type: TrashType, id: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from(tableNameForType(type))
    .update({ deleted_at: currentTimestamp() })
    .eq("id", id);
  if (error) throw formatSupabaseError(error, "Gagal memindahkan item ke Sampah.");
}

export async function restoreDeleted(type: TrashType, id: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from(tableNameForType(type))
    .update({ deleted_at: null })
    .eq("id", id);
  if (error) throw formatSupabaseError(error, "Gagal memulihkan item dari Sampah.");
}

export async function restoreWithAncestors(type: TrashType, id: string): Promise<void> {
  const snapshot = await loadSnapshot();
  const projectIdsToRestore = new Set<string>();
  const featureIdsToRestore = new Set<string>();
  const pointIdsToRestore = new Set<string>();
  const attachmentIdsToRestore = new Set<string>();

  if (type === "project") {
    projectIdsToRestore.add(id);
  } else if (type === "feature") {
    featureIdsToRestore.add(id);
    const feature = snapshot.features.find((item) => item.id === id);
    if (feature) projectIdsToRestore.add(feature.projectId);
  } else if (type === "point") {
    pointIdsToRestore.add(id);
    const point = snapshot.points.find((item) => item.id === id);
    const feature = point ? snapshot.features.find((item) => item.id === point.featureId) : undefined;
    if (feature) {
      featureIdsToRestore.add(feature.id);
      projectIdsToRestore.add(feature.projectId);
    }
  } else if (type === "attachment") {
    attachmentIdsToRestore.add(id);
    const attachment = snapshot.attachments.find((item) => item.id === id);
    if (attachment?.ownerType === "project") {
      projectIdsToRestore.add(attachment.ownerId);
    } else if (attachment?.ownerType === "feature") {
      featureIdsToRestore.add(attachment.ownerId);
      const feature = snapshot.features.find((item) => item.id === attachment.ownerId);
      if (feature) projectIdsToRestore.add(feature.projectId);
    } else if (attachment?.ownerType === "point") {
      pointIdsToRestore.add(attachment.ownerId);
      const point = snapshot.points.find((item) => item.id === attachment.ownerId);
      const feature = point ? snapshot.features.find((item) => item.id === point.featureId) : undefined;
      if (feature) {
        featureIdsToRestore.add(feature.id);
        projectIdsToRestore.add(feature.projectId);
      }
    }
  }

  const supabase = getSupabaseClient();
  if (projectIdsToRestore.size > 0) {
    const { error } = await supabase
      .from("projects")
      .update({ deleted_at: null })
      .in("id", [...projectIdsToRestore]);
    if (error) throw formatSupabaseError(error, "Gagal memulihkan proyek.");
  }
  if (featureIdsToRestore.size > 0) {
    const { error } = await supabase
      .from("features")
      .update({ deleted_at: null })
      .in("id", [...featureIdsToRestore]);
    if (error) throw formatSupabaseError(error, "Gagal memulihkan fitur.");
  }
  if (pointIdsToRestore.size > 0) {
    const { error } = await supabase
      .from("points")
      .update({ deleted_at: null })
      .in("id", [...pointIdsToRestore]);
    if (error) throw formatSupabaseError(error, "Gagal memulihkan poin pelanggan.");
  }
  if (attachmentIdsToRestore.size > 0) {
    const { error } = await supabase
      .from("attachments")
      .update({ deleted_at: null })
      .in("id", [...attachmentIdsToRestore]);
    if (error) throw formatSupabaseError(error, "Gagal memulihkan lampiran gambar.");
  }
}

async function deleteAttachmentsAndStorage(attachmentIds: string[]): Promise<void> {
  if (attachmentIds.length === 0) return;
  const supabase = getSupabaseClient();
  const { data: rows, error: fetchError } = await supabase
    .from("attachments")
    .select("id, storage_path")
    .in("id", attachmentIds);
  if (fetchError) throw formatSupabaseError(fetchError, "Gagal membaca data lampiran.");

  const paths = ((rows ?? []) as Array<{ id: string; storage_path: string }>)
    .map((row) => row.storage_path)
    .filter(Boolean);
  if (paths.length > 0) {
    const { error: removeStorageError } = await supabase.storage
      .from(SUPABASE_STORAGE_BUCKET)
      .remove(paths);
    if (removeStorageError) {
      throw formatSupabaseError(removeStorageError, "Gagal menghapus file gambar di Supabase Storage.");
    }
  }

  const { error: deleteError } = await supabase.from("attachments").delete().in("id", attachmentIds);
  if (deleteError) throw formatSupabaseError(deleteError, "Gagal menghapus metadata lampiran.");
}

export async function purgeDeleted(type: TrashType, id: string): Promise<void> {
  if (type === "attachment") {
    await deleteAttachmentsAndStorage([id]);
    return;
  }

  const snapshot = await loadSnapshot();
  const featureIds =
    type === "project"
      ? snapshot.features.filter((feature) => feature.projectId === id).map((feature) => feature.id)
      : type === "feature"
        ? [id]
        : [];
  const pointIds =
    type === "point"
      ? [id]
      : snapshot.points
          .filter((point) => featureIds.includes(point.featureId))
          .map((point) => point.id);
  const attachmentIds = snapshot.attachments
    .filter((attachment) => {
      if (type === "project" && attachment.ownerType === "project" && attachment.ownerId === id) {
        return true;
      }
      if (attachment.ownerType === "feature" && featureIds.includes(attachment.ownerId)) {
        return true;
      }
      return attachment.ownerType === "point" && pointIds.includes(attachment.ownerId);
    })
    .map((attachment) => attachment.id);

  await deleteAttachmentsAndStorage(attachmentIds);

  const supabase = getSupabaseClient();
  if (type === "project") {
    const { error } = await supabase.from("projects").delete().eq("id", id);
    if (error) throw formatSupabaseError(error, "Gagal menghapus proyek permanen.");
  } else if (type === "feature") {
    const { error } = await supabase.from("features").delete().eq("id", id);
    if (error) throw formatSupabaseError(error, "Gagal menghapus fitur permanen.");
  } else if (type === "point") {
    const { error } = await supabase.from("points").delete().eq("id", id);
    if (error) throw formatSupabaseError(error, "Gagal menghapus poin permanen.");
  }
}

export async function purgeAllTrash(): Promise<void> {
  const snapshot = await loadSnapshot();
  const trashedProjectIds = new Set(
    snapshot.projects.filter((project) => project.deletedAt !== null).map((project) => project.id),
  );
  const trashedFeatureIds = new Set(
    snapshot.features
      .filter((feature) => feature.deletedAt !== null || trashedProjectIds.has(feature.projectId))
      .map((feature) => feature.id),
  );
  const trashedPointIds = new Set(
    snapshot.points
      .filter((point) => point.deletedAt !== null || trashedFeatureIds.has(point.featureId))
      .map((point) => point.id),
  );
  const trashedAttachmentIds = snapshot.attachments
    .filter((attachment) => {
      if (attachment.deletedAt !== null) return true;
      if (attachment.ownerType === "project" && trashedProjectIds.has(attachment.ownerId)) {
        return true;
      }
      if (attachment.ownerType === "feature" && trashedFeatureIds.has(attachment.ownerId)) {
        return true;
      }
      return attachment.ownerType === "point" && trashedPointIds.has(attachment.ownerId);
    })
    .map((attachment) => attachment.id);

  await deleteAttachmentsAndStorage(trashedAttachmentIds);

  const supabase = getSupabaseClient();
  if (trashedPointIds.size > 0) {
    const { error } = await supabase.from("points").delete().in("id", [...trashedPointIds]);
    if (error) throw formatSupabaseError(error, "Gagal menghapus poin di Sampah.");
  }
  if (trashedFeatureIds.size > 0) {
    const { error } = await supabase.from("features").delete().in("id", [...trashedFeatureIds]);
    if (error) throw formatSupabaseError(error, "Gagal menghapus fitur di Sampah.");
  }
  if (trashedProjectIds.size > 0) {
    const { error } = await supabase.from("projects").delete().in("id", [...trashedProjectIds]);
    if (error) throw formatSupabaseError(error, "Gagal menghapus proyek di Sampah.");
  }
}

export async function saveLastBackupAt(value: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("app_settings")
    .upsert({ key: "lastBackupAt", value } satisfies AppSettingRow, { onConflict: "key" });
  if (error) throw formatSupabaseError(error, "Gagal menyimpan status cadangan.");
}

export async function clearAllLocalData(): Promise<void> {
  const supabase = getSupabaseClient();
  const { data: attRows, error: attErr } = await supabase
    .from("attachments")
    .select("id, storage_path");
  if (attErr) throw formatSupabaseError(attErr, "Gagal membaca lampiran sebelum reset.");

  const paths = ((attRows ?? []) as Array<{ id: string; storage_path: string }>)
    .map((item) => item.storage_path)
    .filter(Boolean);
  if (paths.length > 0) {
    const { error: rmErr } = await supabase.storage.from(SUPABASE_STORAGE_BUCKET).remove(paths);
    if (rmErr) throw formatSupabaseError(rmErr, "Gagal menghapus file di Supabase Storage.");
  }

  const allAttachmentIds = ((attRows ?? []) as Array<{ id: string }>).map((item) => item.id);
  if (allAttachmentIds.length > 0) {
    const { error } = await supabase.from("attachments").delete().in("id", allAttachmentIds);
    if (error) throw formatSupabaseError(error, "Gagal menghapus tabel lampiran.");
  }

  const { data: projRows, error: projFetchErr } = await supabase.from("projects").select("id");
  if (projFetchErr) throw formatSupabaseError(projFetchErr, "Gagal membaca daftar proyek.");
  const projectIds = ((projRows ?? []) as Array<{ id: string }>).map((item) => item.id);
  if (projectIds.length > 0) {
    const { error } = await supabase.from("projects").delete().in("id", projectIds);
    if (error) throw formatSupabaseError(error, "Gagal mengosongkan tabel proyek.");
  }

  const { error: settingsErr } = await supabase
    .from("app_settings")
    .delete()
    .neq("key", "__keep__");
  if (settingsErr) throw formatSupabaseError(settingsErr, "Gagal mengosongkan pengaturan.");
}

export async function replaceAllData(
  snapshot: DatabaseSnapshot,
  attachments: StoredAttachment[],
): Promise<void> {
  await clearAllLocalData();

  const supabase = getSupabaseClient();
  if (snapshot.projects.length > 0) {
    const { error } = await supabase
      .from("projects")
      .insert(snapshot.projects.map(toProjectRow));
    if (error) throw formatSupabaseError(error, "Gagal memulihkan data proyek.");
  }
  if (snapshot.features.length > 0) {
    const { error } = await supabase
      .from("features")
      .insert(snapshot.features.map(toFeatureRow));
    if (error) throw formatSupabaseError(error, "Gagal memulihkan data fitur.");
  }
  if (snapshot.points.length > 0) {
    const { error } = await supabase
      .from("points")
      .insert(snapshot.points.map(toPointRow));
    if (error) throw formatSupabaseError(error, "Gagal memulihkan data poin pelanggan.");
  }
  for (const attachment of attachments) {
    await saveAttachment(attachment);
  }
  if (snapshot.lastBackupAt) {
    await saveLastBackupAt(snapshot.lastBackupAt);
  }
}
