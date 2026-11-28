import { useMemo, useState } from "react";
import { ExploreModels } from "../components/ExploreModels";
import { FitFilters, type Filter } from "../components/FitFilters";
import { HardwareCard } from "../components/HardwareCard";
import { ModelCard } from "../components/ModelCard";
import { IconSearch, IconWarn } from "../components/icons";
import { CATALOG } from "../lib/catalog";
import type { Downloads } from "../lib/downloads";
import { memoryBudget, rankModels, recommendedModels } from "../lib/fit";
import { gb } from "../lib/format";
import { lowMemory } from "../lib/modelView";
import type { HardwareProfile } from "../lib/types";

type Tab = "featured" | "explore";

/** As many columns as fit, never narrower than a card needs. */
const GRID = "grid grid-cols-[repeat(auto-fill,minmax(min(100%,18.5rem),1fr))] gap-4";

function Count({ n }: { n: number }) {
  return (
    <span className="min-w-6 rounded-full bg-zinc-200/70 px-1.5 text-center text-xs leading-6 font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
      {n}
    </span>
  );
}

interface Props {
  hw: HardwareProfile | null;
  scanning: boolean;
  error: string | null;
  onRescan: () => void;
  downloads: Downloads;
  onShowDownloads: () => void;
  onShowInstalled: () => void;
}

export function ModelsScreen({ hw, scanning, error, onRescan, downloads, onShowDownloads, onShowInstalled }: Props) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [tab, setTab] = useState<Tab>("featured");
  // Explore stays mounted once opened, so its results survive a switch back to Featured.
  const [exploreOpened, setExploreOpened] = useState(false);
  const openTab = (t: Tab) => {
    setTab(t);
    if (t === "explore") setExploreOpened(true);
  };

  const ranked = useMemo(() => (hw ? rankModels(hw, CATALOG) : []), [hw]);
  const top = useMemo(() => recommendedModels(ranked, 3), [ranked]);
  const freeGB = hw ? memoryBudget(hw).availableNowGB : 0;
  const cardProps = { freeGB, downloads, onShowDownloads, onShowInstalled };

  const q = query.trim().toLowerCase();
  const matches = ranked.filter(
    (r) =>
      !q ||
      r.model.name.toLowerCase().includes(q) ||
      r.model.publisher.toLowerCase().includes(q) ||
      r.model.tags.some((t) => t.toLowerCase().includes(q)),
  );
  const shown = matches.filter((r) => filter === "all" || r.fit.label === filter);
  const count = (f: Filter) => (f === "all" ? matches.length : matches.filter((r) => r.fit.label === f).length);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
      <HardwareCard hw={hw} scanning={scanning} error={error} onRescan={onRescan} />

      {hw && lowMemory(top, freeGB) && (
        <p
          role="status"
          className="-my-2 flex items-start gap-2.5 rounded-xl border border-amber-600/25 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-400/25 dark:bg-amber-500/10 dark:text-amber-200"
        >
          <IconWarn width={18} height={18} className="mt-px shrink-0" />
          Only {gb(freeGB)} of memory is free right now. Close some apps before you start a model.
        </p>
      )}

      {hw && (
        <div
          role="tablist"
          aria-label="Model lists"
          className="grid grid-cols-2 gap-1 rounded-xl bg-zinc-100 p-1 sm:inline-grid sm:w-fit sm:self-start dark:bg-zinc-800/70"
        >
          {(
            [
              { id: "featured", text: "Featured", sub: `${CATALOG.length} picked by us` },
              { id: "explore", text: "Explore all", sub: "Hugging Face" },
            ] as const
          ).map((t) => {
            const on = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => openTab(t.id)}
                className={`flex min-w-0 flex-col items-center rounded-lg px-4 py-1.5 transition-colors sm:min-w-44 ${
                  on
                    ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-900 dark:text-zinc-100"
                    : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                }`}
              >
                <span className="text-sm font-semibold">{t.text}</span>
                <span className="truncate text-[11px] text-zinc-500 dark:text-zinc-400">{t.sub}</span>
              </button>
            );
          })}
        </div>
      )}

      {hw && exploreOpened && (
        <div hidden={tab !== "explore"} className="-mt-3">
          <ExploreModels hw={hw} freeGB={freeGB} grid={GRID} {...{ downloads, onShowDownloads, onShowInstalled }} />
        </div>
      )}

      {hw && tab === "featured" && top.length > 0 && !q && (
        <section aria-labelledby="rec-title" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="rec-title" className="text-lg font-semibold tracking-tight">
              Recommended for your computer
            </h2>
            <Count n={top.length} />
          </div>
          <p className="-mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            The smartest models that will run well on your hardware.
          </p>
          <div className={GRID}>
            {top.map((r) => (
              <ModelCard key={r.model.id} item={r} hw={hw} {...cardProps} />
            ))}
          </div>
        </section>
      )}

      {hw && tab === "featured" && (
        <section aria-labelledby="all-title" className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <h2 id="all-title" className="text-lg font-semibold tracking-tight">
                Featured models
              </h2>
              <Count n={matches.length} />
            </div>
            <label className="relative w-full sm:w-72">
              <span className="sr-only">Search models</span>
              <IconSearch
                width={16}
                height={16}
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-zinc-400"
              />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search models"
                className="h-9 w-full rounded-lg border border-zinc-200 bg-white pr-3 pl-9 text-sm placeholder:text-zinc-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
          </div>

          <FitFilters value={filter} onChange={setFilter} count={count} />

          {shown.length > 0 ? (
            <div className={GRID}>
              {shown.map((r) => (
                <ModelCard key={r.model.id} item={r} hw={hw} {...cardProps} />
              ))}
            </div>
          ) : (
            <p className="rounded-2xl border border-dashed border-zinc-200 p-8 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              No models match.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
