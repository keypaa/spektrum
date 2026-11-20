import { describe, expect, it } from "vitest";
import { UploadNameError, uploadPathFor } from "./upload-path";

describe("uploadPathFor", () => {
  it("keeps the file's own name at the project root", () => {
    expect(uploadPathFor("paper.pdf")).toBe("paper.pdf");
    expect(uploadPathFor("pdf (1).pdf")).toBe("pdf (1).pdf");
    expect(uploadPathFor("my report v2.tex")).toBe("my report v2.tex");
  });

  it("flattens directory components from dropped files", () => {
    expect(uploadPathFor("figures/plot.png")).toBe("plot.png");
    expect(uploadPathFor("C:\\draft\\notes.tex")).toBe("notes.tex");
  });

  it("refuses traversal and dot-only names", () => {
    expect(uploadPathFor("../secret.tex")).toBe("secret.tex");
    expect(() => uploadPathFor("..")).toThrow(UploadNameError);
    expect(() => uploadPathFor("...")).toThrow(UploadNameError);
  });

  it("strips control characters but keeps readable names", () => {
    expect(uploadPathFor("my\u0000paper.pdf")).toBe("mypaper.pdf");
    expect(uploadPathFor("report final (v2).pdf")).toBe(
      "report final (v2).pdf",
    );
  });

  it("refuses an empty or over-long name", () => {
    expect(() => uploadPathFor("")).toThrow(UploadNameError);
    expect(() => uploadPathFor(`${"a".repeat(300)}.pdf`)).toThrow(UploadNameError);
  });
});
