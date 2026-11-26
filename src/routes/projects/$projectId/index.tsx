import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ArrowUpRight,
  ChevronRight,
  Download,
  Image as ImageIcon,
  Layers,
  MessageSquareText,
  MoreHorizontal,
  Pencil,
  Plus,
  Printer,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { CustomerPdfReport } from "@/components/CustomerPdfReport";
import { ProjectFormDialog } from "@/components/ProjectFormDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppData } from "@/lib/app-data";
import { createProjectMarkdownArchive, downloadFile, projectExportName } from "@/lib/archive";
import {
  formatDateId,
  formatDateTimeId,
  PROJECT_STATUS_META,
} from "@/lib/formatters";
import {
  createId,
  currentTimestamp,
  getAttachment,
  restoreDeleted,
  saveFeature,
  saveFeatures,
  touchProject,
  type AttachmentRecord,
  type FeatureRecord,
  type PointRecord,
} from "@/lib/local-db";
import { softDeleteWithUndo } from "@/lib/undo-toast";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/projects/$projectId/")({
  validateSearch: (search: Record<string, unknown>): { target?: string; print?: string } => ({
    ...(typeof search["target"] === "string" ? { target: search["target"] } : {}),
    ...(typeof search["print"] === "string" ? { print: search["print"] } : {}),
  }),
  head: () => ({
    meta: [{ title: "Ruang Kerja Proyek — FlowDoc" }],
  }),
  component: ProjectWorkspacePage,
});

