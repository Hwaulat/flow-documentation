import { describe, expect, it } from "vitest";

import { isValidImageAttachment, MAX_ATTACHMENT_BYTES } from "@/lib/local-db";

describe("image attachment limits", () => {
  it("accepts PNG images up to and including 10 MB", () => {
    expect(isValidImageAttachment("image/png", MAX_ATTACHMENT_BYTES)).toBe(true);
  });

  it("rejects images over 10 MB and unsupported formats", () => {
    expect(isValidImageAttachment("image/jpeg", MAX_ATTACHMENT_BYTES + 1)).toBe(false);
    expect(isValidImageAttachment("application/pdf", 100)).toBe(false);
  });
});