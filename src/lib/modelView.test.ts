import { describe, expect, it } from "vitest";
import { CATALOG } from "./catalog";
import { fitModel, rankModels } from "./fit";
import {
  downloadHint,
  lowMemory,
  memoryState,
  shortHardwareName,
  speedDots,
  speedLabel,
  TAG_HELP,
  versionName,
} from "./modelView";
import { SAMPLE_PROFILES as P } from "./profiles";
import { placeTooltip } from "./tooltip";

const model = (id: string) => {
  const m = CATALOG.find((x) => x.id === id);
  if (!m) throw new Error(`missing ${id}`);
  return m;
};
const fit = (id: string, hw = P.laptop16) => fitModel(hw, model(id)).fit;

describe("speed", () => {
  it("shows no dots for a model that cannot start", () => {
    const f = fit("glm-5.2", P.laptop8);
    expect(speedDots(f)).toBe(0);
    expect(speedLabel(f)).toBe("None");
  });
  it("gives a fast small model more dots than a bigger one", () => {
    expect(speedDots(fit("qwen3-0.6b"))).toBeGreaterThan(speedDots(fit("qwen3-8b")));
  });
});

describe("memory", () => {
  it("separates fits now, close apps and too big", () => {
    const f = fit("qwen3-4b");
    expect(memoryState(f, f.ramMinGB + 1)).toBe("free");
    expect(memoryState(f, f.ramMinGB - 1)).toBe("close-apps");
    expect(memoryState(fit("glm-5.2", P.laptop8), 100)).toBe("too-big");
  });
  it("asks to close apps only when a runnable model lacks free memory", () => {
    const ranked = rankModels(P.laptop16, CATALOG);
    expect(lowMemory(ranked, 0.5)).toBe(true);
    expect(lowMemory(ranked, 1000)).toBe(false);
  });
});

describe("download hint", () => {
  it("says how much disk space is missing", () => {
    expect(downloadHint(fit("glm-5.2", P.laptop8), P.laptop8)).toMatch(/^Needs .* free$/);
  });
  it("says how much space stays free for a good fit", () => {
    expect(downloadHint(fit("qwen3-0.6b"), P.laptop16)).toMatch(/stays free$/);
  });
  it("names the hard disk problem", () => {
    expect(downloadHint(fit("qwen3.6-35b-a3b", P.hddDesktop16), P.hddDesktop16)).toBe("Needs an SSD");
  });
});

describe("names", () => {
  it("calls two versions Standard and High quality", () => {
    const v = model("qwen3-4b").variants;
    expect(versionName(v, "Q4_K_M").name).toBe("Standard");
    expect(versionName(v, "Q8_0").name).toBe("High quality");
  });
  it("marks a single version", () => {
    expect(versionName(model("olmoe").variants, "INT8").name).toBe("Only one version");
  });
  it("explains every tag in the catalog", () => {
    for (const m of CATALOG) for (const t of m.tags) expect(TAG_HELP[t], t).toBeTruthy();
  });
  it("shortens processor names without losing the model", () => {
    expect(shortHardwareName("Intel(R) Core(TM) i5-8350U CPU @ 1.70GHz")).toBe("Intel Core i5-8350U");
    expect(shortHardwareName("AMD Ryzen 7 7800X3D 8-Core Processor")).toBe("AMD Ryzen 7 7800X3D 8-Core Processor");
  });
});

describe("placeTooltip", () => {
  const view = { width: 400, height: 600 };
  const bubble = { width: 200, height: 80 };
  it("sits above and centered", () => {
    expect(placeTooltip({ top: 300, bottom: 320, left: 180, width: 40 }, bubble, view)).toEqual({ top: 212, left: 100 });
  });
  it("flips below near the top and stays inside the right edge", () => {
    expect(placeTooltip({ top: 10, bottom: 30, left: 380, width: 20 }, bubble, view)).toEqual({ top: 38, left: 192 });
  });
});
