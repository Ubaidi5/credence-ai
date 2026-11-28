import { useState, type ComponentType, type ReactNode, type SVGProps } from "react";
import { isActive, jobId, specFor, type Downloads, type Job } from "../lib/downloads";
import type { ModelFit } from "../lib/fit";
import { gb, params } from "../lib/format";
import {
  downloadHint,
  memoryHelp,
  memoryState,
  speedDots,
  speedHelp,
  speedLabel,
  TAG_HELP,
  type MemoryState,
} from "../lib/modelView";
import type { FitLabel, HardwareProfile } from "../lib/types";
import { ConfirmDialog } from "./ConfirmDialog";
import { FIT_DOT, FitBadge } from "./FitBadge";
import {
  IconBolt,
  IconBulb,
  IconChat,
  IconCheck,
  IconCode,
  IconDownload,
  IconInfo,
  IconLock,
  IconMemory,
  IconModels,
  IconPlay,
  IconStar,
  IconUnlock,
  IconWarn,
} from "./icons";
import { Tooltip } from "./Tooltip";
import { VersionPicker } from "./VersionPicker";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

const TAG_ICON: Record<string, Icon> = {
  Chat: IconChat,
  Code: IconCode,
  Reasoning: IconBulb,
  "Open data": IconUnlock,
  Tiny: IconBolt,
  Small: IconBolt,
  Large: IconModels,
  Frontier: IconStar,
};

const MEMORY_BAR: Record<MemoryState, string> = {
  free: "bg-emerald-500",
  "close-apps": "bg-brand-500",
  "too-big": "bg-rose-500",
};

interface Props {
  item: ModelFit;
  hw: HardwareProfile;
  /** Memory free right now, in GB. */
  freeGB: number;
  downloads: Downloads;
  /** Opens the Downloads screen. */
  onShowDownloads: () => void;
  /** Opens the My models screen. */
  onShowInstalled: () => void;
}

