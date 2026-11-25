import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRightLeft,
  ArrowUp,
  Check,
  ChevronRight,
  Copy,
  Image as ImageIcon,
  ImagePlus,
  Layers,
  MessageSquareText,
  MoreHorizontal,
  Pencil,
  Plus,
  Printer,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { AttachmentGallery } from "@/components/AttachmentGallery";
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useAppData } from "@/lib/app-data";
import {
  formatDateId,
  formatDateTimeId,
  POINT_SOURCE_META,
  POINT_SOURCES,
  todayYmd,
} from "@/lib/formatters";
import {
  createId,
  currentTimestamp,
  duplicatePointWithAttachments,
  getAttachment,
  isValidImageAttachment,
  MAX_ATTACHMENT_BYTES,
  restoreWithAncestors,
  saveAttachment,
  saveFeature,
  savePoint,
  savePoints,
  touchProject,
  type AttachmentRecord,
  type PointRecord,
  type PointSource,
} from "@/lib/local-db";
import { softDeleteWithUndo } from "@/lib/undo-toast";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/projects/$projectId/features/$featureId")({
  validateSearch: (search: Record<string, unknown>): { target?: string } => ({
    ...(typeof search["target"] === "string" ? { target: search["target"] } : {}),
  }),
  head: () => ({
    meta: [{ title: "Daftar Poin Fitur — FlowDoc" }],
  }),
  component: FeatureDetailPage,
});

const EXTENSION_TO_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

function resolveMimeType(file: File): string {
  if (file.type) return file.type.toLowerCase();
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSION_TO_MIME[ext] ?? "";
}

