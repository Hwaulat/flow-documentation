import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Download,
  FileArchive,
  FileJson,
  HardDrive,
  Printer,
  ShieldCheck,
  Trash2,
  Upload,
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
import { Progress } from "@/components/ui/progress";
import { useAppData } from "@/lib/app-data";
import {
  backupFileName,
  createBackupArchive,
  createJsonExport,
  createProjectMarkdownArchive,
  downloadFile,
  projectExportName,
  restoreBackupFile,
} from "@/lib/archive";
import { formatBytes, formatDateTimeId, PROJECT_STATUS_META } from "@/lib/formatters";
import {
  clearAllLocalData,
  currentTimestamp,
  saveLastBackupAt,
  type ProjectRecord,
} from "@/lib/local-db";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/backup")({
  head: () => ({
    meta: [{ title: "Cadangan & Ekspor — FlowDoc" }],
  }),
  component: BackupPage,
});

interface StorageQuotaState {
  usage: number | null;
  quota: number | null;
  persisted: boolean | null;
}

function BackupPage() {
  const { snapshot, reload } = useAppData();
  const restoreInputRef = useRef<HTMLInputElement>(null);

  const [quotaInfo, setQuotaInfo] = useState<StorageQuotaState>({
    usage: null,
    quota: null,
    persisted: null,
  });
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [pendingRestoreFile, setPendingRestoreFile] = useState<File | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  useEffect(() => {
    let active = true;
    if (typeof navigator !== "undefined" && navigator.storage?.estimate) {
      void Promise.all([
        navigator.storage.estimate(),
        navigator.storage.persisted ? navigator.storage.persisted() : Promise.resolve(null),
      ])
        .then(([estimate, persisted]) => {
          if (active) {
            setQuotaInfo({
              usage: typeof estimate.usage === "number" ? estimate.usage : null,
              quota: typeof estimate.quota === "number" ? estimate.quota : null,
              persisted,
            });
          }
        })
        .catch(() => {
          // Ignore browsers blocking storage estimate
        });
    }
    return () => {
      active = false;
    };
  }, [snapshot]);

  const stats = useMemo(() => {
    const activeProjects = snapshot.projects.filter((item) => item.deletedAt === null);
    const activeFeatures = snapshot.features.filter((item) => item.deletedAt === null);
    const activePoints = snapshot.points.filter((item) => item.deletedAt === null);
    const activeAttachments = snapshot.attachments.filter((item) => item.deletedAt === null);
    const trashedCount =
      snapshot.projects.filter((item) => item.deletedAt !== null).length +
      snapshot.features.filter((item) => item.deletedAt !== null).length +
      snapshot.points.filter((item) => item.deletedAt !== null).length +
      snapshot.attachments.filter((item) => item.deletedAt !== null).length;
    const attachmentBytes = snapshot.attachments.reduce((sum, item) => sum + item.size, 0);
    const jsonEstimateBytes = new Blob([
      JSON.stringify({
        projects: snapshot.projects,
        features: snapshot.features,
        points: snapshot.points,
        attachments: snapshot.attachments,
      }),
    ]).size;

    return {
      activeProjects: activeProjects.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
      activeFeaturesCount: activeFeatures.length,
      activePointsCount: activePoints.length,
      activeAttachmentsCount: activeAttachments.length,
      trashedCount,
      attachmentBytes,
      totalDataBytes: attachmentBytes + jsonEstimateBytes,
    };
  }, [snapshot]);

  const backupStatus = useMemo(() => {
    if (!snapshot.lastBackupAt) {
      return {
        tone: "warning" as const,
        label: "Belum Pernah Dicadangkan",
        detail: "Unduh arsip cadangan .zip agar data aman jika cache peramban dibersihkan.",
      };
    }
    const ageMs = Date.now() - new Date(snapshot.lastBackupAt).getTime();
    const days = Math.floor(ageMs / (1000 * 60 * 60 * 24));
    if (days >= 7) {
      return {
        tone: "warning" as const,
        label: `Cadangan Terakhir ${days} Hari Lalu`,
        detail: `Terakhir dicadangkan pada ${formatDateTimeId(snapshot.lastBackupAt)}. Disarankan mencadangkan ulang.`,
      };
    }
    return {
      tone: "ok" as const,
      label: "Cadangan Terbaru Tersedia",
      detail: `Terakhir dicadangkan pada ${formatDateTimeId(snapshot.lastBackupAt)}.`,
    };
  }, [snapshot.lastBackupAt]);

  async function handleDownloadBackup() {
    setBusyAction("backup");
    try {
      const timestamp = currentTimestamp();
      await saveLastBackupAt(timestamp);
      const blob = await createBackupArchive();
      downloadFile(blob, backupFileName("flowdoc-cadangan", "zip"));
      await reload();
      toast.success("Arsip cadangan (.zip) berhasil diunduh");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal membuat arsip cadangan.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDownloadJson() {
    setBusyAction("json");
    try {
      const blob = await createJsonExport();
      downloadFile(blob, backupFileName("flowdoc-ekspor", "json"));
      toast.success("Ekspor JSON lengkap berhasil diunduh");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal mengekspor JSON.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleConfirmRestore() {
    if (!pendingRestoreFile) return;
    setBusyAction("restore");
    try {
      await restoreBackupFile(pendingRestoreFile);
      await reload();
      toast.success("Data berhasil dipulihkan dari file cadangan");
      setPendingRestoreFile(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal memulihkan cadangan.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleConfirmClearAll() {
    setBusyAction("clear");
    try {
      await clearAllLocalData();
      await reload();
      setConfirmClearAll(false);
      toast.success("Seluruh data lokal berhasil dihapus");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal menghapus data lokal.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleProjectMarkdown(project: ProjectRecord) {
    setBusyAction(`md-${project.id}`);
    try {
      const blob = await createProjectMarkdownArchive(project.id);
      downloadFile(blob, projectExportName(project.name, "zip"));
      toast.success(`Markdown "${project.name}" berhasil diunduh`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal mengekspor Markdown proyek.");
    } finally {
      setBusyAction(null);
    }
  }

  const quotaPercent =
    quotaInfo.usage !== null && quotaInfo.quota !== null && quotaInfo.quota > 0
      ? Math.min(100, Math.max(1, Math.round((quotaInfo.usage / quotaInfo.quota) * 100)))
      : null;

  return (
    <div className="space-y-6">
      <section className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Cadangan &amp; Ekspor Data</h1>
        <p className="text-sm text-muted-foreground">
          Kelola arsip cadangan lengkap, pemulihan data, ekspor Markdown/PDF per proyek, serta
          pantau penggunaan penyimpanan lokal peramban.
        </p>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="arc-surface space-y-4 rounded-2xl p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                <h2 className="text-base font-semibold">Status Cadangan</h2>
              </div>
              <p className="text-xs text-muted-foreground">{backupStatus.detail}</p>
            </div>
            <Badge
              variant="outline"
              className={cn(
                "shrink-0",
                backupStatus.tone === "ok"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
              )}
            >
              {backupStatus.tone === "ok" && <CheckCircle2 className="mr-1 h-3 w-3" />}
              {backupStatus.label}
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-2.5 rounded-xl border bg-muted/35 p-3.5 text-xs">
            <div>
              <p className="text-muted-foreground">Proyek Aktif</p>
              <p className="mt-0.5 text-sm font-semibold">{stats.activeProjects.length}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Fitur &amp; Poin Aktif</p>
              <p className="mt-0.5 text-sm font-semibold">
                {stats.activeFeaturesCount} fitur · {stats.activePointsCount} poin
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Lampiran Gambar</p>
              <p className="mt-0.5 text-sm font-semibold">
                {stats.activeAttachmentsCount} file ({formatBytes(stats.attachmentBytes)})
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Item di Sampah</p>
              <p className="mt-0.5 text-sm font-semibold">{stats.trashedCount} item</p>
            </div>
          </div>
        </div>

        <div className="arc-surface space-y-4 rounded-2xl p-5">
          <div className="flex items-center gap-2">
            <HardDrive className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold">Batas &amp; Penggunaan Penyimpanan Lokal</h2>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Seluruh catatan dan gambar disimpan langsung di <strong>IndexedDB</strong> pada profil
            peramban dan perangkat ini saja (bukan file SQLite terpisah dan tanpa server/login).
            Menghapus data situs peramban akan menghapus isi workspace jika belum dicadangkan.
          </p>

          <div className="space-y-2 rounded-xl border bg-muted/35 p-3.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-foreground">Perkiraan ukuran data dokumentasi</span>
              <span className="font-semibold">{formatBytes(stats.totalDataBytes)}</span>
            </div>

            {quotaInfo.usage !== null && quotaInfo.quota !== null && (
              <>
                <Progress value={quotaPercent ?? 1} className="h-2" />
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>Terpakai di origin ini: {formatBytes(quotaInfo.usage)}</span>
                  <span>Kuota peramban: {formatBytes(quotaInfo.quota)}</span>
                </div>
                {quotaInfo.persisted !== null && (
                  <p className="text-[11px] text-muted-foreground">
                    Mode penyimpanan persisten:{" "}
                    <strong className="text-foreground">
                      {quotaInfo.persisted ? "Aktif (tidak otomatis dihapus browser)" : "Standar"}
                    </strong>
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="arc-surface flex flex-col justify-between gap-4 rounded-2xl p-5">
          <div className="space-y-1.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <FileArchive className="h-4 w-4" />
            </div>
            <h2 className="text-base font-semibold">Cadangan Lengkap (.zip)</h2>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Menyimpan seluruh proyek, fitur, poin pelanggan, isi Sampah, serta semua file gambar
              asli dalam satu arsip portabel.
            </p>
          </div>
          <Button
            type="button"
            onClick={() => void handleDownloadBackup()}
            disabled={busyAction !== null}
            className="w-full gap-1.5 rounded-xl"
          >
            <Download className="h-4 w-4" />
            {busyAction === "backup" ? "Menyiapkan Arsip..." : "Unduh Cadangan (.zip)"}
          </Button>
        </div>

        <div className="arc-surface flex flex-col justify-between gap-4 rounded-2xl p-5">
          <div className="space-y-1.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400">
              <FileJson className="h-4 w-4" />
            </div>
            <h2 className="text-base font-semibold">Ekspor JSON Lengkap</h2>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Mengekspor seluruh struktur data beserta gambar yang disisipkan (base64) dalam satu
              file JSON untuk arsip atau integrasi teknis.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleDownloadJson()}
            disabled={busyAction !== null}
            className="w-full gap-1.5 rounded-xl"
          >
            <Download className="h-4 w-4" />
            {busyAction === "json" ? "Menyiapkan JSON..." : "Unduh Ekspor (.json)"}
          </Button>
        </div>

        <div className="arc-surface flex flex-col justify-between gap-4 rounded-2xl p-5">
          <div className="space-y-1.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Upload className="h-4 w-4" />
            </div>
            <h2 className="text-base font-semibold">Pulihkan Cadangan</h2>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Pilih file cadangan <code>.zip</code> atau ekspor <code>.json</code> untuk
              mengembalikan seluruh data ke peramban ini.
            </p>
          </div>
          <div>
            <input
              ref={restoreInputRef}
              type="file"
              accept=".zip,.json,application/zip,application/json"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  setPendingRestoreFile(file);
                  event.target.value = "";
                }
              }}
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => restoreInputRef.current?.click()}
              disabled={busyAction !== null}
              className="w-full gap-1.5 rounded-xl"
            >
              <Upload className="h-4 w-4" />
              Pilih File Cadangan (.zip / .json)
            </Button>
          </div>
        </div>
      </section>

      <section className="arc-surface rounded-2xl p-5">
        <div className="mb-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-base font-semibold">Ekspor Per Proyek (Markdown &amp; PDF)</h2>
            <p className="text-xs text-muted-foreground">
              Unduh paket Markdown beserta folder gambar per proyek atau cetak langsung ke PDF.
            </p>
          </div>
          <Archive className="hidden h-4 w-4 text-muted-foreground sm:block" />
        </div>

        {stats.activeProjects.length === 0 ? (
          <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            Belum ada proyek aktif yang dapat diekspor.{" "}
            <Link to="/" className="font-medium text-primary underline-offset-4 hover:underline">
              Buat proyek di Dasbor
            </Link>
            .
          </div>
        ) : (
          <div className="divide-y rounded-xl border">
            {stats.activeProjects.map((project) => {
              const statusMeta = PROJECT_STATUS_META[project.status];
              return (
                <div
                  key={project.id}
                  className="flex flex-col justify-between gap-3 p-3.5 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        to="/projects/$projectId"
                        params={{ projectId: project.id }}
                        search={{}}
                        className="truncate text-sm font-semibold hover:underline"
                      >
                        {project.name}
                      </Link>
                      <Badge variant="outline" className={cn("text-[10px]", statusMeta.badgeClass)}>
                        {statusMeta.label}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {project.customerName || "Tanpa pelanggan"} · Diperbarui{" "}
                      {formatDateTimeId(project.updatedAt)}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busyAction !== null}
                      onClick={() => void handleProjectMarkdown(project)}
                      className="gap-1.5 rounded-lg text-xs"
                    >
                      <Download className="h-3.5 w-3.5" />
                      {busyAction === `md-${project.id}` ? "Menyiapkan..." : "Markdown (.zip)"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      asChild
                      className="gap-1.5 rounded-lg text-xs"
                    >
                      <Link
                        to="/projects/$projectId"
                        params={{ projectId: project.id }}
                        search={{ print: "1" }}
                      >
                        <Printer className="h-3.5 w-3.5" />
                        Ekspor PDF
                      </Link>
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="arc-surface flex flex-col justify-between gap-4 rounded-2xl border-destructive/25 p-5 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-destructive">Reset Penyimpanan Lokal</h2>
          <p className="text-xs text-muted-foreground">
            Menghapus seluruh proyek, fitur, poin pelanggan, isi Sampah, dan lampiran gambar di
            peramban ini secara permanen untuk memulai dari kondisi kosong.
          </p>
        </div>
        <Button
          type="button"
          variant="destructive"
          onClick={() => setConfirmClearAll(true)}
          disabled={busyAction !== null}
          className="shrink-0 gap-1.5 rounded-xl"
        >
          <Trash2 className="h-4 w-4" />
          Hapus Semua Data Lokal
        </Button>
      </section>

      <AlertDialog
        open={Boolean(pendingRestoreFile)}
        onOpenChange={(open) => {
          if (!open) setPendingRestoreFile(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Pulihkan Data dari Cadangan?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Memulihkan file{" "}
              <strong className="text-foreground">{pendingRestoreFile?.name}</strong> akan
              mengganti seluruh proyek, fitur, poin pelanggan, dan lampiran gambar yang saat ini
              tersimpan di peramban ini.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyAction === "restore"}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleConfirmRestore()}
              disabled={busyAction === "restore"}
            >
              {busyAction === "restore" ? "Memulihkan..." : "Ya, Pulihkan Cadangan"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmClearAll} onOpenChange={setConfirmClearAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Hapus Semua Data Lokal?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Seluruh proyek, fitur, poin pelanggan, isi Sampah, dan lampiran gambar yang tersimpan
              di peramban ini akan dihapus permanen. Pastikan Anda sudah mengunduh cadangan jika
              masih diperlukan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyAction === "clear"}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleConfirmClearAll()}
              disabled={busyAction === "clear"}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {busyAction === "clear" ? "Menghapus..." : "Ya, Hapus Semua Data"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
