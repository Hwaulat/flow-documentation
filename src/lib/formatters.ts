import type { PointSource, ProjectStatus } from "@/lib/local-db";

export const PROJECT_STATUS_META: Record<
  ProjectStatus,
  { label: string; description: string; badgeClass: string; dotClass: string }
> = {
  active: {
    label: "Aktif",
    description: "Sedang berjalan dan didokumentasikan",
    badgeClass:
      "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-300",
    dotClass: "bg-emerald-500",
  },
  "on-hold": {
    label: "Ditunda",
    description: "Menunggu konfirmasi atau lanjutan dari pelanggan",
    badgeClass:
      "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300",
    dotClass: "bg-amber-500",
  },
  done: {
    label: "Selesai",
    description: "Dokumentasi dan implementasi selesai",
    badgeClass:
      "border-slate-500/25 bg-slate-500/10 text-slate-700 dark:border-slate-400/25 dark:bg-slate-400/10 dark:text-slate-300",
    dotClass: "bg-slate-500",
  },
};

export const POINT_SOURCE_META: Record<PointSource, { label: string; badgeClass: string }> = {
  Meeting: {
    label: "Meeting",
    badgeClass:
      "border-sky-500/25 bg-sky-500/10 text-sky-700 dark:border-sky-400/25 dark:bg-sky-400/10 dark:text-sky-300",
  },
  Call: {
    label: "Telepon",
    badgeClass:
      "border-violet-500/25 bg-violet-500/10 text-violet-700 dark:border-violet-400/25 dark:bg-violet-400/10 dark:text-violet-300",
  },
  WhatsApp: {
    label: "WhatsApp",
    badgeClass:
      "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-300",
  },
  Email: {
    label: "Email",
    badgeClass:
      "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300",
  },
  Other: {
    label: "Lainnya",
    badgeClass:
      "border-zinc-500/25 bg-zinc-500/10 text-zinc-700 dark:border-zinc-400/25 dark:bg-zinc-400/10 dark:text-zinc-300",
  },
};

export const POINT_SOURCES: PointSource[] = ["Meeting", "Call", "WhatsApp", "Email", "Other"];

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  const formatted =
    exponent === 0
      ? String(Math.round(value))
      : new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(value);
  return `${formatted} ${units[exponent] ?? "B"}`;
}

export function formatDateId(value: string): string {
  if (!value) return "—";
  const ymdMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (ymdMatch) {
    const year = Number(ymdMatch[1]);
    const month = Number(ymdMatch[2]) - 1;
    const day = Number(ymdMatch[3]);
    const localDate = new Date(year, month, day);
    return new Intl.DateTimeFormat("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(localDate);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

export function formatDateTimeId(value: string): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

export function todayYmd(): string {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function pluralizeId(count: number, word: string): string {
  return `${count} ${word}`;
}
