import { describe, expect, it } from "vitest";
import { heicToJpegName, isHeic, resolveMimeType, validateFileMeta } from "./upload-limits";

describe("HEIC helpers", () => {
  it.each([
    ["IMG_0042.HEIC", "", true],
    ["photo.heif", "", true],
    ["noext", "image/heic", true],
    ["noext", "image/heif-sequence", true],
    ["photo.jpg", "image/jpeg", false],
    ["scan.pdf", "application/pdf", false],
    ["heic.png", "image/png", false],
  ])("isHeic(%s, %s) is %s", (name, type, expected) => {
    expect(isHeic(name, type)).toBe(expected);
  });

  it("renames a converted photo to .jpg, whatever the case of the extension", () => {
    expect(heicToJpegName("IMG_0042.HEIC")).toBe("IMG_0042.jpg");
    expect(heicToJpegName("ใบเสร็จ.heif")).toBe("ใบเสร็จ.jpg");
    expect(heicToJpegName("a.b.heic")).toBe("a.b.jpg");
  });

  it("knows HEIC by extension when the browser reports no type, but still refuses to upload it unconverted", () => {
    expect(resolveMimeType("IMG_1.heic", "")).toBe("image/heic");
    expect(
      validateFileMeta({ fileName: "IMG_1.heic", mimeType: "image/heic", sizeBytes: 1000, pageCount: 1 }),
    ).toMatch(/รองรับเฉพาะ/);
  });
});