export function ModelCard({ item, hw, freeGB, downloads, onShowDownloads, onShowInstalled }: Props) {
  const { model, variantFits } = item;
  const [quant, setQuant] = useState(item.variant.quant);
  const current = variantFits.find((v) => v.variant.quant === quant) ?? variantFits[0];
  const { variant, fit } = current;
  const [confirmAnyway, setConfirmAnyway] = useState(false);

  const id = jobId(model.id, variant.quant);
  const job = downloads.jobs.get(id);
  const installed = downloads.installedIds.has(id);
  const startDownload = () => {
    void downloads.start(specFor(model, variant), variant.sizeGB);
  };

  // Search results only know the parameter count, so their sizes are worked out.
  const size = `${variant.estimated ? "~" : ""}${gb(variant.sizeGB)}`;
  const dots = speedDots(fit);
  const memory = memoryState(fit, freeGB);

  return (
    <article className="flex h-full min-w-0 flex-col gap-3.5 rounded-2xl border border-zinc-200 bg-white p-4 transition-shadow hover:shadow-sm sm:p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <header className="flex flex-wrap items-start justify-between gap-1">
        <div className="min-w-0 flex-[1_1_auto]">
          <div className="flex items-center gap-1">
            <h3 className="truncate text-base font-semibold" title={model.name}>
              {model.name}
            </h3>
            <Tooltip
              aria-label={`About ${model.name}`}
              tip={`${params(model.totalParamsB)} parameters${
                model.kind === "moe" ? `, ${params(model.activeParamsB)} active at a time` : ""
              }`}
              className="grid size-6 shrink-0 cursor-help place-items-center rounded-full text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
            >
              <IconInfo width={15} height={15} />
            </Tooltip>
          </div>
          <p className="truncate text-xs text-zinc-500 dark:text-zinc-400" title={model.hfRepo}>
            {model.publisher}
          </p>
        </div>
        <FitBadge
          label={fit.label}
          why={
            <>
              <p>{fit.reason}</p>
              <p className="mt-1.5">Memory your computer can give: {gb(fit.memBudgetGB)}</p>
              <p>
                Needs {gb(fit.ramMinGB)} to start, {gb(fit.ramGoodGB)} for full speed
              </p>
              <p>
                Kept in memory: {Math.round(fit.inMemoryFrac * 100)}%
                {fit.inMemoryFrac < 1 && " (the rest is read from disk)"}
              </p>
              <p>Disk space needed: {gb(fit.diskNeededGB)}</p>
              <p className="mt-1.5 opacity-70">Speeds are estimates.</p>
            </>
          }
        />
      </header>

      <ul aria-label="Good for" className="flex flex-wrap gap-1.5">
        {model.tags.map((tag) => {
          const TagIcon = TAG_ICON[tag] ?? IconInfo;
          return (
            <li key={tag}>
              <Tooltip
                tip={TAG_HELP[tag] ?? tag}
                className="inline-flex h-6 cursor-help items-center gap-1.5 rounded-md bg-zinc-100 px-2 text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
              >
                <TagIcon width={12} height={12} strokeWidth={2} />
                {tag}
              </Tooltip>
            </li>
          );
        })}
      </ul>

      <p className="line-clamp-2 min-h-10 text-sm text-zinc-600 dark:text-zinc-300" title={model.description}>
        {model.description}
      </p>

      <div className="grid grid-cols-3 divide-x divide-zinc-200 rounded-xl bg-zinc-50 dark:divide-zinc-700/70 dark:bg-zinc-800/60">
        <Stat icon={<IconBolt width={15} height={15} />} value={speedLabel(fit)} tip={speedHelp(fit)}>
          <span className="flex gap-1">
            {Array.from({ length: 5 }, (_, i) => (
              <span
                key={i}
                className={`size-1.5 rounded-full ${i < dots ? FIT_DOT[fit.label] : "bg-zinc-300 dark:bg-zinc-700"}`}
              />
            ))}
          </span>
        </Stat>
        <Stat icon={<IconMemory width={15} height={15} />} value={gb(fit.ramMinGB)} tip={memoryHelp(fit, freeGB)}>
          <span className="h-1.5 w-14 max-w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
            <span
              className={`block h-full rounded-full ${MEMORY_BAR[memory]}`}
              style={{ width: `${Math.min(100, Math.round((fit.ramMinGB / Math.max(fit.memBudgetGB, 0.1)) * 100))}%` }}
            />
          </span>
        </Stat>
        <Stat
          icon={<IconDownload width={15} height={15} />}
          value={size}
          tip={
            variant.estimated
              ? `Download size: about ${gb(variant.sizeGB)}. The exact size shows when the download starts.`
              : `Download size: ${gb(variant.sizeGB)}.`
          }
        >
          <span className="text-[11px] leading-3 text-zinc-500 dark:text-zinc-400">download</span>
        </Stat>
      </div>

      <div className="mt-auto flex flex-col gap-2">
        <VersionPicker options={variantFits} value={variant.quant} onChange={setQuant} />
        <DownloadButton
          installed={installed}
          job={job}
          noSpace={fit.diskOk === false}
          label={fit.label}
          hint={downloadHint(fit, hw)}
          size={size}
          onDownload={() => (fit.label === "wont-run" ? setConfirmAnyway(true) : startDownload())}
          onShowDownloads={onShowDownloads}
          onShowInstalled={onShowInstalled}
        />
      </div>

      <ConfirmDialog
        open={confirmAnyway}
        title="This model will very likely fail"
        confirmText="Download anyway"
        onCancel={() => setConfirmAnyway(false)}
        onConfirm={() => {
          setConfirmAnyway(false);
          startDownload();
        }}
      >
        {fit.reason} It is a {size} download. Do you still want to download it?
      </ConfirmDialog>
    </article>
  );
}

/** One of the three numbers on a card: icon, value, then a small picture of it. */
function Stat({ icon, value, tip, children }: { icon: ReactNode; value: string; tip: string; children: ReactNode }) {
  return (
    <Tooltip
      tip={tip}
      aria-label={tip}
      className="flex min-w-0 cursor-help flex-col items-center gap-1.5 px-1 py-3"
    >
      <span className="text-zinc-400">{icon}</span>
      <span className="max-w-full truncate text-[13px] font-semibold">{value}</span>
      <span className="flex h-3 w-full items-center justify-center">{children}</span>
    </Tooltip>
  );
}

