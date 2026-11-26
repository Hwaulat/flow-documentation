import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

import {
  getAttachment,
  loadSnapshot,
  replaceAllData,
  type AttachmentRecord,
  type DatabaseSnapshot,
  type StoredAttachment,
} from "@/lib/local-db";

interface BackupManifest {
  formatVersion: 1;
  exportedAt: string;
  snapshot: DatabaseSnapshot;
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function readBlobBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === "function") {
    return blob.arrayBuffer().then((buffer) => new Uint8Array(buffer));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(new Uint8Array(reader.result));
      } else {
        reject(new Error("Gagal membaca data biner."));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error("Gagal membaca file."));
    reader.readAsArrayBuffer(blob);
  });
}

function readBlobText(blob: Blob): Promise<string> {
  if (typeof blob.text === "function") {
    return blob.text();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Gagal membaca isi teks file."));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error("Gagal membaca file teks."));
    reader.readAsText(blob);
  });
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function safeFileName(value: string): string {
  return value.trim().replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/^-|-$/g, "") || "project";
}

export async function createBackupArchive(): Promise<Blob> {
  const snapshot = await loadSnapshot();
  const manifest: BackupManifest = {
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    snapshot,
  };
  const files: Record<string, Uint8Array> = {
    "manifest.json": strToU8(JSON.stringify(manifest)),
  };

  for (const attachment of snapshot.attachments) {
    const stored = await getAttachment(attachment.id);
    if (!stored) throw new Error(`Lampiran “${attachment.originalName}” tidak ditemukan.`);
    files[`attachments/${attachment.id}`] = await readBlobBytes(stored.blob);
  }

  const bytes = zipSync(files, { level: 6 });
  return new Blob([asArrayBuffer(bytes)], { type: "application/zip" });
}

export async function createJsonExport(): Promise<Blob> {
  const snapshot = await loadSnapshot();
  const attachments = await Promise.all(
    snapshot.attachments.map(async (attachment) => {
      const stored = await getAttachment(attachment.id);
      if (!stored) throw new Error(`Lampiran “${attachment.originalName}” tidak ditemukan.`);
      return {
        ...attachment,
        dataBase64: bytesToBase64(await readBlobBytes(stored.blob)),
      };
    }),
  );
  return new Blob(
    [JSON.stringify({ formatVersion: 1, exportedAt: new Date().toISOString(), snapshot: { ...snapshot, attachments } }, null, 2)],
    { type: "application/json" },
  );
}

export async function restoreBackupArchive(file: File): Promise<void> {
  const archive = unzipSync(await readBlobBytes(file));
  const manifestBytes = archive["manifest.json"];
  if (!manifestBytes) throw new Error("Cadangan ini tidak memiliki manifest yang valid.");

  let manifest: BackupManifest;
  try {
    manifest = JSON.parse(strFromU8(manifestBytes)) as BackupManifest;
  } catch {
    throw new Error("Isi file cadangan tidak dapat dibaca.");
  }
  if (manifest.formatVersion !== 1 || !manifest.snapshot || !Array.isArray(manifest.snapshot.projects)) {
    throw new Error("Versi file cadangan tidak didukung.");
  }

  const attachments = manifest.snapshot.attachments.map((metadata: AttachmentRecord) => {
    const bytes = archive[`attachments/${metadata.id}`];
    if (!bytes) throw new Error(`Data gambar “${metadata.originalName}” tidak lengkap.`);
    return {
      ...metadata,
      blob: new Blob([asArrayBuffer(bytes)], { type: metadata.mimeType }),
    } satisfies StoredAttachment;
  });
  await replaceAllData(manifest.snapshot, attachments);
}