function FeatureDetailPage() {
  const { projectId, featureId } = Route.useParams();
  const searchParams = Route.useSearch();
  const navigate = useNavigate();
  const { snapshot, ready, reload } = useAppData();

  const quickImageInputRef = useRef<HTMLInputElement>(null);

  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [flowNotesDraft, setFlowNotesDraft] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  const [pointContent, setPointContent] = useState("");
  const [pointMentionedOn, setPointMentionedOn] = useState("");
  const [pointSource, setPointSource] = useState<PointSource>("Meeting");
  const [pointStatedBy, setPointStatedBy] = useState("");
  const [showPointMeta, setShowPointMeta] = useState(false);
  const [pendingImages, setPendingImages] = useState<File[]>([]);
  const [addingPoint, setAddingPoint] = useState(false);

  const [tableQuery, setTableQuery] = useState("");
  const [tableSourceFilter, setTableSourceFilter] = useState<PointSource | "all">("all");
  const [highlightedTargetId, setHighlightedTargetId] = useState<string | null>(null);

  const [editingPoint, setEditingPoint] = useState<PointRecord | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editMentionedOn, setEditMentionedOn] = useState("");
  const [editSource, setEditSource] = useState<PointSource>("Meeting");
  const [editStatedBy, setEditStatedBy] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const [attachmentModalPoint, setAttachmentModalPoint] = useState<PointRecord | null>(null);

  const [movePointTarget, setMovePointTarget] = useState<PointRecord | null>(null);
  const [destinationFeatureId, setDestinationFeatureId] = useState("");
  const [movingPoint, setMovingPoint] = useState(false);

  const [pointThumbnails, setPointThumbnails] = useState<Record<string, string>>({});

  useEffect(() => {
    setPointMentionedOn((current) => current || todayYmd());
  }, []);

  const project = useMemo(
    () => snapshot.projects.find((item) => item.id === projectId),
    [snapshot.projects, projectId],
  );

  const feature = useMemo(
    () => snapshot.features.find((item) => item.id === featureId && item.projectId === projectId),
    [snapshot.features, featureId, projectId],
  );

  const activeProjects = useMemo(
    () =>
      snapshot.projects
        .filter((item) => item.deletedAt === null)
        .sort((left, right) => left.name.localeCompare(right.name, "id")),
    [snapshot.projects],
  );

  const activeProjectIds = useMemo(
    () => new Set(activeProjects.map((item) => item.id)),
    [activeProjects],
  );

  const allActiveFeatures = useMemo(
    () =>
      snapshot.features
        .filter((item) => item.deletedAt === null && activeProjectIds.has(item.projectId))
        .sort((left, right) => left.sortOrder - right.sortOrder),
    [snapshot.features, activeProjectIds],
  );

  const points = useMemo(
    () =>
      snapshot.points
        .filter((item) => item.deletedAt === null && item.featureId === featureId)
        .sort((left, right) => left.sortOrder - right.sortOrder),
    [snapshot.points, featureId],
  );

  const pointAttachmentsMap = useMemo(() => {
    const pointIds = new Set(points.map((item) => item.id));
    const map = new Map<string, AttachmentRecord[]>();
    for (const id of pointIds) map.set(id, []);
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
  }, [points, snapshot.attachments]);

  const pointAttachmentIdsKey = useMemo(() => {
    const ids: string[] = [];
    for (const list of pointAttachmentsMap.values()) {
      for (const att of list) ids.push(att.id);
    }
    return ids.sort().join(",");
  }, [pointAttachmentsMap]);

  useEffect(() => {
    let active = true;
    const createdUrls: string[] = [];

    async function loadThumbs() {
      const next: Record<string, string> = {};
      for (const list of pointAttachmentsMap.values()) {
        for (const att of list) {
          try {
            const stored = await getAttachment(att.id);
            if (stored && active) {
              const url = URL.createObjectURL(stored.blob);
              createdUrls.push(url);
              next[att.id] = url;
            }
          } catch {
            // Ignore unreadable blob
          }
        }
      }
      if (active) setPointThumbnails(next);
      else for (const url of createdUrls) URL.revokeObjectURL(url);
    }

    if (pointAttachmentIdsKey) void loadThumbs();
    else setPointThumbnails({});

    return () => {
      active = false;
      for (const url of createdUrls) URL.revokeObjectURL(url);
    };
  }, [pointAttachmentIdsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentFeatureName = feature?.name ?? "";
  const currentFeatureFlowNotes = feature?.flowNotes ?? "";
  const currentFeatureId = feature?.id ?? "";

  useEffect(() => {
    if (currentFeatureId) {
      setNameDraft(currentFeatureName);
      setFlowNotesDraft(currentFeatureFlowNotes);
    }
  }, [currentFeatureId, currentFeatureName, currentFeatureFlowNotes]);

  useEffect(() => {
    if (!ready || !project || !feature || project.deletedAt !== null || feature.deletedAt !== null) {
      return;
    }
    if (flowNotesDraft === feature.flowNotes) return;

    const timer = window.setTimeout(() => {
      setSavingNotes(true);
      void saveFeature({
        ...feature,
        flowNotes: flowNotesDraft,
        updatedAt: currentTimestamp(),
      })
        .then(() => touchProject(project.id))
        .then(() => reload())
        .catch(() => {
          // Handled on explicit save/blur if storage fails
        })
        .finally(() => {
          setSavingNotes(false);
        });
    }, 600);

    return () => window.clearTimeout(timer);
  }, [ready, project, feature, flowNotesDraft, reload]);

  useEffect(() => {
    const target = searchParams.target;
    if (!ready || !feature || !target) return;

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
  }, [ready, feature, searchParams.target]);

  const filteredPoints = useMemo(() => {
    const query = tableQuery.trim().toLocaleLowerCase();
    return points.filter((point) => {
      if (tableSourceFilter !== "all" && point.source !== tableSourceFilter) return false;
      if (!query) return true;
      const haystack = `${point.content} ${point.statedBy} ${point.mentionedOn}`.toLocaleLowerCase();
      return haystack.includes(query);
    });
  }, [points, tableQuery, tableSourceFilter]);

  const isFiltered = tableQuery.trim() !== "" || tableSourceFilter !== "all";

  if (!ready) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-36 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  if (!project || !feature) {
    return (
      <div className="arc-surface mx-auto max-w-lg rounded-2xl p-8 text-center">
        <h1 className="text-xl font-bold">Fitur tidak ditemukan</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Fitur atau proyek yang diminta tidak tersedia atau sudah dihapus permanen.
        </p>
        <Button asChild className="mt-6 rounded-xl">
          <Link to="/projects/$projectId" params={{ projectId }} search={{}}>
            Kembali ke Proyek
          </Link>
        </Button>
      </div>
    );
  }

  if (project.deletedAt !== null || feature.deletedAt !== null) {
    return (
      <div className="arc-surface mx-auto max-w-lg rounded-2xl p-8 text-center">
        <h1 className="text-xl font-bold">Fitur berada di Sampah</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Fitur “{feature.name}” atau proyek induknya berada di Sampah. Pulihkan untuk membuka
          kembali daftar poinnya.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button
            type="button"
            onClick={() => {
              void restoreWithAncestors("feature", feature.id)
                .then(() => reload())
                .then(() => toast.success(`Fitur "${feature.name}" berhasil dipulihkan`));
            }}
            className="gap-1.5 rounded-xl"
          >
            <RotateCcw className="h-4 w-4" />
            Pulihkan Fitur
          </Button>
          <Button variant="outline" asChild className="rounded-xl">
            <Link to="/">Kembali ke Dasbor</Link>
          </Button>
        </div>
      </div>
    );
  }

  const activeFeature = feature;
  const activeProject = project;
  const notesDirty = flowNotesDraft !== activeFeature.flowNotes;

  async function handleRenameSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      toast.error("Nama fitur wajib diisi.");
      return;
    }
    try {
      await saveFeature({
        ...activeFeature,
        name: trimmed,
        updatedAt: currentTimestamp(),
      });
      await touchProject(activeProject.id);
      await reload();
      setRenaming(false);
      toast.success("Nama fitur diperbarui");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal mengubah nama fitur.");
    }
  }

  async function handleSaveNotes() {
    if (!notesDirty) return;
    setSavingNotes(true);
    try {
      await saveFeature({
        ...activeFeature,
        flowNotes: flowNotesDraft,
        updatedAt: currentTimestamp(),
      });
      await touchProject(activeProject.id);
      await reload();
      toast.success("Catatan alur fitur tersimpan");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal menyimpan catatan fitur.");
    } finally {
      setSavingNotes(false);
    }
  }

  function handleSelectPendingImages(files: FileList | null) {
    if (!files) return;
    const valid: File[] = [];
    for (const file of Array.from(files)) {
      const mimeType = resolveMimeType(file);
      if (!isValidImageAttachment(mimeType, file.size)) {
        const maxMb = Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024));
        toast.error(
          `“${file.name}” ditolak. Hanya PNG, JPEG, GIF, atau WebP hingga ${maxMb} MB yang didukung.`,
        );
        continue;
      }
      valid.push(file);
    }
    if (valid.length > 0) {
      setPendingImages((prev) => [...prev, ...valid]);
    }
  }

  async function submitNewPoint() {
    const trimmed = pointContent.trim();
    if (!trimmed) {
      toast.error("Tulis isi poin kebutuhan pelanggan terlebih dahulu.");
      return;
    }

    setAddingPoint(true);
    try {
      const now = currentTimestamp();
      const maxOrder = points.reduce((max, item) => Math.max(max, item.sortOrder), -1);
      const newPoint: PointRecord = {
        id: createId(),
        featureId: activeFeature.id,
        content: trimmed,
        mentionedOn: pointMentionedOn.trim(),
        source: pointSource,
        statedBy: pointStatedBy.trim(),
        sortOrder: maxOrder + 1,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };

      await savePoint(newPoint);

      for (const file of pendingImages) {
        const mimeType = resolveMimeType(file);
        await saveAttachment({
          id: createId(),
          ownerType: "point",
          ownerId: newPoint.id,
          originalName: file.name,
          mimeType,
          size: file.size,
          caption: "",
          createdAt: currentTimestamp(),
          deletedAt: null,
          blob: file,
        });
      }

      await touchProject(activeProject.id);
      await reload();
      setPointContent("");
      setPointStatedBy("");
      setPendingImages([]);
      toast.success("Poin pelanggan ditambahkan ke tabel");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal menambahkan poin pelanggan.");
    } finally {
      setAddingPoint(false);
    }
  }

  async function handleMovePointOrder(pointId: string, direction: "up" | "down") {
    const currentIndex = points.findIndex((item) => item.id === pointId);
    if (currentIndex === -1) return;
    const swapIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (swapIndex < 0 || swapIndex >= points.length) return;

    const reordered = [...points];
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
      await savePoints(updated);
      await touchProject(activeProject.id);
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal mengubah urutan poin.");
    }
  }

  async function handleDuplicatePoint(sourcePoint: PointRecord) {
    const currentIndex = points.findIndex((item) => item.id === sourcePoint.id);
    if (currentIndex === -1) return;

    try {
      const now = currentTimestamp();
      const targetOrder = currentIndex + 1;
      const subsequentUpdates = points
        .slice(currentIndex + 1)
        .map((item, offset) => ({
          ...item,
          sortOrder: targetOrder + 1 + offset,
          updatedAt: now,
        }));

      if (subsequentUpdates.length > 0) {
        await savePoints(subsequentUpdates);
      }
      await duplicatePointWithAttachments(sourcePoint, targetOrder);
      await touchProject(activeProject.id);
      await reload();
      toast.success("Poin berhasil diduplikasi");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal menduplikasi poin.");
    }
  }

  function openEditDialog(point: PointRecord) {
    setEditingPoint(point);
    setEditContent(point.content);
    setEditMentionedOn(point.mentionedOn);
    setEditSource(point.source);
    setEditStatedBy(point.statedBy);
  }

  async function handleSaveEditPoint(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingPoint) return;
    const trimmed = editContent.trim();
    if (!trimmed) {
      toast.error("Isi poin pelanggan tidak boleh kosong.");
      return;
    }

    setSavingEdit(true);
    try {
      await savePoint({
        ...editingPoint,
        content: trimmed,
        mentionedOn: editMentionedOn.trim(),
        source: editSource,
        statedBy: editStatedBy.trim(),
        updatedAt: currentTimestamp(),
      });
      await touchProject(activeProject.id);
      await reload();
      setEditingPoint(null);
      toast.success("Poin pelanggan diperbarui");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal menyimpan poin.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleMovePointFeature(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!movePointTarget || !destinationFeatureId || destinationFeatureId === movePointTarget.featureId) {
      setMovePointTarget(null);
      return;
    }

    const destinationFeature = allActiveFeatures.find((item) => item.id === destinationFeatureId);
    if (!destinationFeature) {
      toast.error("Fitur tujuan tidak ditemukan.");
      return;
    }

    setMovingPoint(true);
    try {
      await savePoints([
        {
          ...movePointTarget,
          featureId: destinationFeatureId,
          sortOrder: Date.now(),
          updatedAt: currentTimestamp(),
        },
      ]);
      await touchProject(activeProject.id);
      if (destinationFeature.projectId !== activeProject.id) {
        await touchProject(destinationFeature.projectId);
      }
      await reload();
      setMovePointTarget(null);
      toast.success(`Poin dipindahkan ke fitur "${destinationFeature.name}"`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal memindahkan poin.");
    } finally {
      setMovingPoint(false);
    }
  }

  return (
    <div className="w-full space-y-6">
      <section className="space-y-4">
        <div
          data-print-hide="true"
          className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground"
        >
          <Link to="/" className="hover:text-foreground">
            Dasbor
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <Link
            to="/projects/$projectId"
            params={{ projectId: activeProject.id }}
            search={{}}
            className="inline-flex items-center gap-1 hover:text-foreground"
          >
            {activeProject.name}
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="truncate font-medium text-foreground">{activeFeature.name}</span>
        </div>

        <div
          id={`feature-${activeFeature.id}`}
          className={cn(
            "arc-surface w-full rounded-2xl p-5 sm:p-6",
            highlightedTargetId === `feature-${activeFeature.id}` &&
              "arc-target-highlight border-primary ring-2 ring-primary/25",
          )}
        >
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="ghost" size="sm" asChild className="-ml-2 h-7 gap-1 px-2 text-xs">
                  <Link to="/projects/$projectId" params={{ projectId: activeProject.id }} search={{}}>
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Kembali ke Proyek
                  </Link>
                </Button>
                <Badge variant="secondary" className="gap-1 text-[11px]">
                  <Layers className="h-3 w-3" />
                  Detail Fitur
                </Badge>
                <Badge variant="outline" className="gap-1 text-[11px]">
                  <MessageSquareText className="h-3 w-3" />
                  {points.length} poin
                </Badge>
                <span className="text-xs text-muted-foreground">
                  · Diperbarui {formatDateTimeId(activeFeature.updatedAt)}
                </span>
              </div>

              {renaming ? (
                <form onSubmit={handleRenameSubmit} className="flex max-w-xl items-center gap-2">
                  <Input
                    value={nameDraft}
                    onChange={(event) => setNameDraft(event.target.value)}
                    className="text-lg font-bold"
                    autoFocus
                  />
                  <Button type="submit" size="icon" aria-label="Simpan nama fitur">
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setNameDraft(activeFeature.name);
                      setRenaming(false);
                    }}
                    aria-label="Batal ubah nama"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </form>
              ) : (
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                  {activeFeature.name}
                </h1>
              )}
            </div>

            <div data-print-hide="true" className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setRenaming(true)}
                className="gap-1.5 rounded-xl"
              >
                <Pencil className="h-3.5 w-3.5" />
                Ubah Nama
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => window.print()}
                className="gap-1.5 rounded-xl"
              >
                <Printer className="h-3.5 w-3.5" />
                Cetak / PDF
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  void softDeleteWithUndo({
                    type: "feature",
                    id: activeFeature.id,
                    label: `Fitur "${activeFeature.name}"`,
                    reload,
                  }).then(() => {
                    void navigate({
                      to: "/projects/$projectId",
                      params: { projectId: activeProject.id },
                      search: {},
                    });
                  });
                }}
                className="gap-1.5 rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Hapus Fitur
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="arc-surface w-full space-y-4 rounded-2xl p-5 sm:p-6">
        <div className="flex items-center justify-between gap-2">
          <Label
            htmlFor="feature-flow-notes"
            className="text-sm font-semibold text-foreground"
          >
            Catatan Alur Fitur
          </Label>
          <div data-print-hide="true" className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {savingNotes ? "Menyimpan..." : notesDirty ? "Belum disimpan" : "Tersimpan"}
            </span>
            {notesDirty && (
              <Button
                type="button"
                size="sm"
                onClick={() => void handleSaveNotes()}
                disabled={savingNotes}
                className="h-7 rounded-lg px-3 text-xs"
              >
                Simpan Catatan
              </Button>
            )}
          </div>
        </div>

        <Textarea
          id="feature-flow-notes"
          value={flowNotesDraft}
          onChange={(event) => setFlowNotesDraft(event.target.value)}
          onBlur={() => {
            if (notesDirty) void handleSaveNotes();
          }}
          placeholder="Jelaskan alur kerja, validasi, atau aturan bisnis khusus untuk fitur ini..."
          rows={3}
          className="w-full resize-y bg-background"
        />

        <AttachmentGallery
          ownerType="feature"
          ownerId={activeFeature.id}
          projectId={activeProject.id}
          title="Lampiran Gambar Fitur"
          emptyLabel="Belum ada lampiran gambar fitur. Seret gambar ke sini atau klik tambah."
        />
      </section>

      <section className="arc-surface w-full space-y-4 rounded-2xl p-5 sm:p-6">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-base font-semibold">
              Daftar Poin Kebutuhan Pelanggan ({points.length})
            </h2>
            <p className="text-xs text-muted-foreground">
              Seluruh poin masukan pelanggan untuk fitur ini ditampilkan dalam format tabel data.
            </p>
          </div>

          {points.length > 0 && (
            <div data-print-hide="true" className="flex flex-wrap items-center gap-2">
              <div className="relative w-full sm:w-56">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={tableQuery}
                  onChange={(event) => setTableQuery(event.target.value)}
                  placeholder="Cari di tabel poin..."
                  aria-label="Cari di tabel poin pelanggan"
                  className="h-8 pl-8 text-xs"
                />
              </div>

              <Select
                value={tableSourceFilter}
                onValueChange={(value) => setTableSourceFilter(value as PointSource | "all")}
              >
                <SelectTrigger className="h-8 w-full text-xs sm:w-36" aria-label="Filter sumber poin">
                  <SelectValue placeholder="Semua sumber" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua sumber</SelectItem>
                  {POINT_SOURCES.map((item) => (
                    <SelectItem key={item} value={item}>
                      {POINT_SOURCE_META[item].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <form
          data-print-hide="true"
          onSubmit={(event) => {
            event.preventDefault();
            void submitNewPoint();
          }}
          className="arc-inset space-y-2.5 rounded-xl p-3"
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <Textarea
              value={pointContent}
              onChange={(event) => setPointContent(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void submitNewPoint();
                }
              }}
              placeholder="Tambah cepat poin pelanggan... (Enter untuk simpan, Shift+Enter baris baru)"
              rows={2}
              aria-label="Tambah poin kebutuhan pelanggan"
              className="min-h-[56px] flex-1 bg-background text-sm"
            />

            <div className="flex shrink-0 items-center gap-1.5">
              <input
                ref={quickImageInputRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                multiple
                className="hidden"
                onChange={(event) => {
                  handleSelectPendingImages(event.target.files);
                  event.target.value = "";
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => quickImageInputRef.current?.click()}
                title="Lampirkan gambar pada poin ini"
                aria-label="Lampirkan gambar pada poin baru"
                className="h-9 w-9 bg-background"
              >
                <ImagePlus className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant={showPointMeta ? "secondary" : "outline"}
                size="icon"
                onClick={() => setShowPointMeta((prev) => !prev)}
                title="Tanggal, sumber & narasumber"
                aria-label="Atur tanggal, sumber, dan narasumber poin"
                className="h-9 w-9 bg-background"
              >
                <SlidersHorizontal className="h-4 w-4" />
              </Button>
              <Button type="submit" disabled={addingPoint} className="h-9 gap-1.5 rounded-lg">
                <Plus className="h-4 w-4" />
                <span>{addingPoint ? "Menyimpan..." : "Tambah Poin"}</span>
              </Button>
            </div>
          </div>

          {pendingImages.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {pendingImages.map((file, idx) => (
                <Badge
                  key={`${file.name}-${idx}`}
                  variant="secondary"
                  className="gap-1.5 py-0.5 pr-1 text-[11px]"
                >
                  <span className="max-w-40 truncate">{file.name}</span>
                  <button
                    type="button"
                    onClick={() =>
                      setPendingImages((prev) => prev.filter((_, itemIdx) => itemIdx !== idx))
                    }
                    aria-label={`Batalkan lampiran ${file.name}`}
                    className="rounded-full p-0.5 hover:bg-background"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}

          {showPointMeta && (
            <div className="grid grid-cols-1 gap-2 border-t pt-2.5 sm:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Tanggal Disebutkan</Label>
                <Input
                  type="date"
                  value={pointMentionedOn}
                  onChange={(event) => setPointMentionedOn(event.target.value)}
                  className="h-8 bg-background text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Sumber</Label>
                <Select
                  value={pointSource}
                  onValueChange={(value) => setPointSource(value as PointSource)}
                >
                  <SelectTrigger className="h-8 bg-background text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {POINT_SOURCES.map((item) => (
                      <SelectItem key={item} value={item}>
                        {POINT_SOURCE_META[item].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">
                  Disampaikan Oleh (Opsional)
                </Label>
                <Input
                  value={pointStatedBy}
                  onChange={(event) => setPointStatedBy(event.target.value)}
                  placeholder="Contoh: Bu Ratna"
                  className="h-8 bg-background text-xs"
                />
              </div>
            </div>
          )}
        </form>

        {points.length === 0 ? (
          <div className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
            Belum ada poin kebutuhan pelanggan untuk fitur ini. Tambahkan cepat melalui formulir di
            atas.
          </div>
        ) : filteredPoints.length === 0 ? (
          <div className="rounded-xl border border-dashed px-4 py-10 text-center">
            <p className="text-sm font-medium">Tidak ada poin yang sesuai filter</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setTableQuery("");
                setTableSourceFilter("all");
              }}
              className="mt-3"
            >
              Reset Filter Tabel
            </Button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border bg-background">
            <Table className="min-w-[760px]">
              <TableHeader className="bg-muted/45">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-16 text-center">No</TableHead>
                  <TableHead>Poin Kebutuhan Pelanggan</TableHead>
                  <TableHead className="w-28">Sumber</TableHead>
                  <TableHead className="w-40">Narasumber</TableHead>
                  <TableHead className="w-32">Tanggal</TableHead>
                  <TableHead className="w-36">Lampiran</TableHead>
                  <TableHead data-print-hide="true" className="w-36 text-right">
                    Aksi
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPoints.map((point) => {
                  const realIndex = points.findIndex((item) => item.id === point.id);
                  const sourceMeta = POINT_SOURCE_META[point.source];
                  const pointAttachments = pointAttachmentsMap.get(point.id) ?? [];
                  const isHighlighted = highlightedTargetId === `point-${point.id}`;

                  return (
                    <TableRow
                      key={point.id}
                      id={`point-${point.id}`}
                      className={cn(
                        "print-avoid-break align-top",
                        isHighlighted && "arc-target-highlight bg-primary/5",
                      )}
                    >
                      <TableCell className="py-3 text-center text-xs font-semibold text-muted-foreground">
                        {realIndex + 1}
                      </TableCell>

                      <TableCell className="py-3">
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                          {point.content}
                        </p>
                      </TableCell>

                      <TableCell className="py-3">
                        <Badge
                          variant="outline"
                          className={cn("text-[11px]", sourceMeta.badgeClass)}
                        >
                          {sourceMeta.label}
                        </Badge>
                      </TableCell>

                      <TableCell className="py-3 text-xs text-muted-foreground">
                        {point.statedBy || "—"}
                      </TableCell>

                      <TableCell className="py-3 text-xs whitespace-nowrap text-muted-foreground">
                        {point.mentionedOn ? formatDateId(point.mentionedOn) : "—"}
                      </TableCell>

                      <TableCell className="py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {pointAttachments.map((att) => {
                            const thumb = pointThumbnails[att.id];
                            return (
                              <button
                                key={att.id}
                                type="button"
                                onClick={() => setAttachmentModalPoint(point)}
                                title={att.caption || att.originalName}
                                className="h-9 w-11 overflow-hidden rounded-md border bg-muted/40 transition-opacity hover:opacity-85"
                              >
                                {thumb ? (
                                  <img
                                    src={thumb}
                                    alt={att.caption || att.originalName}
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <ImageIcon className="mx-auto h-3.5 w-3.5 text-muted-foreground" />
                                )}
                              </button>
                            );
                          })}
                          <Button
                            data-print-hide="true"
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setAttachmentModalPoint(point)}
                            className="h-8 gap-1 px-2 text-[11px]"
                          >
                            <ImagePlus className="h-3 w-3" />
                            <span>
                              {pointAttachments.length > 0 ? pointAttachments.length : "Gambar"}
                            </span>
                          </Button>
                        </div>
                      </TableCell>

                      <TableCell data-print-hide="true" className="py-3 text-right">
                        <div className="inline-flex items-center justify-end gap-0.5">
                          {!isFiltered && (
                            <>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                disabled={realIndex === 0}
                                onClick={() => void handleMovePointOrder(point.id, "up")}
                                aria-label="Naikkan urutan poin"
                              >
                                <ArrowUp className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                disabled={realIndex === points.length - 1}
                                onClick={() => void handleMovePointOrder(point.id, "down")}
                                aria-label="Turunkan urutan poin"
                              >
                                <ArrowDown className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}

                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            onClick={() => openEditDialog(point)}
                            aria-label="Edit poin"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>

                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                aria-label="Menu aksi poin"
                              >
                                <MoreHorizontal className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openEditDialog(point)}>
                                <Pencil className="h-4 w-4" />
                                Edit Poin
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setAttachmentModalPoint(point)}>
                                <ImageIcon className="h-4 w-4" />
                                Kelola Lampiran Gambar
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => void handleDuplicatePoint(point)}>
                                <Copy className="h-4 w-4" />
                                Duplikat Poin
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={allActiveFeatures.length <= 1}
                                onClick={() => {
                                  const fallback = allActiveFeatures.find(
                                    (item) => item.id !== point.featureId,
                                  );
                                  setDestinationFeatureId(fallback?.id ?? point.featureId);
                                  setMovePointTarget(point);
                                }}
                              >
                                <ArrowRightLeft className="h-4 w-4" />
                                Pindah ke Fitur Lain
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() =>
                                  void softDeleteWithUndo({
                                    type: "point",
                                    id: point.id,
                                    label: "Poin pelanggan",
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
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {/* Edit Poin Dialog */}
      <Dialog
        open={Boolean(editingPoint)}
        onOpenChange={(open) => {
          if (!open) setEditingPoint(null);
        }}
      >
        <DialogContent className="sm:rounded-2xl">
          <DialogHeader>
            <DialogTitle>Edit Poin Pelanggan</DialogTitle>
            <DialogDescription>
              Perbarui isi kebutuhan pelanggan, sumber, tanggal, atau narasumber.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveEditPoint} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-point-content">Isi Poin</Label>
              <Textarea
                id="edit-point-content"
                value={editContent}
                onChange={(event) => setEditContent(event.target.value)}
                rows={3}
                autoFocus
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-point-date">Tanggal</Label>
                <Input
                  id="edit-point-date"
                  type="date"
                  value={editMentionedOn}
                  onChange={(event) => setEditMentionedOn(event.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-point-source">Sumber</Label>
                <Select
                  value={editSource}
                  onValueChange={(value) => setEditSource(value as PointSource)}
                >
                  <SelectTrigger id="edit-point-source">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {POINT_SOURCES.map((item) => (
                      <SelectItem key={item} value={item}>
                        {POINT_SOURCE_META[item].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-point-speaker">Narasumber</Label>
                <Input
                  id="edit-point-speaker"
                  value={editStatedBy}
                  onChange={(event) => setEditStatedBy(event.target.value)}
                  placeholder="Opsional"
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditingPoint(null)}
                disabled={savingEdit}
              >
                Batal
              </Button>
              <Button type="submit" disabled={savingEdit}>
                {savingEdit ? "Menyimpan..." : "Simpan Perubahan"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Attachment Management Dialog for a Point */}
      <Dialog
        open={Boolean(attachmentModalPoint)}
        onOpenChange={(open) => {
          if (!open) setAttachmentModalPoint(null);
        }}
      >
        <DialogContent className="sm:rounded-2xl">
          {attachmentModalPoint && (
            <>
              <DialogHeader>
                <DialogTitle>Lampiran Gambar Poin Pelanggan</DialogTitle>
                <DialogDescription className="line-clamp-2">
                  {attachmentModalPoint.content}
                </DialogDescription>
              </DialogHeader>
              <AttachmentGallery
                ownerType="point"
                ownerId={attachmentModalPoint.id}
                projectId={activeProject.id}
                title="Gambar Poin"
                emptyLabel="Belum ada lampiran gambar pada poin ini. Seret gambar ke sini atau klik tambah."
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setAttachmentModalPoint(null)}>
                  Selesai
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Move Point to Another Feature Dialog */}
      <Dialog
        open={Boolean(movePointTarget)}
        onOpenChange={(open) => {
          if (!open) setMovePointTarget(null);
        }}
      >
        <DialogContent className="sm:rounded-2xl">
          <DialogHeader>
            <DialogTitle>Pindahkan Poin Pelanggan</DialogTitle>
            <DialogDescription>
              Pilih fitur tujuan untuk memindahkan poin ini beserta lampiran gambarnya.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleMovePointFeature} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="move-point-destination">Fitur Tujuan</Label>
              <Select value={destinationFeatureId} onValueChange={setDestinationFeatureId}>
                <SelectTrigger id="move-point-destination">
                  <SelectValue placeholder="Pilih fitur tujuan..." />
                </SelectTrigger>
                <SelectContent>
                  {activeProjects.map((proj) => {
                    const projFeatures = allActiveFeatures.filter(
                      (item) => item.projectId === proj.id && item.id !== movePointTarget?.featureId,
                    );
                    if (projFeatures.length === 0) return null;
                    return (
                      <SelectGroup key={proj.id}>
                        <SelectLabel>{proj.name}</SelectLabel>
                        {projFeatures.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setMovePointTarget(null)}
                disabled={movingPoint}
              >
                Batal
              </Button>
              <Button
                type="submit"
                disabled={movingPoint || destinationFeatureId === movePointTarget?.featureId}
              >
                {movingPoint ? "Memindahkan..." : "Pindahkan Poin"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