interface ButtonProps {
  installed: boolean;
  job: Job | undefined;
  noSpace: boolean;
  label: FitLabel;
  hint: string;
  size: string;
  onDownload: () => void;
  onShowDownloads: () => void;
  onShowInstalled: () => void;
}

type Tone = "primary" | "progress" | "done" | "risky" | "off";

const TONE: Record<Tone, { button: string; chip: string; hint: string }> = {
  primary: { button: "bg-brand-600 text-white hover:bg-brand-700", chip: "bg-white/15", hint: "text-white/85" },
  progress: {
    button: "border border-brand-600/30 text-brand-700 dark:text-brand-400",
    chip: "bg-brand-500/10",
    hint: "text-zinc-600 dark:text-zinc-300",
  },
  done: {
    button:
      "border border-emerald-600/25 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-400/25 dark:bg-emerald-500/10 dark:text-emerald-300",
    chip: "bg-emerald-500/15",
    hint: "text-zinc-600 dark:text-zinc-300",
  },
  risky: {
    button:
      "border border-rose-600/30 text-rose-700 hover:bg-rose-50 dark:border-rose-400/30 dark:text-rose-300 dark:hover:bg-rose-500/10",
    chip: "bg-rose-500/10",
    hint: "text-zinc-600 dark:text-zinc-300",
  },
  off: {
    button: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
    chip: "bg-zinc-500/10",
    hint: "",
  },
};

function DownloadButton(p: ButtonProps) {
  const progress = p.job?.totalBytes ? Math.round((p.job.doneBytes / p.job.totalBytes) * 100) : 0;

  let view: { tone: Tone; icon: Icon; title: string; hint: string; chip: string; onClick?: () => void };
  if (p.installed) {
    view = { tone: "done", icon: IconCheck, title: "Installed", hint: "Open My models", chip: p.size, onClick: p.onShowInstalled };
  } else if (p.job && isActive(p.job.status)) {
    view = { tone: "progress", icon: IconDownload, title: "Downloading", hint: "Open Downloads", chip: `${progress}%`, onClick: p.onShowDownloads };
  } else if (p.noSpace) {
    view = { tone: "off", icon: IconLock, title: "Not enough space", hint: p.hint, chip: p.size };
  } else if (p.job?.status === "paused" || p.job?.status === "error") {
    view = { tone: "primary", icon: IconPlay, title: "Resume", hint: `${progress}% already downloaded`, chip: p.size, onClick: p.onDownload };
  } else if (p.label === "wont-run") {
    view = { tone: "risky", icon: IconWarn, title: "Download anyway", hint: p.hint, chip: p.size, onClick: p.onDownload };
  } else {
    view = { tone: "primary", icon: IconDownload, title: "Download", hint: p.hint, chip: p.size, onClick: p.onDownload };
  }

  const tone = TONE[view.tone];
  const ViewIcon = view.icon;
  return (
    <button
      type="button"
      onClick={view.onClick}
      disabled={!view.onClick}
      className={`relative flex min-h-14 w-full items-center gap-2.5 overflow-hidden rounded-xl p-2 text-left transition-colors disabled:cursor-not-allowed ${tone.button}`}
    >
      {view.tone === "progress" && (
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 bg-brand-50 transition-[width] duration-300 dark:bg-brand-500/15"
          style={{ width: `${progress}%` }}
        />
      )}
      <span className={`relative grid size-9 shrink-0 place-items-center rounded-lg ${tone.chip}`}>
        <ViewIcon width={18} height={18} strokeWidth={2} />
      </span>
      <span className="relative min-w-0 flex-1">
        <span className="block text-sm leading-tight font-semibold">{view.title}</span>
        <span className={`mt-0.5 block text-[11px] leading-tight font-medium ${tone.hint}`}>{view.hint}</span>
      </span>
      <span className={`relative shrink-0 rounded-md px-2 py-1 text-xs font-bold whitespace-nowrap ${tone.chip}`}>
        {view.chip}
      </span>
    </button>
  );
}
