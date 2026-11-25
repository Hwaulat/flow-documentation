import { useEffect, useMemo, useRef, useState } from "react";
import { Expand, ImagePlus, Pencil, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAppData } from "@/lib/app-data";
import { formatBytes, formatDateTimeId } from "@/lib/formatters";
import {
  createId,
  currentTimestamp,
  getAttachment,
  isValidImageAttachment,
  MAX_ATTACHMENT_BYTES,
  saveAttachment,
  touchProject,
  type AttachmentOwnerType,
  type AttachmentRecord,
} from "@/lib/local-db";
import { softDeleteWithUndo } from "@/lib/undo-toast";
import { cn } from "@/lib/utils";

interface AttachmentGalleryProps {
  ownerType: AttachmentOwnerType;
  ownerId: string;
  projectId: string;
  title?: string;
  compact?: boolean;
  emptyLabel?: string;
}

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

export function AttachmentGallery({
  ownerType,
  ownerId,
  projectId,
  title = "Lampiran Gambar",
  compact = false,
  emptyLabel = "Belum ada lampiran gambar. Seret gambar ke sini atau klik tambah.",
}: AttachmentGalleryProps) {
  const { snapshot, reload } = useAppData();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [lightboxAttachment, setLightboxAttachment] = useState<AttachmentRecord | null>(null);
  const [captionDraft, setCaptionDraft] = useState("");
  const [savingCaption, setSavingCaption] = useState(false);

  const attachments = useMemo(
    () =>
      snapshot.attachments
        .filter(
          (item) =>
            item.deletedAt === null && item.ownerType === ownerType && item.ownerId === ownerId,
        )
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
    [snapshot.attachments, ownerType, ownerId],
  );

  const attachmentKey = useMemo(
    () => attachments.map((item) => item.id).join(","),
    [attachments],
  );

  useEffect(() => {
    let active = true;
    const createdUrls: string[] = [];

    async function loadBlobs() {
      const nextMap: Record<string, string> = {};
      for (const item of attachments) {
        try {
          const stored = await getAttachment(item.id);
          if (stored && active) {
            const url = URL.createObjectURL(stored.blob);
            createdUrls.push(url);
            nextMap[item.id] = url;
          }
        } catch {
          // Ignore individual unreadable blob
        }
      }
      if (active) {
        setPreviewUrls(nextMap);
      } else {
        for (const url of createdUrls) URL.revokeObjectURL(url);
      }
    }

    if (attachments.length > 0) {
      void loadBlobs();
    } else {
      setPreviewUrls({});
    }

    return () => {
      active = false;
      for (const url of createdUrls) URL.revokeObjectURL(url);
    };
  }, [attachmentKey]); // eslint-disable-line react-hooks/exhaustive-deps

  async function processFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    setUploading(true);
    let savedCount = 0;

    try {
      for (const file of files) {
        const mimeType = resolveMimeType(file);
        if (!isValidImageAttachment(mimeType, file.size)) {
          const maxMb = Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024));
          toast.error(
            `“${file.name}” ditolak. Hanya PNG, JPEG, GIF, atau WebP hingga ${maxMb} MB yang didukung.`,
          );
          continue;
        }

        await saveAttachment({
          id: createId(),
          ownerType,
          ownerId,
          originalName: file.name,
          mimeType,
          size: file.size,
          caption: "",
          createdAt: currentTimestamp(),
          deletedAt: null,
          blob: file,
        });
        savedCount += 1;
      }

      if (savedCount > 0) {
        await touchProject(projectId);
        await reload();
        toast.success(`${savedCount} lampiran gambar berhasil ditambahkan`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal menyimpan lampiran gambar.");
    } finally {
      setUploading(false);
    }
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (event.dataTransfer.files.length > 0) {
      void processFiles(event.dataTransfer.files);
    }
  }

  function handlePaste(event: React.ClipboardEvent<HTMLDivElement>) {
    const imageFiles = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null);

    if (imageFiles.length > 0) {
      event.preventDefault();
      void processFiles(imageFiles);
    }
  }

  function openLightbox(attachment: AttachmentRecord) {
    setLightboxAttachment(attachment);
    setCaptionDraft(attachment.caption);
  }

  async function handleSaveCaption(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!lightboxAttachment) return;
    setSavingCaption(true);
    try {
      const stored = await getAttachment(lightboxAttachment.id);
      if (!stored) {
        toast.error("Lampiran tidak lagi tersedia.");
        return;
      }
      const nextCaption = captionDraft.trim();
      await saveAttachment({ ...stored, caption: nextCaption });
      await touchProject(projectId);
      await reload();
      setLightboxAttachment({ ...lightboxAttachment, caption: nextCaption });
      toast.success("Keterangan gambar disimpan");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal memperbarui keterangan.");
    } finally {
      setSavingCaption(false);
    }
  }

  async function handleDelete(attachment: AttachmentRecord) {
    if (lightboxAttachment?.id === attachment.id) {
      setLightboxAttachment(null);
    }
    await softDeleteWithUndo({
      type: "attachment",
      id: attachment.id,
      label: `Lampiran "${attachment.originalName}"`,
      reload,
    });
  }

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onPaste={handlePaste}
      className={cn(
        "rounded-xl transition-colors",
        compact ? "mt-2" : "border bg-muted/25 p-3.5",
        dragging && "border-primary bg-primary/5 ring-2 ring-primary/20",
      )}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        multiple
        className="hidden"
        onChange={(event) => {
          if (event.target.files) {
            void processFiles(event.target.files);
            event.target.value = "";
          }
        }}
      />

      {!compact && (
        <div data-print-hide="true" className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {title}
            </span>
            {attachments.length > 0 && (
              <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
                {attachments.length}
              </span>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="h-7 gap-1.5 text-xs"
          >
            <ImagePlus className="h-3.5 w-3.5" />
            <span>{uploading ? "Mengunggah..." : "Tambah Gambar"}</span>
          </Button>
        </div>
      )}

      {attachments.length === 0 ? (
        !compact && (
          <button
            data-print-hide="true"
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border/80 bg-background/60 px-4 py-4 text-center text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          >
            <Upload className="h-3.5 w-3.5 shrink-0" />
            <span>{emptyLabel}</span>
          </button>
        )
      ) : (
        <div
          className={cn(
            "grid gap-2.5",
            compact ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-4" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4",
          )}
        >
          {attachments.map((attachment) => {
            const url = previewUrls[attachment.id];
            return (
              <div
                key={attachment.id}
                className="group print-avoid-break relative overflow-hidden rounded-lg border bg-background shadow-xs"
              >
                <button
                  type="button"
                  onClick={() => openLightbox(attachment)}
                  className={cn(
                    "relative block w-full overflow-hidden bg-muted/40 text-left",
                    compact ? "aspect-[4/3]" : "aspect-video",
                  )}
                  aria-label={`Lihat gambar ${attachment.originalName}`}
                >
                  {url ? (
                    <img
                      src={url}
                      alt={attachment.caption || attachment.originalName}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[11px] text-muted-foreground">
                      Memuat...
                    </div>
                  )}
                  <span
                    data-print-hide="true"
                    className="absolute right-1.5 bottom-1.5 rounded-md bg-background/85 p-1 text-foreground opacity-0 shadow-xs backdrop-blur-xs transition-opacity group-hover:opacity-100"
                  >
                    <Expand className="h-3 w-3" />
                  </span>
                </button>

                <div className="flex items-center justify-between gap-1 px-2 py-1.5">
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-medium text-foreground">
                      {attachment.caption || attachment.originalName}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{formatBytes(attachment.size)}</p>
                  </div>
                  <div data-print-hide="true" className="flex shrink-0 items-center gap-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-foreground"
                      onClick={() => openLightbox(attachment)}
                      aria-label={`Edit keterangan ${attachment.originalName}`}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-destructive"
                      onClick={() => void handleDelete(attachment)}
                      aria-label={`Hapus lampiran ${attachment.originalName}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}

          {compact && (
            <button
              data-print-hide="true"
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex aspect-[4/3] flex-col items-center justify-center gap-1 rounded-lg border border-dashed bg-muted/20 p-2 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            >
              <ImagePlus className="h-4 w-4" />
              <span>Tambah</span>
            </button>
          )}
        </div>
      )}

      {compact && attachments.length === 0 && (
        <div data-print-hide="true" className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="h-6 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <ImagePlus className="h-3 w-3" />
            <span>{uploading ? "Mengunggah..." : "Lampirkan gambar"}</span>
          </Button>
        </div>
      )}

      <Dialog
        open={Boolean(lightboxAttachment)}
        onOpenChange={(open) => {
          if (!open) setLightboxAttachment(null);
        }}
      >
        <DialogContent className="sm:rounded-2xl">
          {lightboxAttachment && (
            <>
              <DialogHeader>
                <DialogTitle className="truncate pr-6 text-base">
                  {lightboxAttachment.originalName}
                </DialogTitle>
                <DialogDescription>
                  {formatBytes(lightboxAttachment.size)} · Diunggah{" "}
                  {formatDateTimeId(lightboxAttachment.createdAt)}
                </DialogDescription>
              </DialogHeader>

              <div className="overflow-hidden rounded-xl border bg-muted/30">
                {previewUrls[lightboxAttachment.id] ? (
                  <img
                    src={previewUrls[lightboxAttachment.id]}
                    alt={lightboxAttachment.caption || lightboxAttachment.originalName}
                    className="max-h-[60vh] w-full object-contain"
                  />
                ) : (
                  <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                    Memuat pratinjau...
                  </div>
                )}
              </div>

              <form onSubmit={handleSaveCaption} className="space-y-2">
                <Label htmlFor="attachment-caption">Keterangan Gambar</Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    id="attachment-caption"
                    value={captionDraft}
                    onChange={(event) => setCaptionDraft(event.target.value)}
                    placeholder="Tambahkan catatan konteks gambar ini..."
                  />
                  <Button type="submit" disabled={savingCaption}>
                    {savingCaption ? "Menyimpan..." : "Simpan Keterangan"}
                  </Button>
                </div>
              </form>

              <DialogFooter className="sm:justify-between">
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => void handleDelete(lightboxAttachment)}
                  className="gap-1.5"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Hapus ke Sampah
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setLightboxAttachment(null)}
                >
                  Tutup
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
