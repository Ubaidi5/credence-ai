import type { ReactNode } from "react";
import { memoryBudget, toGB } from "../lib/fit";
import { bytesToGb, gb } from "../lib/format";
import { shortHardwareName } from "../lib/modelView";
import type { HardwareProfile } from "../lib/types";
import { IconCpu, IconDisk, IconGpu, IconInfo, IconMemory, IconRefresh } from "./icons";
import { Tooltip } from "./Tooltip";

const DISK_TEXT = { nvme: "NVMe SSD", ssd: "SSD", hdd: "Hard disk", unknown: "Disk" } as const;
/** More cores than this are summed up in the text under the bars. */
const MAX_CORE_BARS = 16;

interface StatProps {
  icon: ReactNode;
  label: string;
  value: string;
  fullValue?: string;
  visual?: ReactNode;
  sub?: string;
}

function Stat({ icon, label, value, fullValue = value, visual, sub }: StatProps) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="text-brand-600 dark:text-brand-400">{icon}</span>
        <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</p>
      </div>
      <p className="truncate text-sm font-semibold" title={fullValue}>
        {value}
      </p>
      <div className="flex min-h-5 items-center">{visual}</div>
      {sub && <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{sub}</p>}
    </div>
  );
}

const TRACK = "flex h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700";

interface Props {
  hw: HardwareProfile | null;
  scanning: boolean;
  error: string | null;
  onRescan: () => void;
}

export function HardwareCard({ hw, scanning, error, onRescan }: Props) {
  const budget = hw ? memoryBudget(hw) : null;
  const gpu = hw?.gpus[0];
  const disk = hw?.modelsDisk;
  const cores = hw?.physicalCores ?? hw?.logicalCores ?? 0;

  const percent = (part: number, whole: number) => `${Math.min(100, Math.max(0, (part / whole) * 100))}%`;
  const free = budget ? Math.min(budget.availableNowGB, budget.ramBudgetGB) : 0;
  const memoryText = budget
    ? `${gb(budget.availableNowGB)} free now. Up to ${gb(budget.ramBudgetGB)} usable for AI if you close other apps. ${gb(budget.totalGB)} in total.`
    : "";
  const diskUsed = disk ? toGB(disk.totalBytes - disk.availableBytes) : 0;

  // Same rule as the fit score: only NVIDIA and AMD video memory over 1 GB adds to the budget.
  const gpuUse = hw?.unifiedMemory ? "Shared memory" : budget && budget.gpuBudgetGB > 0 ? "Helps run models" : "Processor runs AI";

  return (
    <section
      aria-label="Your computer"
      className="@container rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1">
          <h2 className="truncate text-sm font-semibold">Your computer</h2>
          <Tooltip
            aria-label="About this scan"
            tip="Model labels are based on this scan. Nothing leaves your computer."
            className="grid size-7 shrink-0 cursor-help place-items-center rounded-full text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
          >
            <IconInfo width={16} height={16} />
          </Tooltip>
        </div>
        <button
          type="button"
          onClick={onRescan}
          disabled={scanning}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          <IconRefresh width={14} height={14} className={scanning ? "animate-spin" : ""} />
          {scanning ? "Scanning…" : "Rescan"}
        </button>
      </div>

      {error && (
        <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
          Couldn't read your hardware: {error}
        </p>
      )}

      {!hw && !error && (
        <div className="grid grid-cols-1 gap-5 @md:grid-cols-2 @4xl:grid-cols-4" aria-busy="true">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="space-y-3">
              <div className="h-3 w-20 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
              <div className="h-4 w-36 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
              <div className="h-1.5 w-full animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
            </div>
          ))}
        </div>
      )}

      {hw && budget && (
        <div className="grid grid-cols-1 gap-5 @md:grid-cols-2 @4xl:grid-cols-4">
          <Stat
            icon={<IconCpu width={18} height={18} />}
            label="Processor"
            value={shortHardwareName(hw.cpuBrand) || hw.cpuArch}
            fullValue={hw.cpuBrand || hw.cpuArch}
            visual={
              <span aria-hidden className="flex flex-wrap gap-1">
                {Array.from({ length: Math.min(cores, MAX_CORE_BARS) }, (_, i) => (
                  <span key={i} className="h-1.5 w-3 rounded-full bg-brand-500" />
                ))}
              </span>
            }
            sub={`${hw.physicalCores ?? "?"} cores · ${hw.logicalCores} threads`}
          />
          <Stat
            icon={<IconMemory width={18} height={18} />}
            label="Memory"
            value={`${gb(budget.totalGB)} RAM`}
            visual={
              <Tooltip tip={memoryText} aria-label={memoryText} className="block w-full cursor-help py-1.5">
                <span className={TRACK}>
                  <span className="h-full bg-emerald-500" style={{ width: percent(free, budget.totalGB) }} />
                  <span
                    className="h-full bg-brand-500/60"
                    style={{ width: percent(budget.ramBudgetGB - free, budget.totalGB) }}
                  />
                </span>
              </Tooltip>
            }
            sub={`${gb(budget.availableNowGB)} free now · ${gb(budget.ramBudgetGB)} usable for AI`}
          />
          <Stat
            icon={<IconGpu width={18} height={18} />}
            label="Graphics"
            value={gpu ? shortHardwareName(gpu.name) : "No graphics card found"}
            fullValue={gpu?.name}
            visual={
              <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                {gpuUse}
              </span>
            }
            sub={
              hw.unifiedMemory
                ? "Shares memory with the processor"
                : gpu?.vramBytes
                  ? `${bytesToGb(gpu.vramBytes)} video memory`
                  : undefined
            }
          />
          <Stat
            icon={<IconDisk width={18} height={18} />}
            label="Models drive"
            value={disk ? `${DISK_TEXT[disk.kind]} (${disk.mountPoint})` : "Unknown"}
            visual={
              disk && (
                <span
                  role="img"
                  aria-label={`${gb(diskUsed)} used of ${bytesToGb(disk.totalBytes)}`}
                  className={TRACK}
                >
                  <span className="h-full bg-brand-500" style={{ width: percent(diskUsed, toGB(disk.totalBytes)) }} />
                </span>
              )
            }
            sub={disk ? `${bytesToGb(disk.availableBytes)} free of ${bytesToGb(disk.totalBytes)}` : undefined}
          />
        </div>
      )}
    </section>
  );
}