function ProjectWorkspacePage() {
  const { projectId } = Route.useParams();
  const searchParams = Route.useSearch();
  const navigate = useNavigate();
  const { snapshot, ready, reload } = useAppData();

  const newFeatureInputRef = useRef<HTMLInputElement>(null);
  const printTriggeredRef = useRef<string | null>(null);
  const printThumbUrlsRef = useRef<string[]>([]);

  const [editProjectOpen, setEditProjectOpen] = useState(false);
  const [newFeatureName, setNewFeatureName] = useState("");
  const [addingFeature, setAddingFeature] = useState(false);
  const [renamingFeature, setRenamingFeature] = useState<FeatureRecord | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [savingRename, setSavingRename] = useState(false);
  const [highlightedTargetId, setHighlightedTargetId] = useState<string | null>(null);
  const [printThumbnails, setPrintThumbnails] = useState<Record<string, string>>({});

  const project = useMemo(
    () => snapshot.projects.find((item) => item.id === projectId),
    [snapshot.projects, projectId],
  );

  const projectFeatures = useMemo(
    () =>
      snapshot.features
        .filter((item) => item.deletedAt === null && item.projectId === projectId)
        .sort((left, right) => left.sortOrder - right.sortOrder),
    [snapshot.features, projectId],
  );

  const pointsByFeature = useMemo(() => {
    const map = new Map<string, PointRecord[]>();
    for (const feature of projectFeatures) map.set(feature.id, []);
    for (const point of snapshot.points) {
      if (point.deletedAt !== null) continue;
      const list = map.get(point.featureId);
      if (list) list.push(point);
    }
    for (const list of map.values()) {
      list.sort((left, right) => left.sortOrder - right.sortOrder);
    }
    return map;
  }, [projectFeatures, snapshot.points]);

  const pointAttachmentsMap = useMemo(() => {
    const map = new Map<string, AttachmentRecord[]>();
    const pointIds = new Set<string>();
    for (const points of pointsByFeature.values()) {
      for (const point of points) {
        pointIds.add(point.id);
        map.set(point.id, []);
      }
    }
    for (const attachment of snapshot.attachments) {
      if (
        attachment.deletedAt === null &&
        attachment.ownerType === "point" &&
        pointIds.has(attachment.ownerId)
      ) {
        map.get(attachment.ownerId)?.push(attachment);
      }
    }
    return map;
  }, [pointsByFeature, snapshot.attachments]);

  const featureAttachmentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    const pointToFeature = new Map<string, string>();
    for (const [featureId, points] of pointsByFeature.entries()) {
      counts.set(featureId, 0);
      for (const point of points) pointToFeature.set(point.id, featureId);
    }
    for (const attachment of snapshot.attachments) {
      if (attachment.deletedAt !== null) continue;
      if (attachment.ownerType === "feature" && counts.has(attachment.ownerId)) {
        counts.set(attachment.ownerId, (counts.get(attachment.ownerId) ?? 0) + 1);
      } else if (attachment.ownerType === "point") {
        const fid = pointToFeature.get(attachment.ownerId);
        if (fid) counts.set(fid, (counts.get(fid) ?? 0) + 1);
      }
    }
    return counts;
  }, [pointsByFeature, snapshot.attachments]);

  useEffect(() => {
    return () => {
      for (const url of printThumbUrlsRef.current) URL.revokeObjectURL(url);
    };
  }, []);

  useEffect(() => {
    const target = searchParams.target;
    if (!ready || !project || !target) return;

    const scrollTimer = window.setTimeout(() => {
      const element = document.getElementById(target);
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      setHighlightedTargetId(target);
    }, 120);

    const clearTimer = window.setTimeout(() => {
      setHighlightedTargetId(null);
    }, 2800);

    return () => {
      window.clearTimeout(scrollTimer);
      window.clearTimeout(clearTimer);
    };
  }, [ready, project, searchParams.target]);

  const handlePrintPdf = useCallback(async () => {
    toast.info("Menyiapkan laporan PDF pelanggan...", { duration: 2500 });

    const attachmentsToLoad: AttachmentRecord[] = [];
    for (const list of pointAttachmentsMap.values()) {
      attachmentsToLoad.push(...list);
    }

    if (attachmentsToLoad.length > 0) {
      const nextThumbs: Record<string, string> = {};
      const newUrls: string[] = [];
      await Promise.all(
        attachmentsToLoad.map(async (att) => {
          try {
            const stored = await getAttachment(att.id);
            if (stored) {
              const url = URL.createObjectURL(stored.blob);
              newUrls.push(url);
              nextThumbs[att.id] = url;
            }
          } catch {
            // Skip unavailable image
          }
        }),
      );
      for (const oldUrl of printThumbUrlsRef.current) URL.revokeObjectURL(oldUrl);
      printThumbUrlsRef.current = newUrls;
      setPrintThumbnails(nextThumbs);
    }

    window.setTimeout(() => {
      window.print();
    }, 300);
  }, [pointAttachmentsMap]);

  useEffect(() => {
    if (!ready || !project || project.deletedAt !== null) return;
    if (searchParams.print === "1" && printTriggeredRef.current !== project.id) {
      printTriggeredRef.current = project.id;
      void handlePrintPdf();
    }
  }, [ready, project, searchParams.print, handlePrintPdf]);

  if (!ready) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-44 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="arc-surface mx-auto max-w-lg rounded-2xl p-8 text-center">
        <h1 className="text-xl font-bold">Proyek tidak ditemukan</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Proyek ini mungkin sudah dihapus permanen atau belum tersedia di database Supabase.
        </p>
        <Button asChild className="mt-6 rounded-xl">
          <Link to="/">Kembali ke Dasbor</Link>
        </Button>
      </div>
    );
  }

  if (project.deletedAt !== null) {
    return (
      <div className="arc-surface mx-auto max-w-lg rounded-2xl p-8 text-center">
        <h1 className="text-xl font-bold">Proyek berada di Sampah</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Proyek “{project.name}” dihapus pada {formatDateTimeId(project.deletedAt)}. Pulihkan untuk
          membuka ruang kerjanya kembali.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button
            type="button"
            onClick={() => {
              void restoreDeleted("project", project.id)
                .then(() => reload())
                .then(() => toast.success(`Proyek "${project.name}" dipulihkan`));
            }}
            className="gap-1.5 rounded-xl"
          >
            <RotateCcw className="h-4 w-4" />
            Pulihkan Proyek
          </Button>
          <Button variant="outline" asChild className="rounded-xl">
            <Link to="/">Kembali ke Dasbor</Link>
          </Button>
        </div>
      </div>
    );
  }

  const activeProject = project;
  const statusMeta = PROJECT_STATUS_META[activeProject.status];

  async function handleAddFeature(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = newFeatureName.trim();
    if (!trimmed) {
      toast.error("Nama fitur wajib diisi.");
      return;
    }

    setAddingFeature(true);
    try {
      const now = currentTimestamp();
      const maxOrder = projectFeatures.reduce((max, item) => Math.max(max, item.sortOrder), -1);
      const newFeature: FeatureRecord = {
        id: createId(),
        projectId: activeProject.id,
        name: trimmed,
        flowNotes: "",
        sortOrder: maxOrder + 1,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      await saveFeature(newFeature);
      await touchProject(activeProject.id);
      await reload();
      setNewFeatureName("");
      toast.success(`Fitur "${trimmed}" ditambahkan`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal menambahkan fitur.");
    } finally {
      setAddingFeature(false);
    }
  }

  async function handleRenameSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!renamingFeature) return;
    const trimmed = renameDraft.trim();
    if (!trimmed) {
      toast.error("Nama fitur wajib diisi.");
      return;
    }
    setSavingRename(true);
    try {
      await saveFeature({
        ...renamingFeature,
        name: trimmed,
        updatedAt: currentTimestamp(),
      });
      await touchProject(activeProject.id);
      await reload();
      setRenamingFeature(null);
      toast.success("Nama fitur diperbarui");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal mengubah nama fitur.");
    } finally {
      setSavingRename(false);
    }
  }

  async function handleMoveFeatureOrder(featureId: string, direction: "up" | "down") {
    const currentIndex = projectFeatures.findIndex((item) => item.id === featureId);
    if (currentIndex === -1) return;
    const swapIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (swapIndex < 0 || swapIndex >= projectFeatures.length) return;

    const reordered = [...projectFeatures];
    const [moved] = reordered.splice(currentIndex, 1);
    if (!moved) return;
    reordered.splice(swapIndex, 0, moved);

    const now = currentTimestamp();
    const updated = reordered.map((item, idx) => ({
      ...item,
      sortOrder: idx,
      updatedAt: now,
    }));

    try {
      await saveFeatures(updated);
      await touchProject(activeProject.id);
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal mengubah urutan fitur.");
    }
  }

  async function handleExportMarkdown() {
    try {
      const archive = await createProjectMarkdownArchive(activeProject.id);
      downloadFile(archive, projectExportName(activeProject.name, "zip"));
      toast.success("Paket Markdown (.zip) berhasil diunduh");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal mengekspor Markdown.");
    }
  }

  function openFeatureDetail(featureId: string) {
    void navigate({
      to: "/projects/$projectId/features/$featureId",
      params: { projectId: activeProject.id, featureId },
      search: {},
    });
  }

  return (
    <div className="w-full space-y-6">
      <section data-print-hide="true" className="space-y-4">
        <div
          data-print-hide="true"
          className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground"
        >
          <Link to="/" className="inline-flex items-center gap-1 hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" />
            Dasbor
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="truncate font-medium text-foreground">{activeProject.name}</span>
        </div>

        <div
          id={`project-${activeProject.id}`}
          className={cn(
            "arc-surface w-full rounded-2xl p-5 sm:p-6",
            highlightedTargetId === `project-${activeProject.id}` &&
              "arc-target-highlight border-primary ring-2 ring-primary/25",
          )}
        >
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className={cn("gap-1.5 font-medium", statusMeta.badgeClass)}
                >
                  <span className={cn("h-1.5 w-1.5 rounded-full", statusMeta.dotClass)} />
                  {statusMeta.label}
                </Badge>
                {activeProject.customerName && (
                  <span className="text-xs font-medium text-muted-foreground">
                    Pelanggan: {activeProject.customerName}
                  </span>
                )}
                <span className="text-xs text-muted-foreground">
                  · Diperbarui {formatDateTimeId(activeProject.updatedAt)}
                </span>
              </div>

              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{activeProject.name}</h1>

              {activeProject.description && (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {activeProject.description}
                </p>
              )}
            </div>

            <div data-print-hide="true" className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditProjectOpen(true)}
                className="gap-1.5 rounded-xl"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit Detail
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleExportMarkdown()}
                className="gap-1.5 rounded-xl"
              >
                <Download className="h-3.5 w-3.5" />
                Markdown
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handlePrintPdf()}
                className="gap-1.5 rounded-xl"
              >
                <Printer className="h-3.5 w-3.5" />
                Ekspor PDF
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  void softDeleteWithUndo({
                    type: "project",
                    id: activeProject.id,
                    label: `Proyek "${activeProject.name}"`,
                    reload,
                  }).then(() => {
                    void navigate({ to: "/" });
                  });
                }}
                className="gap-1.5 rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Hapus
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section id="fitur" data-print-hide="true" className="w-full space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold">
              Daftar Fitur &amp; Poin Pelanggan ({projectFeatures.length})
            </h2>
          </div>
          <span data-print-hide="true" className="text-xs text-muted-foreground">
            Klik kartu fitur untuk melihat dan mengelola daftar poin pelanggan dalam bentuk tabel.
          </span>
        </div>

        <form
          data-print-hide="true"
          onSubmit={handleAddFeature}
          className="arc-surface flex w-full flex-col gap-2 rounded-2xl p-3 sm:flex-row sm:items-center"
        >
          <Input
            ref={newFeatureInputRef}
            value={newFeatureName}
            onChange={(event) => setNewFeatureName(event.target.value)}
            placeholder="Tambah fitur baru... (contoh: Verifikasi Invoice, Pengaturan Diskon)"
            aria-label="Nama fitur baru"
            className="flex-1 bg-background"
          />
          <Button type="submit" disabled={addingFeature} className="gap-1.5 rounded-xl">
            <Plus className="h-4 w-4" />
            {addingFeature ? "Menambahkan..." : "Tambah Fitur"}
          </Button>
        </form>

        {projectFeatures.length === 0 ? (
          <div className="arc-surface w-full rounded-2xl px-6 py-12 text-center">
            <Layers className="mx-auto h-8 w-8 text-muted-foreground/50" />
            <h3 className="mt-3 text-base font-semibold">Belum ada fitur pada proyek ini</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Tambahkan fitur di kolom atas untuk mulai mencatat daftar poin kebutuhan pelanggan.
            </p>
          </div>
        ) : (
          <div
            data-print-hide="true"
            className="grid w-full grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4"
          >
            {projectFeatures.map((feature, idx) => {
              const pointsCount = pointsByFeature.get(feature.id)?.length ?? 0;
              const attachmentCount = featureAttachmentCounts.get(feature.id) ?? 0;
              const isHighlighted = highlightedTargetId === `feature-${feature.id}`;

              return (
                <article
                  key={feature.id}
                  id={`feature-${feature.id}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => openFeatureDetail(feature.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openFeatureDetail(feature.id);
                    }
                  }}
                  className={cn(
                    "arc-surface arc-surface-interactive flex cursor-pointer flex-col justify-between rounded-2xl p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isHighlighted && "arc-target-highlight border-primary ring-2 ring-primary/25",
                  )}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-secondary px-2 text-xs font-semibold text-secondary-foreground">
                        Fitur #{idx + 1}
                      </span>

                      <div
                        className="-mt-1 -mr-1 flex items-center gap-0.5"
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          disabled={idx === 0}
                          onClick={() => void handleMoveFeatureOrder(feature.id, "up")}
                          aria-label={`Naikkan urutan fitur ${feature.name}`}
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          disabled={idx === projectFeatures.length - 1}
                          onClick={() => void handleMoveFeatureOrder(feature.id, "down")}
                          aria-label={`Turunkan urutan fitur ${feature.name}`}
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-foreground"
                              aria-label={`Menu aksi untuk fitur ${feature.name}`}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openFeatureDetail(feature.id)}>
                              <ArrowUpRight className="h-4 w-4" />
                              Buka Tabel Poin
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                setRenamingFeature(feature);
                                setRenameDraft(feature.name);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                              Ubah Nama Fitur
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() =>
                                void softDeleteWithUndo({
                                  type: "feature",
                                  id: feature.id,
                                  label: `Fitur "${feature.name}"`,
                                  reload,
                                })
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                              Hapus ke Sampah
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>

                    <h3 className="mt-3 text-base font-semibold tracking-tight text-foreground">
                      {feature.name}
                    </h3>
                  </div>

                  <div className="mt-5 space-y-3 border-t pt-3.5">
                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <MessageSquareText className="h-3.5 w-3.5" />
                        {pointsCount} poin
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <ImageIcon className="h-3.5 w-3.5" />
                        {attachmentCount} gambar
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] text-muted-foreground">
                        Diperbarui {formatDateId(feature.updatedAt)}
                      </span>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={(event) => {
                          event.stopPropagation();
                          openFeatureDetail(feature.id);
                        }}
                        className="h-8 gap-1 rounded-lg text-xs"
                      >
                        Lihat Poin
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <CustomerPdfReport
        mode="project"
        project={activeProject}
        features={projectFeatures}
        pointsByFeature={pointsByFeature}
        attachmentsByPoint={pointAttachmentsMap}
        thumbnails={printThumbnails}
      />

      <ProjectFormDialog
        open={editProjectOpen}
        onOpenChange={setEditProjectOpen}
        project={activeProject}
      />

      <Dialog
        open={Boolean(renamingFeature)}
        onOpenChange={(open) => {
          if (!open) setRenamingFeature(null);
        }}
      >
        <DialogContent className="sm:rounded-2xl">
          <DialogHeader>
            <DialogTitle>Ubah Nama Fitur</DialogTitle>
            <DialogDescription>
              Perbarui nama fitur pada dokumentasi proyek ini.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleRenameSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="rename-feature-input">Nama Fitur</Label>
              <Input
                id="rename-feature-input"
                value={renameDraft}
                onChange={(event) => setRenameDraft(event.target.value)}
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setRenamingFeature(null)}
                disabled={savingRename}
              >
                Batal
              </Button>
              <Button type="submit" disabled={savingRename}>
                {savingRename ? "Menyimpan..." : "Simpan"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
