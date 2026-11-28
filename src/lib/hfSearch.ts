import type { CatalogModel, ModelVariant } from "./types";

/**
 * Live model search on Hugging Face, limited to models the Colibri engine can run.
 *
 * - The public API needs no account and no token, and costs nothing.
 * - HF answers each GGUF repo with its `gguf.architecture`, its parameter count and its
 *   file names, so one request per page is enough. Download sizes are estimated from the
 *   parameter count and the quantization; the download manager reads the exact sizes.
 * - The browser preview (`bun run dev`) and the app both call it directly (HF allows CORS).
 */

export const HF = "https://huggingface.co";

/**
 * GGUF architectures `coli import` accepts, from Colibri v2.1.0
 * (c/tools/gguf_import.py ARCHES, docs/gguf.md). Update with colibri-version.txt.
 */
export const COLIBRI_ARCHES = new Set([
  "qwen3",
  "qwen3moe",
  "qwen35",
  "qwen35moe",
  "qwen4exp",
  "flint",
  "muse-spark",
  "lfm3",
  "deepseek4",
  "deepseek41",
  "inkling",
  "glm5-next",
  "glm-dsa",
  "mistral-large4",
  "mimo2",
  "kimi-k3",
  "olmoe",
]);

/** Architectures that are mixture-of-experts. */
const MOE_ARCHES = new Set([
  "qwen3moe",
  "qwen35moe",
  "qwen4exp",
  "deepseek4",
  "deepseek41",
  "inkling",
  "glm5-next",
  "glm-dsa",
  "mistral-large4",
  "mimo2",
  "kimi-k3",
  "olmoe",
]);

/** Average bits per weight of each GGUF type (llama.cpp's numbers, rounded). */
const BITS: Record<string, number> = {
  F32: 32,
  BF16: 16,
  F16: 16,
  Q8_0: 8.5,
  Q6_K: 6.56,
  Q5_1: 6,
  Q5_K_M: 5.69,
  Q5_K: 5.6,
  Q5_K_S: 5.54,
  Q5_0: 5.5,
  Q4_1: 5,
  Q4_K_M: 4.85,
  Q4_K: 4.7,
  Q4_K_S: 4.58,
  Q4_0: 4.55,
  IQ4_NL: 4.5,
  MXFP4: 4.25,
  MXFP4_MOE: 4.25,
  IQ4_XS: 4.25,
  Q3_K_L: 4.27,
  Q3_K: 3.9,
  Q3_K_M: 3.91,
  IQ3_M: 3.66,
  Q3_K_S: 3.5,
  IQ3_S: 3.44,
  IQ3_XS: 3.3,
  IQ3_XXS: 3.06,
  Q2_K: 3,
  Q2_K_S: 2.8,
  IQ2_M: 2.7,
  Q2_0: 2.5,
  IQ2_S: 2.5,
  IQ2_XS: 2.31,
  IQ2_XXS: 2.06,
  IQ1_M: 1.75,
  IQ1_S: 1.56,
};

/** Types Colibri refuses (docs/gguf.md: "unsupported ggml type 65"). */
const UNSUPPORTED_QUANT = /^(UD-)?(TQ\d_\d|Q1_0)$/;

/** The versions shown first, when a repo has many. */
const PREFERRED = [
  "Q4_K_M",
  "UD-Q4_K_XL",
  "Q8_0",
  "Q6_K",
  "Q5_K_M",
  "IQ4_XS",
  "Q3_K_M",
  "UD-Q3_K_XL",
  "Q2_K",
  "UD-Q2_K_XL",
  "IQ2_XXS",
  "UD-IQ2_XXS",
  "UD-IQ1_S",
  "IQ1_S",
  "Q4_0",
  "MXFP4_MOE",
];
const MAX_VARIANTS = 6;

const QUANT_RE =
  /(?:^|[-_.])((?:UD-)?(?:IQ\d_[A-Z]+|Q\d_K(?:_[A-Z]+)?|Q\d_\d|BF16|F16|F32|MXFP4(?:_MOE)?|TQ\d_\d))(?=$|[-_.])/i;
const SPLIT_RE = /-(\d{5})-of-(\d{5})\.gguf$/i;