export async function createProjectMarkdownArchive(projectId: string): Promise<Blob> {
  const snapshot = await loadSnapshot();
  const project = snapshot.projects.find((candidate) => candidate.id === projectId && candidate.deletedAt === null);
  if (!project) throw new Error("Proyek tidak ditemukan.");
  const features = snapshot.features
    .filter((feature) => feature.projectId === projectId && feature.deletedAt === null)
    .sort((left, right) => left.sortOrder - right.sortOrder);
  const points = snapshot.points.filter((point) => point.deletedAt === null);
  const files: Record<string, Uint8Array> = {};
  const markdown: string[] = [
    `# ${project.name}`,
    "",
    `**Pelanggan:** ${project.customerName || "—"}`,
    `**Status:** ${project.status}`,
    `**Diperbarui:** ${new Date(project.updatedAt).toLocaleString("id-ID")}`,
    "",
    ...(project.description ? ["## Deskripsi", "", project.description, ""] : []),
    ...(project.processFlow ? ["## Alur proses", "", project.processFlow, ""] : []),
  ];

  const projectAttachments = snapshot.attachments.filter(
    (attachment) => attachment.deletedAt === null && attachment.ownerType === "project" && attachment.ownerId === projectId,
  );
  for (const attachment of projectAttachments) {
    const stored = await getAttachment(attachment.id);
    if (!stored) continue;
    const extension = attachment.originalName.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "") || "img";
    const path = `attachments/${attachment.id}.${extension}`;
    files[path] = await readBlobBytes(stored.blob);
    markdown.push(`![${attachment.caption || attachment.originalName}](${path})`, "");
  }

  for (const feature of features) {
    markdown.push(`## ${feature.name}`, "", ...(feature.flowNotes ? [feature.flowNotes, ""] : []));
    const featureAttachments = snapshot.attachments.filter(
      (attachment) => attachment.deletedAt === null && attachment.ownerType === "feature" && attachment.ownerId === feature.id,
    );
    for (const attachment of featureAttachments) {
      const stored = await getAttachment(attachment.id);
      if (!stored) continue;
      const extension = attachment.originalName.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "") || "img";
      const path = `attachments/${attachment.id}.${extension}`;
      files[path] = await readBlobBytes(stored.blob);
      markdown.push(`![${attachment.caption || attachment.originalName}](${path})`, "");
    }

    const featurePoints = points
      .filter((point) => point.featureId === feature.id)
      .sort((left, right) => left.sortOrder - right.sortOrder);
    if (featurePoints.length > 0) markdown.push("### Catatan pelanggan", "");
    for (const point of featurePoints) {
      markdown.push(`- **${point.mentionedOn} · ${point.source}${point.statedBy ? ` · ${point.statedBy}` : ""}** — ${point.content}`);
      const pointAttachments = snapshot.attachments.filter(
        (attachment) => attachment.deletedAt === null && attachment.ownerType === "point" && attachment.ownerId === point.id,
      );
      for (const attachment of pointAttachments) {
        const stored = await getAttachment(attachment.id);
        if (!stored) continue;
        const extension = attachment.originalName.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "") || "img";
        const path = `attachments/${attachment.id}.${extension}`;
        files[path] = await readBlobBytes(stored.blob);
        markdown.push(`  - ![${attachment.caption || attachment.originalName}](${path})`);
      }
    }
    markdown.push("");
  }

  files[`${safeFileName(project.name)}.md`] = strToU8(markdown.join("\n"));
  return new Blob([asArrayBuffer(zipSync(files, { level: 6 }))], { type: "application/zip" });
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

interface JsonExportAttachment extends AttachmentRecord {
  dataBase64: string;
}

interface JsonExportPayload {
  formatVersion: 1;
  exportedAt: string;
  snapshot: Omit<DatabaseSnapshot, "attachments"> & {
    attachments: JsonExportAttachment[];
  };
}

export async function restoreBackupFile(file: File): Promise<void> {
  if (file.name.toLowerCase().endsWith(".json") || file.type === "application/json") {
    let payload: JsonExportPayload;
    try {
      payload = JSON.parse(await readBlobText(file)) as JsonExportPayload;
    } catch {
      throw new Error("File JSON tidak dapat dibaca.");
    }
    if (payload.formatVersion !== 1 || !payload.snapshot || !Array.isArray(payload.snapshot.projects)) {
      throw new Error("Format file JSON cadangan tidak didukung.");
    }
    const attachments: StoredAttachment[] = (payload.snapshot.attachments ?? []).map(
      ({ dataBase64, ...metadata }) => {
        if (typeof dataBase64 !== "string") {
          throw new Error(`Data gambar “${metadata.originalName}” tidak lengkap.`);
        }
        return {
          ...metadata,
          blob: new Blob([asArrayBuffer(base64ToBytes(dataBase64))], { type: metadata.mimeType }),
        };
      },
    );
    const snapshot: DatabaseSnapshot = {
      projects: payload.snapshot.projects,
      features: payload.snapshot.features ?? [],
      points: payload.snapshot.points ?? [],
      attachments: attachments.map(({ blob: _blob, ...meta }) => meta),
      lastBackupAt: payload.snapshot.lastBackupAt ?? null,
    };
    await replaceAllData(snapshot, attachments);
    return;
  }

  await restoreBackupArchive(file);
}

export function backupFileName(prefix: string, extension: string): string {
  const datePart = new Date().toISOString().slice(0, 10);
  return `${prefix}-${datePart}.${extension}`;
}

export function downloadFile(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 4_000);
}

export function projectExportName(projectName: string, extension: string): string {
  return `${safeFileName(projectName)}.${extension}`;
}