import { useMemo, useState } from "react";
import { FIT_DOT } from "../components/FitBadge";
import { HardwareCard } from "../components/HardwareCard";
import { ModelCard } from "../components/ModelCard";
import { IconSearch, IconWarn } from "../components/icons";
import { CATALOG } from "../lib/catalog";
import type { Downloads } from "../lib/downloads";
import { memoryBudget, rankModels, recommendedModels } from "../lib/fit";
import { gb } from "../lib/format";
import { lowMemory } from "../lib/modelView";
import type { FitLabel, HardwareProfile } from "../lib/types";

type Filter = "all" | FitLabel;

const FILTERS: { id: Filter; text: string }[] = [
  { id: "all", text: "All" },
  { id: "recommended", text: "Recommended" },
  { id: "slow", text: "Will run slowly" },
  { id: "wont-run", text: "Won't run" },
];

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

      {hw && top.length > 0 && !q && (
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

      {hw && (
        <section aria-labelledby="all-title" className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <h2 id="all-title" className="text-lg font-semibold tracking-tight">
                All models
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

          <div role="tablist" aria-label="Filter by fit" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
            {FILTERS.map((f) => {
              const on = filter === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setFilter(f.id)}
                  className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors ${
                    on
                      ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                      : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  }`}
                >
                  <span
                    aria-hidden
                    className={`size-2 rounded-full ${f.id === "all" ? "bg-zinc-400" : FIT_DOT[f.id]}`}
                  />
                  {f.text}
                  <span className={on ? "opacity-70" : "text-zinc-400"}>{count(f.id)}</span>
                </button>
              );
            })}
          </div>

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
