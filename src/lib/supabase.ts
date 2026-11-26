import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const SUPABASE_STORAGE_BUCKET = "flowdoc-attachments";

function cleanEnvValue(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().replace(/^(['"])(.*)\1$/, "$2").trim();
}

function firstEnvValue(...candidates: Array<unknown>): string {
  for (const candidate of candidates) {
    const cleaned = cleanEnvValue(candidate);
    if (cleaned) return cleaned;
  }
  return "";
}

export function getSupabaseConfig(): { url: string; key: string } {
  const procEnv = typeof process !== "undefined" && process.env ? process.env : undefined;

  // Use direct static import.meta.env.* property accesses so Vite replaces them at build time.
  const url = firstEnvValue(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.NEXT_PUBLIC_SUPABASE_URL,
    import.meta.env.SUPABASE_URL,
    procEnv?.["VITE_SUPABASE_URL"],
    procEnv?.["NEXT_PUBLIC_SUPABASE_URL"],
    procEnv?.["SUPABASE_URL"],
  );

  const key = firstEnvValue(
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    import.meta.env.VITE_SUPABASE_ANON_KEY,
    import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    import.meta.env.SUPABASE_PUBLISHABLE_KEY,
    import.meta.env.SUPABASE_ANON_KEY,
    procEnv?.["VITE_SUPABASE_PUBLISHABLE_KEY"],
    procEnv?.["VITE_SUPABASE_ANON_KEY"],
    procEnv?.["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"],
    procEnv?.["NEXT_PUBLIC_SUPABASE_ANON_KEY"],
    procEnv?.["SUPABASE_PUBLISHABLE_KEY"],
    procEnv?.["SUPABASE_ANON_KEY"],
  );

  return { url, key };
}

export function isSupabaseConfigured(): boolean {
  const { url, key } = getSupabaseConfig();
  return Boolean(url && key);
}

let cachedClient: SupabaseClient | null = null;
let cachedSignature = "";

export function getSupabaseClient(): SupabaseClient {
  const { url, key } = getSupabaseConfig();
  if (!url || !key) {
    throw new Error(
      "Konfigurasi Supabase (VITE_SUPABASE_URL dan VITE_SUPABASE_PUBLISHABLE_KEY) belum diatur. Tambahkan di Environment Variables Vercel lalu Redeploy.",
    );
  }
  const signature = `${url}|${key}`;
  if (!cachedClient || cachedSignature !== signature) {
    cachedClient = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
    cachedSignature = signature;
  }
  return cachedClient;
}

export function formatSupabaseError(error: unknown, fallbackMessage: string): Error {
  if (error && typeof error === "object") {
    const err = error as { code?: string; message?: string; statusCode?: string | number };
    const code = err.code ?? "";
    const message = err.message ?? "";

    if (
      code === "PGRST205" ||
      code === "42P01" ||
      message.includes("Could not find the table") ||
      message.includes("does not exist")
    ) {
      return new Error(
        "Tabel database Supabase belum tersedia. Jalankan skrip SQL setup di Supabase SQL Editor proyek Anda.",
      );
    }

    if (message.toLowerCase().includes("bucket not found")) {
      return new Error(
        `Bucket Storage "${SUPABASE_STORAGE_BUCKET}" belum dibuat di Supabase.`,
      );
    }

    if (code === "42501" || message.toLowerCase().includes("row-level security")) {
      return new Error(
        "Akses database/storage ditolak oleh kebijakan RLS Supabase. Pastikan policy dan GRANT untuk role anon sudah diterapkan.",
      );
    }

    if (message) {
      return new Error(message);
    }
  }

  return error instanceof Error ? error : new Error(fallbackMessage);
}