/** "Model-UD-Q4_K_XL.gguf" -> "UD-Q4_K_XL". */
export function quantOf(fileName: string): string | null {
  const base = fileName.split("/").pop() ?? fileName;
  const m = base.replace(SPLIT_RE, ".gguf").match(QUANT_RE);
  return m ? m[1].toUpperCase() : null;
}

/** Bits per weight for a quant name, including Unsloth's UD-…_XL mixes. */
export function bitsOf(quant: string): number {
  const q = quant.replace(/^UD-/, "");
  if (BITS[q]) return BITS[q];
  // Q4_K_XL, Q6_K_L, Q6_K_P...: the K quant with a few larger layers.
  const k = q.match(/^(Q\d_K)_(XL|L|P)$/);
  if (k) return (BITS[`${k[1]}_M`] ?? BITS[k[1]] ?? 4.85) + 0.3;
  if (BITS[`${q}_M`]) return BITS[`${q}_M`];
  const d = q.match(/\d/);
  return d ? Number(d[0]) + 0.5 : 4.85;
}

/** Files that are not the model itself: projectors, draft heads, calibration data. */
function isHelper(path: string): boolean {
  const base = (path.split("/").pop() ?? "").toLowerCase();
  return (
    /^(mmproj|mtp|imatrix|dspark|draft)/.test(base) ||
    base.includes("imatrix") ||
    /(^|\/)(mtp|dspark|draft)\//i.test(path)
  );
}

interface Group {
  quant: string;
  /** What the download manager gets: the file, or the first part of a split model. */
  file: string;
  parts: number;
}

/** The model files of a repo, one entry per version. */
export function groupFiles(files: string[]): Group[] {
  const byQuant = new Map<string, Group>();
  for (const f of files) {
    if (!f.toLowerCase().endsWith(".gguf") || isHelper(f)) continue;
    const quant = quantOf(f);
    if (!quant || UNSUPPORTED_QUANT.test(quant)) continue;
    const split = f.match(SPLIT_RE);
    if (split && split[1] !== "00001") continue;
    const g = { quant, file: f, parts: split ? Number(split[2]) : 1 };
    // Two files of one quant (e.g. two folders): keep the shorter path.
    const prev = byQuant.get(quant);
    if (!prev || f.length < prev.file.length) byQuant.set(quant, g);
  }
  return [...byQuant.values()];
}

/** At most MAX_VARIANTS versions: the common ones first, 16-bit ones only when alone. */
export function pickGroups(groups: Group[]): Group[] {
  const small = groups.filter((g) => bitsOf(g.quant) < 16);
  const pool = small.length ? small : groups;
  const rank = (q: string) => {
    const i = PREFERRED.indexOf(q);
    return i === -1 ? PREFERRED.length : i;
  };
  return [...pool]
    .sort((a, b) => rank(a.quant) - rank(b.quant) || bitsOf(b.quant) - bitsOf(a.quant))
    .slice(0, MAX_VARIANTS)
    .sort((a, b) => bitsOf(a.quant) - bitsOf(b.quant));
}

