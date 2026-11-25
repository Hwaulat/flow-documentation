import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DatabaseSnapshot, ProjectRecord } from "@/lib/local-db";

const navigateMock = vi.fn();
const reloadMock = vi.fn(async () => {});
const saveProjectMock = vi.fn(async (_record: ProjectRecord) => {});

const sampleSnapshot: DatabaseSnapshot = {
  projects: [
    {
      id: "project-1",
      name: "Portal Pelanggan",
      customerName: "PT Maju Bersama",
      description: "Dokumentasi alur klaim dan faktur",
      status: "active",
      processFlow: "Verifikasi invoice sebelum ekspor PDF",
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
      flowNotes: "Rekap bulanan pelanggan",
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

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-router")>(
    "@tanstack/react-router",
  );
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock("@/lib/app-data", () => ({
  useAppData: () => ({
    snapshot: sampleSnapshot,
    ready: true,
    storageError: null,
    reload: reloadMock,
  }),
}));

vi.mock("@/lib/local-db", async () => {
  const actual = await vi.importActual<typeof import("@/lib/local-db")>("@/lib/local-db");
  return {
    ...actual,
    saveProject: (...args: Parameters<typeof actual.saveProject>) => saveProjectMock(...args),
  };
});

import { GlobalSearchDialog } from "@/components/GlobalSearchDialog";
import { ProjectFormDialog } from "@/components/ProjectFormDialog";

describe("UI workflows", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    reloadMock.mockClear();
    saveProjectMock.mockClear();
  });

  it("filters global search results and navigates to matching target", async () => {
    const onOpenChange = vi.fn();
    render(<GlobalSearchDialog open onOpenChange={onOpenChange} />);

    const searchInput = screen.getByLabelText("Kata kunci pencarian global");
    fireEvent.change(searchInput, { target: { value: "format inv" } });

    expect(await screen.findByText("Pelanggan meminta format invoice PDF")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Pelanggan meminta format invoice PDF"));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(navigateMock).toHaveBeenCalledWith({
      to: "/projects/$projectId/features/$featureId",
      params: { projectId: "project-1", featureId: "feature-1" },
      search: { target: "point-point-1" },
    });
  });

  it("validates required project name and saves new projects locally", async () => {
    const onOpenChange = vi.fn();
    const onSaved = vi.fn();
    render(<ProjectFormDialog open onOpenChange={onOpenChange} onSaved={onSaved} />);

    fireEvent.click(screen.getByRole("button", { name: "Buat Proyek" }));
    expect(await screen.findByText("Nama proyek wajib diisi.")).toBeInTheDocument();
    expect(saveProjectMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/Nama Proyek/), {
      target: { value: "Sistem Gudang Baru" },
    });
    fireEvent.change(screen.getByLabelText("Pelanggan / Klien"), {
      target: { value: "PT Logistik" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Buat Proyek" }));

    await waitFor(() => {
      expect(saveProjectMock).toHaveBeenCalledTimes(1);
    });
    expect(reloadMock).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSaved).toHaveBeenCalledTimes(1);
  });
});
