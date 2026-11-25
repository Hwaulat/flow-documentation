import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  FolderKanban,
  Image as ImageIcon,
  Layers,
  MessageSquareText,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAppData } from "@/lib/app-data";
import { formatBytes, formatDateTimeId } from "@/lib/formatters";
import {
  getAttachment,
  purgeAllTrash,
  purgeDeleted,
  restoreWithAncestors,
  type TrashType,
} from "@/lib/local-db";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/trash")({
  head: () => ({
    meta: [{ title: "Sampah — FlowDoc" }],
  }),
  component: TrashPage,
});

interface TrashItem {
  id: string;
  type: TrashType;
  title: string;
  subtitle: string;
  deletedAt: string;
  hasTrashedAncestor: boolean;
  metaText?: string;
}

const TYPE_META: Record<
  TrashType,
  { label: string; icon: typeof FolderKanban; badgeClass: string }
> = {
  project: {
    label: "Proyek",
    icon: FolderKanban,
    badgeClass: "border-primary/25 bg-primary/8 text-primary",
  },
  feature: {
    label: "Fitur",
    icon: Layers,
    badgeClass: "border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  },
  point: {
    label: "Poin Pelanggan",
    icon: MessageSquareText,
    badgeClass: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  attachment: {
    label: "Lampiran Gambar",
    icon: ImageIcon,
    badgeClass: "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
};

function TrashPage() {
  const { snapshot, ready, reload } = useAppData();

  const [filterType, setFilterType] = useState<"all" | TrashType>("all");
  const [confirmTarget, setConfirmTarget] = useState<TrashItem | null>(null);
  const [confirmEmptyAll, setConfirmEmptyAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});

  const projectMap = useMemo(
    () => new Map(snapshot.projects.map((project) => [project.id, project])),
    [snapshot.projects],
  );
  const featureMap = useMemo(
    () => new Map(snapshot.features.map((feature) => [feature.id, feature])),
    [snapshot.features],
  );
  const pointMap = useMemo(
    () => new Map(snapshot.points.map((point) => [point.id, point])),
    [snapshot.points],
  );

  const trashItems = useMemo<TrashItem[]>(() => {
    const items: TrashItem[] = [];

    for (const project of snapshot.projects) {
      if (!project.deletedAt) continue;
      items.push({
        id: project.id,
        type: "project",
        title: project.name,
        subtitle: project.customerName ? `Pelanggan: ${project.customerName}` : "Proyek",
        deletedAt: project.deletedAt,
        hasTrashedAncestor: false,
      });
    }

    for (const feature of snapshot.features) {
      if (!feature.deletedAt) continue;
      const parentProject = projectMap.get(feature.projectId);
      items.push({
        id: feature.id,
        type: "feature",
        title: feature.name,
        subtitle: parentProject ? `Proyek: ${parentProject.name}` : "Proyek induk tidak ditemukan",
        deletedAt: feature.deletedAt,
        hasTrashedAncestor: Boolean(parentProject?.deletedAt),
      });
    }

    for (const point of snapshot.points) {
      if (!point.deletedAt) continue;
      const parentFeature = featureMap.get(point.featureId);
      const parentProject = parentFeature ? projectMap.get(parentFeature.projectId) : undefined;
      items.push({
        id: point.id,
        type: "point",
        title: point.content,
        subtitle:
          parentProject && parentFeature
            ? `${parentProject.name} / ${parentFeature.name}`
            : parentFeature
              ? parentFeature.name
              : "Fitur induk tidak ditemukan",
        deletedAt: point.deletedAt,
        hasTrashedAncestor: Boolean(parentFeature?.deletedAt || parentProject?.deletedAt),
      });
    }

    for (const attachment of snapshot.attachments) {
      if (!attachment.deletedAt) continue;
      let context = "Lampiran proyek";
      let ancestorTrashed = false;
      if (attachment.ownerType === "project") {
        const proj = projectMap.get(attachment.ownerId);
        context = proj ? `Proyek: ${proj.name}` : "Proyek tidak ditemukan";
        ancestorTrashed = Boolean(proj?.deletedAt);
      } else if (attachment.ownerType === "feature") {
        const feat = featureMap.get(attachment.ownerId);
        const proj = feat ? projectMap.get(feat.projectId) : undefined;
        context = feat ? `Fitur: ${feat.name}` : "Fitur tidak ditemukan";
        ancestorTrashed = Boolean(feat?.deletedAt || proj?.deletedAt);
      } else if (attachment.ownerType === "point") {
        const pt = pointMap.get(attachment.ownerId);
        const feat = pt ? featureMap.get(pt.featureId) : undefined;
        const proj = feat ? projectMap.get(feat.projectId) : undefined;
        context = pt ? `Poin: ${pt.content.slice(0, 60)}` : "Poin tidak ditemukan";
        ancestorTrashed = Boolean(pt?.deletedAt || feat?.deletedAt || proj?.deletedAt);
      }

      items.push({
        id: attachment.id,
        type: "attachment",
        title: attachment.originalName,
        subtitle: context,
        deletedAt: attachment.deletedAt,
        hasTrashedAncestor: ancestorTrashed,
        metaText: formatBytes(attachment.size),
      });
    }

    return items.sort((left, right) => right.deletedAt.localeCompare(left.deletedAt));
  }, [snapshot, projectMap, featureMap, pointMap]);

  const trashedAttachmentKey = useMemo(
    () =>
      trashItems
        .filter((item) => item.type === "attachment")
        .map((item) => item.id)
        .join(","),
    [trashItems],
  );

  useEffect(() => {
    let active = true;
    const urls: string[] = [];

    async function loadThumbnails() {
      const next: Record<string, string> = {};
      for (const item of trashItems) {
        if (item.type !== "attachment") continue;
        try {
          const stored = await getAttachment(item.id);
          if (stored && active) {
            const url = URL.createObjectURL(stored.blob);
            urls.push(url);
            next[item.id] = url;
          }
        } catch {
          // Ignore unreadable blob
        }
      }
      if (active) setThumbnails(next);
      else for (const url of urls) URL.revokeObjectURL(url);
    }

    if (trashedAttachmentKey) void loadThumbnails();
    else setThumbnails({});

    return () => {
      active = false;
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, [trashedAttachmentKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredItems = useMemo(
    () =>
      filterType === "all"
        ? trashItems
        : trashItems.filter((item) => item.type === filterType),
    [trashItems, filterType],
  );

  async function handleRestore(item: TrashItem) {
    setBusy(true);
    try {
      await restoreWithAncestors(item.type, item.id);
      await reload();
      toast.success(
        item.hasTrashedAncestor
          ? `${TYPE_META[item.type].label} dan item induknya berhasil dipulihkan`
          : `${TYPE_META[item.type].label} berhasil dipulihkan`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal memulihkan item.");
    } finally {
      setBusy(false);
    }
  }

  async function handlePurgeSingle() {
    if (!confirmTarget) return;
    setBusy(true);
    try {
      await purgeDeleted(confirmTarget.type, confirmTarget.id);
      await reload();
      toast.success("Item dihapus secara permanen");
      setConfirmTarget(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal menghapus permanen.");
    } finally {
      setBusy(false);
    }
  }

  async function handleEmptyTrash() {
    setBusy(true);
    try {
      await purgeAllTrash();
      await reload();
      toast.success("Seluruh sampah berhasil dikosongkan");
      setConfirmEmptyAll(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal mengosongkan sampah.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Sampah</h1>
          <p className="text-sm text-muted-foreground">
            Item yang dihapus disimpan sementara di sini. Anda dapat memulihkannya kapan saja atau
            menghapusnya secara permanen.
          </p>
        </div>

        {trashItems.length > 0 && (
          <Button
            type="button"
            variant="destructive"
            onClick={() => setConfirmEmptyAll(true)}
            disabled={busy}
            className="gap-1.5 rounded-xl"
          >
            <Trash2 className="h-4 w-4" />
            Kosongkan Sampah ({trashItems.length})
          </Button>
        )}
      </section>

      {trashItems.length > 0 && (
        <section className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { key: "all", label: `Semua (${trashItems.length})` },
              {
                key: "project",
                label: `Proyek (${trashItems.filter((item) => item.type === "project").length})`,
              },
              {
                key: "feature",
                label: `Fitur (${trashItems.filter((item) => item.type === "feature").length})`,
              },
              {
                key: "point",
                label: `Poin (${trashItems.filter((item) => item.type === "point").length})`,
              },
              {
                key: "attachment",
                label: `Gambar (${trashItems.filter((item) => item.type === "attachment").length})`,
              },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setFilterType(tab.key)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                filterType === tab.key
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "bg-secondary/80 text-secondary-foreground hover:bg-secondary",
              )}
            >
              {tab.label}
            </button>
          ))}
        </section>
      )}

      {!ready ? (
        <div className="arc-surface rounded-2xl p-8 text-center text-sm text-muted-foreground">
          Memuat daftar sampah...
        </div>
      ) : trashItems.length === 0 ? (
        <section className="arc-surface flex flex-col items-center justify-center rounded-2xl px-6 py-14 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <Trash2 className="h-6 w-6" />
          </div>
          <h2 className="mt-4 text-lg font-semibold">Sampah kosong</h2>
          <p className="mt-1.5 max-w-md text-sm text-muted-foreground">
            Proyek, fitur, poin pelanggan, dan lampiran gambar yang dihapus akan muncul di sini
            sebelum dihapus permanen.
          </p>
          <Button asChild variant="outline" className="mt-5 rounded-xl">
            <Link to="/">Kembali ke Dasbor</Link>
          </Button>
        </section>
      ) : filteredItems.length === 0 ? (
        <section className="arc-surface rounded-2xl p-8 text-center text-sm text-muted-foreground">
          Tidak ada item pada kategori ini.
        </section>
      ) : (
        <section className="space-y-2.5">
          {filteredItems.map((item) => {
            const meta = TYPE_META[item.type];
            const Icon = meta.icon;
            const thumbUrl = item.type === "attachment" ? thumbnails[item.id] : undefined;

            return (
              <div
                key={`${item.type}-${item.id}`}
                className="arc-surface flex flex-col justify-between gap-4 rounded-2xl p-4 sm:flex-row sm:items-center"
              >
                <div className="flex min-w-0 items-start gap-3">
                  {thumbUrl ? (
                    <img
                      src={thumbUrl}
                      alt={item.title}
                      className="h-12 w-16 shrink-0 rounded-lg border object-cover"
                    />
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                      <Icon className="h-4 w-4" />
                    </div>
                  )}

                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline" className={cn("text-[11px]", meta.badgeClass)}>
                        {meta.label}
                      </Badge>
                      {item.hasTrashedAncestor && (
                        <Badge
                          variant="outline"
                          className="border-amber-500/30 bg-amber-500/10 text-[11px] text-amber-700 dark:text-amber-300"
                        >
                          Induk juga di Sampah
                        </Badge>
                      )}
                      {item.metaText && (
                        <span className="text-[11px] text-muted-foreground">{item.metaText}</span>
                      )}
                    </div>

                    <p className="line-clamp-2 text-sm font-semibold text-foreground">{item.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.subtitle} · Dihapus {formatDateTimeId(item.deletedAt)}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => void handleRestore(item)}
                    className="gap-1.5 rounded-lg"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    {item.hasTrashedAncestor ? "Pulihkan + Induk" : "Pulihkan"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => setConfirmTarget(item)}
                    className="gap-1.5 rounded-lg text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Hapus Permanen
                  </Button>
                </div>
              </div>
            );
          })}
        </section>
      )}

      <AlertDialog
        open={Boolean(confirmTarget)}
        onOpenChange={(open) => {
          if (!open) setConfirmTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Hapus Permanen?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmTarget
                ? `“${confirmTarget.title}” akan dihapus secara permanen dari penyimpanan lokal beserta seluruh turunannya dan tidak dapat dipulihkan lagi.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handlePurgeSingle()}
              disabled={busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {busy ? "Menghapus..." : "Ya, Hapus Permanen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmEmptyAll} onOpenChange={setConfirmEmptyAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Kosongkan Seluruh Sampah?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Semua item di Sampah ({trashItems.length} item) termasuk turunan dan lampiran
              gambarnya akan dihapus permanen. Tindakan ini tidak dapat dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleEmptyTrash()}
              disabled={busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {busy ? "Mengosongkan..." : "Ya, Kosongkan Semua"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
