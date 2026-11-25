import { useEffect, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAppData } from "@/lib/app-data";
import { PROJECT_STATUS_META } from "@/lib/formatters";
import {
  createId,
  currentTimestamp,
  saveProject,
  type ProjectRecord,
  type ProjectStatus,
} from "@/lib/local-db";

interface ProjectFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project?: ProjectRecord | null;
  onSaved?: (project: ProjectRecord) => void;
}

export function ProjectFormDialog({
  open,
  onOpenChange,
  project = null,
  onSaved,
}: ProjectFormDialogProps) {
  const { reload } = useAppData();
  const isEditing = Boolean(project);

  const [name, setName] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [status, setStatus] = useState<ProjectStatus>("active");
  const [description, setDescription] = useState("");
  const [processFlow, setProcessFlow] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(project?.name ?? "");
    setCustomerName(project?.customerName ?? "");
    setStatus(project?.status ?? "active");
    setDescription(project?.description ?? "");
    setProcessFlow(project?.processFlow ?? "");
    setError(null);
  }, [open, project]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Nama proyek wajib diisi.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const now = currentTimestamp();
      const nextProject: ProjectRecord = project
        ? {
            ...project,
            name: trimmedName,
            customerName: customerName.trim(),
            status,
            description: description.trim(),
            processFlow: processFlow.trim(),
            updatedAt: now,
          }
        : {
            id: createId(),
            name: trimmedName,
            customerName: customerName.trim(),
            status,
            description: description.trim(),
            processFlow: processFlow.trim(),
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
          };

      await saveProject(nextProject);
      await reload();
      toast.success(isEditing ? "Detail proyek diperbarui" : "Proyek baru berhasil dibuat");
      onOpenChange(false);
      onSaved?.(nextProject);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menyimpan proyek.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:rounded-2xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Detail Proyek" : "Buat Proyek Baru"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Perbarui identitas proyek, nama pelanggan, status, atau ringkasan alur."
              : "Dokumentasikan alur proses dan kebutuhan pelanggan proyek ini secara lokal."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="project-name">
              Nama Proyek <span className="text-destructive">*</span>
            </Label>
            <Input
              id="project-name"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                if (error) setError(null);
              }}
              placeholder="Contoh: Portal Klaim Pelanggan B2B"
              autoFocus
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="project-customer">Pelanggan / Klien</Label>
              <Input
                id="project-customer"
                value={customerName}
                onChange={(event) => setCustomerName(event.target.value)}
                placeholder="Contoh: PT Nusantara Logistik"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="project-status">Status Proyek</Label>
              <Select value={status} onValueChange={(value) => setStatus(value as ProjectStatus)}>
                <SelectTrigger id="project-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["active", "on-hold", "done"] as ProjectStatus[]).map((item) => (
                    <SelectItem key={item} value={item}>
                      {PROJECT_STATUS_META[item].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="project-description">Deskripsi Singkat</Label>
            <Textarea
              id="project-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Ringkasan ruang lingkup proyek atau tujuan utama..."
              rows={2}
            />
          </div>

          {!isEditing && (
            <div className="space-y-1.5">
              <Label htmlFor="project-flow">Catatan Alur Proses Awal (Opsional)</Label>
              <Textarea
                id="project-flow"
                value={processFlow}
                onChange={(event) => setProcessFlow(event.target.value)}
                placeholder="Contoh: 1. Pelanggan masuk -> 2. Isi pengajuan -> 3. Verifikasi admin..."
                rows={3}
              />
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Batal
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Menyimpan..." : isEditing ? "Simpan Perubahan" : "Buat Proyek"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
