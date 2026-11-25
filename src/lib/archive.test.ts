import { strFromU8, unzipSync } from "fflate";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DatabaseSnapshot, StoredAttachment } from "@/lib/local-db";

const memoryState: {
  snapshot: DatabaseSnapshot;
  attachments: Map<string, StoredAttachment>;
  replaced: { snapshot: DatabaseSnapshot; attachments: StoredAttachment[] } | null;
} = {
  snapshot: {
    projects: [],
    features: [],
    points: [],
    attachments: [],
    lastBackupAt: null,
  },
  attachments: new Map(),
  replaced: null,
};

vi.mock("@/lib/local-db", async () => {
  const actual = await vi.importActual<typeof import("@/lib/local-db")>("@/lib/local-db");
  return {
    ...actual,
    loadSnapshot: vi.fn(async () => memoryState.snapshot),
    getAttachment: vi.fn(async (id: string) => memoryState.attachments.get(id) ?? null),
    replaceAllData: vi.fn(async (snapshot: DatabaseSnapshot, attachments: StoredAttachment[]) => {
      memoryState.replaced = { snapshot, attachments };
      memoryState.snapshot = snapshot;
      memoryState.attachments = new Map(attachments.map((item) => [item.id, item]));
    }),
  };
});

import {
  createBackupArchive,
  createJsonExport,
  createProjectMarkdownArchive,
  restoreBackupArchive,
  restoreBackupFile,
} from "@/lib/archive";

describe("archive export and restore", () => {
  beforeEach(() => {
    const pngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const attachmentMeta = {
      id: "att-1",
      ownerType: "point" as const,
      ownerId: "point-1",
      originalName: "alur-invoice.png",
      mimeType: "image/png",
      size: pngBytes.byteLength,
      caption: "Contoh invoice",
      createdAt: "2026-11-02T00:00:00.000Z",
      deletedAt: null,
    };

    memoryState.snapshot = {
      projects: [
        {
          id: "project-1",
          name: "Portal Klaim",
          customerName: "PT Nusantara",
          description: "Dokumentasi klaim",
          status: "active",
          processFlow: "1. Upload dokumen -> 2. Verifikasi",
          createdAt: "2026-11-01T00:00:00.000Z",
          updatedAt: "2026-11-04T00:00:00.000Z",
          deletedAt: null,
        },
      ],
      features: [
        {
          id: "feature-1",
          projectId: "project-1",
          name: "Ekspor Invoice",
          flowNotes: "Cetak laporan bulanan",
          sortOrder: 0,
          createdAt: "2026-11-01T00:00:00.000Z",
          updatedAt: "2026-11-03T00:00:00.000Z",
          deletedAt: null,
        },
      ],
      points: [
        {
          id: "point-1",
          featureId: "feature-1",
          content: "Harus mendukung format PDF",
          mentionedOn: "2026-11-02",
          source: "Meeting",
          statedBy: "Dina",
          sortOrder: 0,
          createdAt: "2026-11-02T00:00:00.000Z",
          updatedAt: "2026-11-02T00:00:00.000Z",
          deletedAt: null,
        },
      ],
      attachments: [attachmentMeta],
      lastBackupAt: "2026-11-04T01:00:00.000Z",
    };

    memoryState.attachments = new Map([
      [
        "att-1",
        {
          ...attachmentMeta,
          blob: new Blob([pngBytes], { type: "image/png" }),
        },
      ],
    ]);
    memoryState.replaced = null;
  });

  it("round-trips a full zip backup archive with attachments", async () => {
    const zipBlob = await createBackupArchive();
    const file = new File([zipBlob], "backup.zip", { type: "application/zip" });

    memoryState.snapshot = {
      projects: [],
      features: [],
      points: [],
      attachments: [],
      lastBackupAt: null,
    };
    memoryState.attachments.clear();

    await restoreBackupArchive(file);

    expect(memoryState.replaced?.snapshot.projects).toHaveLength(1);
    expect(memoryState.replaced?.snapshot.points[0]?.content).toBe("Harus mendukung format PDF");
    expect(memoryState.replaced?.attachments).toHaveLength(1);
    expect(memoryState.replaced?.attachments[0]?.blob.size).toBe(8);
  });

  it("round-trips a JSON export via restoreBackupFile", async () => {
    const jsonBlob = await createJsonExport();
    const file = new File([jsonBlob], "export.json", { type: "application/json" });

    memoryState.snapshot = {
      projects: [],
      features: [],
      points: [],
      attachments: [],
      lastBackupAt: null,
    };
    memoryState.attachments.clear();

    await restoreBackupFile(file);

    expect(memoryState.replaced?.snapshot.features[0]?.name).toBe("Ekspor Invoice");
    expect(memoryState.replaced?.attachments[0]?.originalName).toBe("alur-invoice.png");
    expect(memoryState.replaced?.attachments[0]?.blob.size).toBe(8);
  });

  it("builds a project Markdown zip archive with embedded attachment files", async () => {
    const mdZipBlob = await createProjectMarkdownArchive("project-1");
    const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(mdZipBlob);
    });
    const entries = unzipSync(new Uint8Array(buffer));

    const markdownBytes = entries["Portal-Klaim.md"];
    expect(markdownBytes).toBeDefined();
    const markdown = strFromU8(markdownBytes!);
    expect(markdown).toContain("# Portal Klaim");
    expect(markdown).toContain("PT Nusantara");
    expect(markdown).toContain("Harus mendukung format PDF");
    expect(markdown).toContain("attachments/att-1.png");
    expect(entries["attachments/att-1.png"]).toHaveLength(8);
  });
});