/** What the HF list API returns for one repo (only the fields we ask for). */
export interface HfModel {
  id: string;
  author?: string;
  downloads?: number;
  likes?: number;
  gated?: boolean | string;
  lastModified?: string;
  gguf?: { total?: number; architecture?: string; context_length?: number };
  siblings?: { rfilename: string }[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** "Qwen3-Coder-30B-A3B-Instruct-GGUF" -> 3.3 (active billions), when the name says it. */
function activeFromName(name: string): number | null {
  const m = name.match(/[-_]A(\d+(?:\.\d+)?)B(?=$|[-_.])/i);
  return m ? Number(m[1]) : null;
}

/** "unsloth/Qwen3.8-27B-GGUF" -> "Qwen3.8 27B". */
export function displayName(repo: string): string {
  const name = repo.split("/").pop() ?? repo;
  return name
    .replace(/[-_.]?gguf$/i, "")
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tagsFor(name: string, totalB: number): string[] {
  const n = name.toLowerCase();
  const tags: string[] = [];
  if (/coder|code/.test(n)) tags.push("Code");
  if (/think|reason|r1\b|distill/.test(n)) tags.push("Reasoning");
  if (!tags.length) tags.push("Chat");
  if (totalB < 1.5) tags.push("Tiny");
  else if (totalB < 10) tags.push("Small");
  else if (totalB >= 100) tags.push("Large");
  return tags;
}

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

/** One HF repo as a catalog model, or null when Colibri can't run it. */
export function toCatalogModel(m: HfModel): CatalogModel | null {
  const arch = m.gguf?.architecture ?? "";
  const total = m.gguf?.total ?? 0;
  if (!COLIBRI_ARCHES.has(arch) || total <= 0 || m.gated) return null;
  const groups = pickGroups(groupFiles((m.siblings ?? []).map((s) => s.rfilename)));
  if (!groups.length) return null;

  const totalB = total / 1e9;
  const moe = MOE_ARCHES.has(arch) || activeFromName(m.id) !== null;
  const activeB = moe ? (activeFromName(m.id) ?? totalB * 0.1) : totalB;
  const variants: ModelVariant[] = groups.map((g) => {
    const bits = bitsOf(g.quant);
    return { quant: g.quant, bitsPerWeight: bits, sizeGB: round1((total * bits) / 8 / 1e9), file: g.file, estimated: true };
  });
  const author = m.author ?? m.id.split("/")[0];
  const stats = [
    m.downloads ? `${compact.format(m.downloads)} downloads` : "",
    m.likes ? `${compact.format(m.likes)} likes` : "",
  ].filter(Boolean);

  return {
    id: `hf:${m.id}`,
    name: displayName(m.id),
    publisher: author,
    hfRepo: m.id,
    description: `From ${author} on Hugging Face${stats.length ? `. ${stats.join(", ")}` : ""}.`,
    architecture: arch,
    kind: moe ? "moe" : "dense",
    totalParamsB: round1(totalB) || totalB,
    activeParamsB: round1(activeB) || activeB,
    // Popularity stands in for quality: more downloads, higher.
    qualityRank: Math.round(Math.log10(1 + (m.downloads ?? 0)) * 10),
    tags: tagsFor(m.id, totalB),
    variants,
    source: "hf",
    downloads: m.downloads,
    likes: m.likes,
  };
}

export type HfSort = "trendingScore" | "downloads" | "likes";

export interface SearchPage {
  models: CatalogModel[];
  /** Repos HF returned before the filter, so the UI can tell "none fit" from "none found". */
  scanned: number;
  /** URL of the next page, or null at the end. */
  next: string | null;
}

const PAGE = 60;
const EXPAND = ["gguf", "downloads", "likes", "gated", "lastModified", "siblings", "author"];

export function searchUrl(query: string, sort: HfSort): string {
  const p = new URLSearchParams({ filter: "gguf", sort, limit: String(PAGE) });
  if (query.trim()) p.set("search", query.trim());
  for (const e of EXPAND) p.append("expand[]", e);
  return `${HF}/api/models?${p}`;
}

/** The rel="next" URL of a Link header. */
export function nextLink(link: string | null): string | null {
  const m = link?.match(/<([^>]+)>\s*;\s*rel="next"/);
  return m ? m[1] : null;
}

const cache = new Map<string, { at: number; page: SearchPage }>();
const CACHE_MS = 30 * 60 * 1000;

/** One page of results. Pass `url` from a previous page's `next` to continue. */
export async function searchModels(url: string, signal?: AbortSignal): Promise<SearchPage> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.page;
  let res: Response;
  try {
    res = await fetch(url, { signal });
  } catch (e) {
    if (signal?.aborted) throw e;
    throw new Error("Can't reach Hugging Face. Check your internet connection.");
  }
  if (res.status === 429) throw new Error("Hugging Face is busy right now. Try again in a minute.");
  if (!res.ok) throw new Error(`Hugging Face returned error ${res.status}.`);
  const list = (await res.json()) as HfModel[];
  const page: SearchPage = {
    models: list.map(toCatalogModel).filter((m): m is CatalogModel => m !== null),
    scanned: list.length,
    next: nextLink(res.headers.get("link")),
  };
  cache.set(url, { at: Date.now(), page });
  return page;
}
