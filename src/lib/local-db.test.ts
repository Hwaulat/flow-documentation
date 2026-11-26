import { afterEach, describe, expect, it, vi } from "vitest";

import { isValidImageAttachment, MAX_ATTACHMENT_BYTES } from "@/lib/local-db";
import { formatSupabaseError, getSupabaseConfig } from "@/lib/supabase";

describe("image attachment limits", () => {
  it("accepts PNG images up to and including 10 MB", () => {
    expect(isValidImageAttachment("image/png", MAX_ATTACHMENT_BYTES)).toBe(true);
  });

  it("rejects images over 10 MB and unsupported formats", () => {
    expect(isValidImageAttachment("image/jpeg", MAX_ATTACHMENT_BYTES + 1)).toBe(false);
    expect(isValidImageAttachment("application/pdf", 100)).toBe(false);
  });
});

describe("supabase env resolution", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("supports NEXT_PUBLIC_ and SUPABASE_ env names and strips quotes/spaces", () => {
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", '  "https://demo.supabase.co"  ');
    vi.stubEnv("SUPABASE_ANON_KEY", "  sb_publishable_demo_key ");

    expect(getSupabaseConfig()).toEqual({
      url: "https://demo.supabase.co",
      key: "sb_publishable_demo_key",
    });
  });
});

describe("supabase error formatting", () => {
  it("explains missing schema tables clearly in Indonesian", () => {
    const err = formatSupabaseError({ code: "PGRST205", message: "Could not find the table" }, "Fallback");
    expect(err.message).toContain("Tabel database Supabase belum tersedia");
  });

  it("explains missing storage bucket clearly in Indonesian", () => {
    const err = formatSupabaseError({ message: "Bucket not found" }, "Fallback");
    expect(err.message).toContain("flowdoc-attachments");
  });
});