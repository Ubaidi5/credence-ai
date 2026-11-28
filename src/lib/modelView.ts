/** Plain-language helpers for the Models screen. Pure functions, no React. */
import { toGB, type ModelFit } from "./fit";
import { gb } from "./format";
import type { FitResult, HardwareProfile, ModelVariant } from "./types";

/** Roughly 0.75 English words per token (same rule as `speedText`). */
const wordsPerSec = (tokPerSec: number) => tokPerSec * 0.75;

/** True when the model cannot start at all on this machine. */
export const tooBig = (fit: FitResult) => fit.memBudgetGB < fit.ramMinGB;

export function speedLabel(fit: FitResult): string {
  if (tooBig(fit)) return "None";
  const words = wordsPerSec(fit.tokPerSec);
  return words >= 1 ? `${Math.round(words)} words/s` : "Under 1/s";
}

/** Filled dots out of 5. */
export function speedDots(fit: FitResult): number {
  if (tooBig(fit)) return 0;
  const words = wordsPerSec(fit.tokPerSec);
  if (words >= 15) return 5;
  if (words >= 10) return 4;
  if (words >= 6) return 3;
  if (words >= 2) return 2;
  return 1;
}

export function speedHelp(fit: FitResult): string {
  if (tooBig(fit)) return "Speed: this model cannot start on this computer.";
  const words = wordsPerSec(fit.tokPerSec);
  const amount = words >= 1 ? `about ${words.toFixed(words >= 10 ? 0 : 1)} words per second` : "under 1 word per second";
  return `Speed: ${amount} (estimate).`;
}

export type MemoryState = "free" | "close-apps" | "too-big";

export function memoryState(fit: FitResult, freeGB: number): MemoryState {
  if (tooBig(fit)) return "too-big";
  return fit.ramMinGB > freeGB ? "close-apps" : "free";
}

export function memoryHelp(fit: FitResult, freeGB: number): string {
  if (tooBig(fit)) {
    return `Memory: needs ${gb(fit.ramMinGB)}. This computer can give at most ${gb(fit.memBudgetGB)}.`;
  }
  const base = `Memory: needs ${gb(fit.ramMinGB)} of ${gb(fit.memBudgetGB)} usable. ${gb(freeGB)} is free now.`;
  return memoryState(fit, freeGB) === "close-apps" ? `${base} Close some apps first.` : base;
}

/** True when at least one model that can run needs more memory than is free right now. */
export function lowMemory(models: ModelFit[], freeGB: number): boolean {
  return models.some((m) => m.fit.label !== "wont-run" && memoryState(m.fit, freeGB) === "close-apps");
}

/** The line under the Download button. */
export function downloadHint(fit: FitResult, hw: HardwareProfile): string {
  const free = hw.modelsDisk ? toGB(hw.modelsDisk.availableBytes) : null;
  if (fit.diskOk === false && free !== null) {
    return `Needs ${gb(fit.diskNeededGB)}, you have ${gb(free)} free`;
  }
  if (fit.label === "wont-run") {
    if (tooBig(fit)) return "Needs more memory than you have";
    if (hw.modelsDisk?.kind === "hdd" && fit.inMemoryFrac < 1) return "Needs an SSD";
    return "Very slow on this computer";
  }
  if (fit.label === "slow") return "Replies will be slow";
  if (free === null) return "Runs well on this computer";
  return `About ${Math.floor(free - fit.diskNeededGB)} GB stays free`;
}

export interface VersionName {
  name: string;
  hint: string;
}

/** "Q4_K_M" means nothing to most people, so name versions by what they trade off. */
export function versionName(variants: ModelVariant[], quant: string): VersionName {
  if (variants.length === 1) return { name: "Only one version", hint: quant };
  if (variants.length === 2) {
    const [smaller] = [...variants].sort((a, b) => a.bitsPerWeight - b.bitsPerWeight);
    return smaller.quant === quant
      ? { name: "Standard", hint: `${quant}, smaller download` }
      : { name: "High quality", hint: `${quant}, larger download` };
  }
  return { name: quant, hint: "" };
}

export const TAG_HELP: Record<string, string> = {
  Chat: "Good for conversation and writing.",
  Code: "Good for writing and fixing code.",
  Reasoning: "Thinks step by step on harder problems.",
  "Open data": "Its training data is public.",
  Tiny: "The lightest and fastest, but less capable.",
  Small: "A light model that needs less memory.",
  Large: "Needs a lot of memory and disk space.",
  Frontier: "Among the most capable models, and the heaviest.",
};

/** Drops "(R)", "(TM)" and the clock speed so processor and graphics names fit. */
export function shortHardwareName(name: string): string {
  return name
    .replace(/\((R|TM|C)\)/gi, "")
    .replace(/\s+CPU\b/i, "")
    .replace(/\s*@\s*[\d.]+\s*GHz/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
