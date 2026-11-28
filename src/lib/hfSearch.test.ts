import { describe, expect, it } from "vitest";
import {
  bitsOf,
  displayName,
  groupFiles,
  nextLink,
  pickGroups,
  quantOf,
  searchUrl,
  toCatalogModel,
  type HfModel,
} from "./hfSearch";

const files = (...names: string[]) => names.map((rfilename) => ({ rfilename }));

describe("quant names", () => {
  it("reads the quant from a file name", () => {
    expect(quantOf("Qwen3.8-27B-UD-Q4_K_XL.gguf")).toBe("UD-Q4_K_XL");
    expect(quantOf("Qwen3-4B-Q8_0.gguf")).toBe("Q8_0");
    expect(quantOf("BF16/Qwen3.8-27B-BF16-00001-of-00002.gguf")).toBe("BF16");
    expect(quantOf("model.IQ2_XXS.gguf")).toBe("IQ2_XXS");
    expect(quantOf("qwen3-4b-q4_k_m.gguf")).toBe("Q4_K_M");
    expect(quantOf("model.gguf")).toBeNull();
  });

  it("knows the size of each quant", () => {
    expect(bitsOf("Q4_K_M")).toBeCloseTo(4.85);
    expect(bitsOf("UD-Q4_K_XL")).toBeGreaterThan(bitsOf("Q4_K_M"));
    expect(bitsOf("Q8_0")).toBeGreaterThan(bitsOf("Q6_K"));
    expect(bitsOf("IQ1_S")).toBeLessThan(2);
    expect(bitsOf("Q4_K")).toBeGreaterThan(4);
  });
});

describe("repo files to versions", () => {
  it("skips helper files and unsupported types, keeps the first part of a split model", () => {
    const g = groupFiles([
      "README.md",
      "mmproj-BF16.gguf",
      "MTP/mtp-Qwen3.8-27B-Q4_0.gguf",
      "imatrix_unsloth.gguf",
      "Model-TQ1_0.gguf",
      "Model-Q4_K_M.gguf",
      "Q8_0/Model-Q8_0-00001-of-00002.gguf",
      "Q8_0/Model-Q8_0-00002-of-00002.gguf",
    ]);
    expect(g.map((x) => x.quant).sort()).toEqual(["Q4_K_M", "Q8_0"]);
    const q8 = g.find((x) => x.quant === "Q8_0")!;
    expect(q8.file).toBe("Q8_0/Model-Q8_0-00001-of-00002.gguf");
    expect(q8.parts).toBe(2);
  });

  it("offers at most six versions, the common ones, smallest first", () => {
    const quants = ["Q2_K", "Q3_K_M", "Q4_K_M", "Q4_K_S", "Q5_K_M", "Q5_K_S", "Q6_K", "Q8_0", "IQ4_XS", "BF16"];
    const picked = pickGroups(groupFiles(quants.map((q) => `M-${q}.gguf`)));
    expect(picked).toHaveLength(6);
    expect(picked.map((p) => p.quant)).toContain("Q4_K_M");
    expect(picked.map((p) => p.quant)).toContain("Q8_0");
    expect(picked.map((p) => p.quant)).not.toContain("BF16");
    const bits = picked.map((p) => bitsOf(p.quant));
    expect([...bits].sort((a, b) => a - b)).toEqual(bits);
  });

  it("keeps a 16-bit file when it is the only one", () => {
    expect(pickGroups(groupFiles(["M-BF16.gguf"])).map((p) => p.quant)).toEqual(["BF16"]);
  });
});

describe("HF repo to catalog model", () => {
  const qwen: HfModel = {
    id: "unsloth/Qwen3-8B-GGUF",
    author: "unsloth",
    downloads: 1_250_000,
    likes: 300,
    gated: false,
    gguf: { total: 8_190_000_000, architecture: "qwen3" },
    siblings: files("Qwen3-8B-Q4_K_M.gguf", "Qwen3-8B-Q8_0.gguf", "README.md"),
  };

  it("builds a dense model with estimated sizes", () => {
    const m = toCatalogModel(qwen)!;
    expect(m.id).toBe("hf:unsloth/Qwen3-8B-GGUF");
    expect(m.name).toBe("Qwen3 8B");
    expect(m.publisher).toBe("unsloth");
    expect(m.kind).toBe("dense");
    expect(m.source).toBe("hf");
    expect(m.totalParamsB).toBeCloseTo(8.2, 1);
    const q4 = m.variants.find((v) => v.quant === "Q4_K_M")!;
    expect(q4.sizeGB).toBeGreaterThan(4.5);
    expect(q4.sizeGB).toBeLessThan(5.5);
    expect(q4.estimated).toBe(true);
    expect(m.description).toContain("1.3M downloads");
  });

  it("reads active parameters of a MoE from its name", () => {
    const m = toCatalogModel({
      ...qwen,
      id: "unsloth/Qwen3-Coder-30B-A3B-Instruct-GGUF",
      gguf: { total: 30_500_000_000, architecture: "qwen3moe" },
    })!;
    expect(m.kind).toBe("moe");
    expect(m.activeParamsB).toBe(3);
    expect(m.tags).toContain("Code");
  });

  it("drops what Colibri can't run, gated repos and repos without model files", () => {
    expect(toCatalogModel({ ...qwen, gguf: { total: 8e9, architecture: "llama" } })).toBeNull();
    expect(toCatalogModel({ ...qwen, gguf: { total: 8e9, architecture: "gemma4" } })).toBeNull();
    expect(toCatalogModel({ ...qwen, gated: "manual" })).toBeNull();
    expect(toCatalogModel({ ...qwen, siblings: files("README.md", "mmproj-F16.gguf") })).toBeNull();
    expect(toCatalogModel({ ...qwen, gguf: undefined })).toBeNull();
  });
});

describe("search requests", () => {
  it("asks only for GGUF repos with the fields it reads", () => {
    const u = new URL(searchUrl(" qwen coder ", "downloads"));
    expect(u.searchParams.get("filter")).toBe("gguf");
    expect(u.searchParams.get("search")).toBe("qwen coder");
    expect(u.searchParams.getAll("expand[]")).toContain("gguf");
    expect(u.searchParams.getAll("expand[]")).toContain("siblings");
    expect(new URL(searchUrl("", "trendingScore")).searchParams.has("search")).toBe(false);
  });

  it("follows the Link header", () => {
    expect(nextLink('<https://huggingface.co/api/models?cursor=abc>; rel="next"')).toBe(
      "https://huggingface.co/api/models?cursor=abc",
    );
    expect(nextLink(null)).toBeNull();
  });

  it("names repos for people", () => {
    expect(displayName("bartowski/Qwen_Qwen3.8-27B-GGUF")).toBe("Qwen Qwen3.8 27B");
    expect(displayName("unsloth/Qwen3.6-35B-A3B-GGUF")).toBe("Qwen3.6 35B A3B");
  });
});
