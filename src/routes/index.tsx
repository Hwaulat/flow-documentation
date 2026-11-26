import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Archive,
  ArrowUpRight,
  Download,
  FileText,
  FolderKanban,
  HardDrive,
  Image as ImageIcon,
  Layers,
  MessageSquareText,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { ProjectFormDialog } from "@/components/ProjectFormDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppData } from "@/lib/app-data";
import { createProjectMarkdownArchive, downloadFile, projectExportName } from "@/lib/archive";
import {
  formatBytes,
  formatDateId,
  formatDateTimeId,
  PROJECT_STATUS_META,
} from "@/lib/formatters";
import type { ProjectRecord, ProjectStatus } from "@/lib/local-db";
import { softDeleteWithUndo } from "@/lib/undo-toast";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [{ title: "Dasbor Proyek — FlowDoc" }],
  }),
  component: DashboardPage,
});

type StatusFilter = "all" | ProjectStatus;
type SortOrder = "updated-desc" | "updated-asc" | "name-asc" | "customer-asc" | "points-desc";

function DashboardPage() {
  const { snapshot, ready, reload } = useAppData();
  const navigate = useNavigate();

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortOrder, setSortOrder] = useState<SortOrder>("updated-desc");
  const [formOpen, setFormOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectRecord | null>(null);

  const activeProjects = useMemo(
    () => snapshot.projects.filter((project) => project.deletedAt === null),
    [snapshot.projects],
  );

  const projectStats = useMemo(() => {
    const stats = new Map<
      string,
      { featureCount: number; pointCount: number; attachmentCount: number }
    >();
    const activeProjectIds = new Set(activeProjects.map((project) => project.id));

    for (const project of activeProjects) {
      stats.set(project.id, { featureCount: 0, pointCount: 0, attachmentCount: 0 });
    }

    const featureToProject = new Map<string, string>();
    for (const feature of snapshot.features) {
      if (feature.deletedAt !== null || !activeProjectIds.has(feature.projectId)) continue;
      featureToProject.set(feature.id, feature.projectId);
      const entry = stats.get(feature.projectId);
      if (entry) entry.featureCount += 1;
    }

    const pointToProject = new Map<string, string>();
    for (const point of snapshot.points) {
      if (point.deletedAt !== null) continue;
      const projectId = featureToProject.get(point.featureId);
      if (!projectId) continue;
      pointToProject.set(point.id, projectId);
      const entry = stats.get(projectId);
      if (entry) entry.pointCount += 1;
    }

    for (const attachment of snapshot.attachments) {
      if (attachment.deletedAt !== null) continue;
      let projectId: string | undefined;
      if (attachment.ownerType === "project") projectId = attachment.ownerId;
      else if (attachment.ownerType === "feature") {
        projectId = featureToProject.get(attachment.ownerId);
      } else if (attachment.ownerType === "point") {
        projectId = pointToProject.get(attachment.ownerId);
      }

      if (projectId) {
        const entry = stats.get(projectId);
        if (entry) entry.attachmentCount += 1;
      }
    }

    return stats;
  }, [activeProjects, snapshot.features, snapshot.points, snapshot.attachments]);

  const summary = useMemo(() => {
    let featureTotal = 0;
    let pointTotal = 0;
    for (const value of projectStats.values()) {
      featureTotal += value.featureCount;
      pointTotal += value.pointCount;
    }
    const attachmentBytes = snapshot.attachments.reduce((sum, item) => sum + item.size, 0);
    return {
      totalProjects: activeProjects.length,
      activeCount: activeProjects.filter((item) => item.status === "active").length,
      onHoldCount: activeProjects.filter((item) => item.status === "on-hold").length,
      doneCount: activeProjects.filter((item) => item.status === "done").length,
      featureTotal,
      pointTotal,
      attachmentBytes,
    };
  }, [activeProjects, projectStats, snapshot.attachments]);

  const filteredProjects = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const list = activeProjects.filter((project) => {
      if (statusFilter !== "all" && project.status !== statusFilter) return false;
      if (!normalizedQuery) return true;
      const haystack = `${project.name} ${project.customerName} ${project.description} ${project.processFlow}`.toLocaleLowerCase();
      return haystack.includes(normalizedQuery);
    });

    return [...list].sort((left, right) => {
      if (sortOrder === "updated-desc") return right.updatedAt.localeCompare(left.updatedAt);
      if (sortOrder === "updated-asc") return left.updatedAt.localeCompare(right.updatedAt);
      if (sortOrder === "name-asc") return left.name.localeCompare(right.name, "id");
      if (sortOrder === "customer-asc") {
        return (left.customerName || "zzz").localeCompare(right.customerName || "zzz", "id");
      }
      const leftPoints = projectStats.get(left.id)?.pointCount ?? 0;
      const rightPoints = projectStats.get(right.id)?.pointCount ?? 0;
      return rightPoints - leftPoints || right.updatedAt.localeCompare(left.updatedAt);
    });
  }, [activeProjects, query, statusFilter, sortOrder, projectStats]);

  async function handleExportMarkdown(project: ProjectRecord) {
    try {
      const archive = await createProjectMarkdownArchive(project.id);
      downloadFile(archive, projectExportName(project.name, "zip"));
      toast.success(`Dokumentasi "${project.name}" berhasil diekspor`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal mengekspor proyek.");
    }
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
            <HardDrive className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
            Tersimpan di Supabase · Tanpa Login
          </div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Dasbor Proyek</h1>
          <p className="text-sm text-muted-foreground">
            Catat alur proses, susun daftar fitur, dan kumpulkan poin kebutuhan pelanggan yang
            tersinkronisasi langsung ke database Supabase.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            onClick={() => {
              setEditingProject(null);
              setFormOpen(true);
            }}
            className="gap-1.5 rounded-xl shadow-sm"
          >
            <Plus className="h-4 w-4" />
            Proyek Baru
          </Button>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="arc-surface rounded-2xl p-4">
          <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
            <span>Total Proyek</span>
            <FolderKanban className="h-4 w-4" />
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight">{summary.totalProjects}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {summary.activeCount} aktif · {summary.doneCount} selesai
          </p>
        </div>

        <div className="arc-surface rounded-2xl p-4">
          <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
            <span>Fitur Terdokumentasi</span>
            <Layers className="h-4 w-4" />
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight">{summary.featureTotal}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Tersusun per ruang kerja proyek</p>
        </div>

        <div className="arc-surface rounded-2xl p-4">
          <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
            <span>Poin Pelanggan</span>
            <MessageSquareText className="h-4 w-4" />
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight">{summary.pointTotal}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Masukan dari meeting &amp; chat</p>
        </div>

        <Link
          to="/backup"
          className="arc-surface arc-surface-interactive block rounded-2xl p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
            <span>Status Cadangan</span>
            <Archive className="h-4 w-4" />
          </div>
          <p className="mt-2 truncate text-sm font-semibold text-foreground">
            {snapshot.lastBackupAt ? formatDateTimeId(snapshot.lastBackupAt) : "Belum dicadangkan"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Lampiran {formatBytes(summary.attachmentBytes)} · Kelola cadangan →
          </p>
        </Link>
      </section>

      {activeProjects.length > 0 && (
        <section className="arc-surface flex flex-col gap-3 rounded-2xl p-3.5 sm:p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Saring proyek menurut judul, pelanggan, atau deskripsi..."
                className="pl-9"
                aria-label="Saring daftar proyek"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Select value={sortOrder} onValueChange={(value) => setSortOrder(value as SortOrder)}>
                <SelectTrigger className="w-full sm:w-52" aria-label="Urutkan proyek">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="updated-desc">Terbaru diperbarui</SelectItem>
                  <SelectItem value="updated-asc">Terlama diperbarui</SelectItem>
                  <SelectItem value="name-asc">Nama proyek (A–Z)</SelectItem>
                  <SelectItem value="customer-asc">Nama pelanggan (A–Z)</SelectItem>
                  <SelectItem value="points-desc">Poin pelanggan terbanyak</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { key: "all", label: `Semua (${summary.totalProjects})` },
                { key: "active", label: `Aktif (${summary.activeCount})` },
                { key: "on-hold", label: `Ditunda (${summary.onHoldCount})` },
                { key: "done", label: `Selesai (${summary.doneCount})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setStatusFilter(tab.key)}
                className={cn(
                  "rounded-lg px-3 py-1 text-xs font-medium transition-colors",
                  statusFilter === tab.key
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "bg-secondary/70 text-secondary-foreground hover:bg-secondary",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </section>
      )}

      {!ready ? (
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((item) => (
            <div key={item} className="arc-surface space-y-3 rounded-2xl p-5">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-12 w-full" />
            </div>
          ))}
        </section>
      ) : activeProjects.length === 0 ? (
        <section className="arc-surface flex flex-col items-center justify-center rounded-2xl px-6 py-14 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <FileText className="h-6 w-6" />
          </div>
          <h2 className="mt-4 text-lg font-semibold">Belum ada proyek dokumentasi</h2>
          <p className="mt-1.5 max-w-md text-sm text-muted-foreground">
            Mulai dokumentasikan alur proses proyek, daftar fitur, lampiran gambar, dan poin
            masukan pelanggan yang langsung tersimpan di Supabase tanpa login.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
            <Button
              type="button"
              onClick={() => {
                setEditingProject(null);
                setFormOpen(true);
              }}
              className="gap-1.5 rounded-xl"
            >
              <Plus className="h-4 w-4" />
              Buat Proyek Pertama
            </Button>
            <Button type="button" variant="outline" asChild className="rounded-xl">
              <Link to="/backup">Pulihkan Cadangan</Link>
            </Button>
          </div>
        </section>
      ) : filteredProjects.length === 0 ? (
        <section className="arc-surface flex flex-col items-center justify-center rounded-2xl px-6 py-12 text-center">
          <Search className="h-8 w-8 text-muted-foreground/60" />
          <h2 className="mt-3 text-base font-semibold">Tidak ada proyek yang sesuai filter</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Ubah kata kunci pencarian atau pilih status lain untuk melihat proyek Anda.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setQuery("");
              setStatusFilter("all");
            }}
            className="mt-4"
          >
            Reset Filter
          </Button>
        </section>
      ) : (
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {filteredProjects.map((project) => {
            const statusMeta = PROJECT_STATUS_META[project.status];
            const counts = projectStats.get(project.id) ?? {
              featureCount: 0,
              pointCount: 0,
              attachmentCount: 0,
            };

            return (
              <article
                key={project.id}
                className="arc-surface arc-surface-interactive flex flex-col justify-between rounded-2xl p-5"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <Badge
                      variant="outline"
                      className={cn("gap-1.5 font-medium", statusMeta.badgeClass)}
                    >
                      <span className={cn("h-1.5 w-1.5 rounded-full", statusMeta.dotClass)} />
                      {statusMeta.label}
                    </Badge>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="-mt-1 -mr-1 h-8 w-8 text-muted-foreground"
                          aria-label={`Menu aksi untuk ${project.name}`}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => {
                            setEditingProject(project);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                          Edit Detail Proyek
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => void handleExportMarkdown(project)}>
                          <Download className="h-4 w-4" />
                          Ekspor Markdown (.zip)
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() =>
                            void softDeleteWithUndo({
                              type: "project",
                              id: project.id,
                              label: `Proyek "${project.name}"`,
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

                  <Link
                    to="/projects/$projectId"
                    params={{ projectId: project.id }}
                    search={{}}
                    className="group mt-3 block focus-visible:outline-none"
                  >
                    <h2 className="text-base font-semibold tracking-tight text-foreground transition-colors group-hover:text-primary">
                      {project.name}
                    </h2>
                    <p className="mt-0.5 text-xs font-medium text-muted-foreground">
                      {project.customerName
                        ? `Pelanggan: ${project.customerName}`
                        : "Tanpa nama pelanggan"}
                    </p>
                  </Link>

                  <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">
                    {project.description ||
                      project.processFlow ||
                      "Belum ada deskripsi atau catatan alur proses."}
                  </p>
                </div>

                <div className="mt-5 space-y-3 border-t pt-3.5">
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Layers className="h-3.5 w-3.5" />
                      {counts.featureCount} fitur
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <MessageSquareText className="h-3.5 w-3.5" />
                      {counts.pointCount} poin
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <ImageIcon className="h-3.5 w-3.5" />
                      {counts.attachmentCount} gambar
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-muted-foreground">
                      Diperbarui {formatDateId(project.updatedAt)}
                    </span>
                    <Button
                      variant="secondary"
                      size="sm"
                      asChild
                      className="h-8 gap-1 rounded-lg text-xs"
                    >
                      <Link to="/projects/$projectId" params={{ projectId: project.id }} search={{}}>
                        Buka
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}

      <ProjectFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        project={editingProject}
        onSaved={(savedProject) => {
          if (!editingProject) {
            void navigate({
              to: "/projects/$projectId",
              params: { projectId: savedProject.id },
              search: {},
            });
          }
        }}
      />
    </div>
  );
}
