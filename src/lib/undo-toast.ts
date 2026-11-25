import { toast } from "sonner";

import { markDeleted, restoreDeleted, type TrashType } from "@/lib/local-db";

export async function softDeleteWithUndo(options: {
  type: TrashType;
  id: string;
  label: string;
  reload: () => Promise<void>;
  onRestored?: () => void;
}): Promise<void> {
  const { type, id, label, reload, onRestored } = options;
  await markDeleted(type, id);
  await reload();

  toast.success(`${label} dipindahkan ke Sampah`, {
    description: "Anda dapat memulihkannya sekarang atau dari menu Sampah.",
    duration: 6000,
    action: {
      label: "Urungkan",
      onClick: () => {
        void restoreDeleted(type, id)
          .then(() => reload())
          .then(() => {
            onRestored?.();
            toast.success(`${label} berhasil dipulihkan`);
          })
          .catch(() => {
            toast.error(`Gagal memulihkan ${label.toLowerCase()}`);
          });
      },
    },
  });
}
