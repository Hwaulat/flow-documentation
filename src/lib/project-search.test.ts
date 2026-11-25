import { describe, expect, it } from "vitest";

import { searchDocumentation } from "@/lib/project-search";
import type { DatabaseSnapshot } from "@/lib/local-db";

const snapshot: DatabaseSnapshot = {
  projects: [
    {
      id: "project-1",
      name: "Portal pelanggan",
      customerName: "Acme",
      description: "Pembaruan administrasi",
      status: "active",
      processFlow: "Verifikasi invoice sebelum export",
      createdAt: "2026-11-01T00:00:00.000Z",
      updatedAt: "2026-11-04T00:00:00.000Z",
      deletedAt: null,
    },
  ],
  features: [
    {
      id: "feature-1",
      projectId: "project-1",
      name: "Ekspor invoice",
      flowNotes: "",
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
      content: "Pelanggan meminta format invoice PDF",
      mentionedOn: "2026-11-02",
      source: "Meeting",
      statedBy: "Dina",
      sortOrder: 0,
      createdAt: "2026-11-02T00:00:00.000Z",
      updatedAt: "2026-11-02T00:00:00.000Z",
      deletedAt: null,
    },
  ],
  attachments: [],
  lastBackupAt: null,
};

describe("searchDocumentation", () => {
  it("matches case-insensitive word prefixes across project flow and feature content", () => {
    const results = searchDocumentation(snapshot, "VER inv");

    expect(results.map((result) => result.kind)).toContain("project");
    expect(results.map((result) => result.kind)).toContain("feature");
  });

  it("requires every query word to match", () => {
    const results = searchDocumentation(snapshot, "invoice nonexistent");

    expect(results).toHaveLength(0);
  });

  it("filters point results by source and mentioned date", () => {
    const results = searchDocumentation(snapshot, "format inv", {
      source: "Meeting",
      dateFrom: "2026-11-02",
      dateTo: "2026-11-02",
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe("point-1");
  });
});