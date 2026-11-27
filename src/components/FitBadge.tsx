import type { ReactNode } from "react";
import type { FitLabel } from "../lib/types";
import { IconHelp } from "./icons";
import { Tooltip } from "./Tooltip";

export const FIT_TEXT: Record<FitLabel, string> = {
  recommended: "Recommended",
  slow: "Will run slowly",
  "wont-run": "Won't run",
};

export const FIT_DOT: Record<FitLabel, string> = {
  recommended: "bg-emerald-500 dark:bg-emerald-400",
  slow: "bg-amber-500 dark:bg-amber-400",
  "wont-run": "bg-rose-500 dark:bg-rose-400",
};

const SHORT_TEXT: Record<FitLabel, string> = { ...FIT_TEXT, slow: "Slow" };

const STYLE: Record<FitLabel, string> = {
  recommended:
    "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/25",
  slow: "bg-amber-50 text-amber-800 ring-amber-600/25 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/25",
  "wont-run": "bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/25",
};

/** Fit label with a status dot. Hover, focus or tap it to see why. */
export function FitBadge({ label, why }: { label: FitLabel; why: ReactNode }) {
  return (
    <Tooltip
      tip={why}
      className={`relative inline-flex h-7 shrink-0 cursor-help items-center gap-1.5 rounded-full pr-1.5 pl-2.5 text-xs font-semibold whitespace-nowrap ring-1 ring-inset ${STYLE[label]}`}
    >
      <span aria-hidden className={`size-1.5 rounded-full ${FIT_DOT[label]}`} />
      {SHORT_TEXT[label]}
      <IconHelp width={16} height={16} />
      <span className="sr-only">, why?</span>
    </Tooltip>
  );
}
