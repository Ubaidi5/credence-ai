import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Downloads } from "../lib/downloads";
import { fitModel } from "../lib/fit";
import { searchModels, searchUrl, type HfSort } from "../lib/hfSearch";
import type { CatalogModel, FitLabel, HardwareProfile } from "../lib/types";
import { FitFilters, type Filter } from "./FitFilters";
import { IconRefresh, IconSearch, IconSpinner, IconWarn } from "./icons";
import { ModelCard } from "./ModelCard";

const SORTS: { id: HfSort; text: string }[] = [
  { id: "trendingScore", text: "Trending" },
  { id: "downloads", text: "Most downloaded" },
  { id: "likes", text: "Most liked" },
];

/** A page of HF results keeps about a third of the repos, so fetch until this many are new. */
const WANT_PER_LOAD = 12;
const MAX_PAGES_PER_LOAD = 4;

interface Props {
  hw: HardwareProfile;
  freeGB: number;
  grid: string;
  downloads: Downloads;
  onShowDownloads: () => void;
  onShowInstalled: () => void;
}

export function ExploreModels({ hw, freeGB, grid, downloads, onShowDownloads, onShowInstalled }: Props) {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<HfSort>("trendingScore");
  const [filter, setFilter] = useState<Filter>("all");
  const [models, setModels] = useState<CatalogModel[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useRef<AbortController | null>(null);

  // Search after the user stops typing for a moment.
  useEffect(() => {
    const t = setTimeout(() => setQuery(input.trim()), 400);
    return () => clearTimeout(t);
  }, [input]);

  /** Fetches pages from `from` until enough new models arrived. `reset` starts a new list. */
  const load = useCallback(async (from: string, reset: boolean) => {
    run.current?.abort();
    const ctl = new AbortController();
    run.current = ctl;
    setLoading(true);
    setError(null);
    if (reset) {
      setModels([]);
      setNext(null);
    }
    try {
      let url: string | null = from;
      const found: CatalogModel[] = [];
      for (let i = 0; url && i < MAX_PAGES_PER_LOAD && found.length < WANT_PER_LOAD; i++) {
        const page = await searchModels(url, ctl.signal);
        found.push(...page.models);
        url = page.next;
      }
      if (ctl.signal.aborted) return;
      setModels((prev) => {
        const seen = new Set(reset ? [] : prev.map((m) => m.id));
        return [...(reset ? [] : prev), ...found.filter((m) => !seen.has(m.id) && seen.add(m.id))];
      });
      setNext(url);
    } catch (e) {
      if (!ctl.signal.aborted) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (run.current === ctl) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(searchUrl(query, sort), true);
    return () => run.current?.abort();
  }, [query, sort, load]);

  const fits = useMemo(() => models.map((m) => fitModel(hw, m)), [models, hw]);
  const count = (f: Filter) => (f === "all" ? fits.length : fits.filter((r) => r.fit.label === f).length);
  const shown = fits.filter((r) => filter === "all" || r.fit.label === (filter as FitLabel));
  const cardProps = { hw, freeGB, downloads, onShowDownloads, onShowInstalled };

  return (
    <section aria-labelledby="explore-title" className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 id="explore-title" className="text-lg font-semibold tracking-tight">
            Explore Hugging Face
          </h2>
          <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
            Free models from the community that Credence can run. Sizes are estimates until you download.
          </p>
        </div>
        <label className="relative w-full shrink-0 sm:w-72">
          <span className="sr-only">Search Hugging Face</span>
          <IconSearch
            width={16}
            height={16}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-zinc-400"
          />
          <input
            type="search"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Search, e.g. coder, qwen, 8b"
            className="h-9 w-full rounded-lg border border-zinc-200 bg-white pr-3 pl-9 text-sm placeholder:text-zinc-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
      </div>

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div role="radiogroup" aria-label="Sort" className="-mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {SORTS.map((s) => {
            const on = sort === s.id;
            return (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setSort(s.id)}
                className={`h-8 shrink-0 rounded-lg px-3 text-sm font-medium transition-colors ${
                  on
                    ? "bg-brand-600/10 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
                    : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                }`}
              >
                {s.text}
              </button>
            );
          })}
        </div>
        <FitFilters value={filter} onChange={setFilter} count={count} />
      </div>

      {error && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-xl border border-rose-600/25 bg-rose-50 px-4 py-3 text-sm text-rose-900 sm:flex-row sm:items-center dark:border-rose-400/25 dark:bg-rose-500/10 dark:text-rose-200"
        >
          <span className="flex min-w-0 flex-1 items-start gap-2.5">
            <IconWarn width={18} height={18} className="mt-px shrink-0" />
            {error}
          </span>
          <button
            type="button"
            onClick={() => void load(next ?? searchUrl(query, sort), !next)}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 self-start rounded-lg border border-current/20 px-3 font-medium hover:bg-rose-100 sm:self-auto dark:hover:bg-rose-500/15"
          >
            <IconRefresh width={14} height={14} /> Try again
          </button>
        </div>
      )}

      {shown.length > 0 && (
        <div className={grid}>
          {shown.map((r) => (
            <ModelCard key={r.model.id} item={r} {...cardProps} />
          ))}
        </div>
      )}

      {loading && models.length === 0 && (
        <div className={grid} aria-hidden>
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-96 animate-pulse rounded-2xl border border-zinc-200 bg-zinc-100/70 dark:border-zinc-800 dark:bg-zinc-900" />
          ))}
        </div>
      )}

      {!loading && !error && shown.length === 0 && (
        <p className="rounded-2xl border border-dashed border-zinc-200 p-8 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
          {models.length === 0
            ? query
              ? `No models for "${query}" that Credence can run yet. Try another name.`
              : "No models found."
            : "None of these match this filter."}
          {next && " Load more to see others."}
        </p>
      )}

      {next && (models.length > 0 || !loading) && (
        <button
          type="button"
          disabled={loading}
          onClick={() => void load(next, false)}
          className="mx-auto inline-flex h-10 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-wait disabled:opacity-70 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          {loading && <IconSpinner width={16} height={16} />}
          {loading ? "Loading…" : "Load more models"}
        </button>
      )}
    </section>
  );
}
