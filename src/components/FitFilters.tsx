import type { FitLabel } from "../lib/types";
import { FIT_DOT } from "./FitBadge";

export type Filter = "all" | FitLabel;

const FILTERS: { id: Filter; text: string }[] = [
  { id: "all", text: "All" },
  { id: "recommended", text: "Recommended" },
  { id: "slow", text: "Will run slowly" },
  { id: "wont-run", text: "Won't run" },
];

interface Props {
  value: Filter;
  onChange: (f: Filter) => void;
  count: (f: Filter) => number;
}

/** The "All / Recommended / Will run slowly / Won't run" chips. */
export function FitFilters({ value, onChange, count }: Props) {
  return (
    <div role="tablist" aria-label="Filter by fit" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
      {FILTERS.map((f) => {
        const on = value === f.id;
        return (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(f.id)}
            className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors ${
              on
                ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            }`}
          >
            <span aria-hidden className={`size-2 rounded-full ${f.id === "all" ? "bg-zinc-400" : FIT_DOT[f.id]}`} />
            {f.text}
            <span className={on ? "opacity-70" : "text-zinc-400"}>{count(f.id)}</span>
          </button>
        );
      })}
    </div>
  );
}
