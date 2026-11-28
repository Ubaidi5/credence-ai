import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { gb } from "../lib/format";
import { versionName } from "../lib/modelView";
import type { ModelFit } from "../lib/fit";
import { FIT_DOT, FIT_TEXT } from "./FitBadge";
import { IconCheck, IconUpDown } from "./icons";

interface Props {
  options: ModelFit["variantFits"];
  value: string;
  onChange: (quant: string) => void;
}

/**
 * Version dropdown drawn by us, because the native <select> looks and behaves
 * differently in WebView2 (Windows) and WebKitGTK (Linux).
 */
export function VersionPicker({ options, value, onChange }: Props) {
  const listId = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [upward, setUpward] = useState(true);
  const variants = options.map((o) => o.variant);
  const current = versionName(variants, value);

  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
    const onPointer = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  if (options.length < 2) {
    return (
      <div className="flex min-h-13 flex-col justify-center rounded-xl border border-dashed border-zinc-200 px-3 py-2 dark:border-zinc-700">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">{current.name}</span>
        <span className="truncate text-xs text-zinc-500 dark:text-zinc-400">{current.hint}</span>
      </div>
    );
  }

  const toggle = () => {
    const box = button.current?.getBoundingClientRect();
    if (box) {
      const needed = options.length * 60 + 16;
      setUpward(window.innerHeight - box.bottom < needed && box.top > window.innerHeight - box.bottom);
    }
    setOpen((o) => !o);
  };

  const close = () => {
    setOpen(false);
    button.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (!open) return;
    if (e.key === "Escape") {
      e.preventDefault();
      return close();
    }
    if (e.key === "Tab") return setOpen(false);
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = [...(root.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])];
    const at = items.indexOf(document.activeElement as HTMLElement);
    items[(at + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
  };

  return (
    <div ref={root} className="relative" onKeyDown={onKeyDown}>
      <button
        ref={button}
        type="button"
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        className={`flex min-h-13 w-full items-center justify-between gap-3 rounded-xl border bg-zinc-50 px-3 py-2 text-left dark:bg-zinc-800/60 ${
          open ? "border-brand-500" : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-700 dark:hover:border-zinc-600"
        }`}
      >
        <span className="min-w-0">
          <span className="block text-sm font-medium">{current.name}</span>
          <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">{current.hint}</span>
        </span>
        <IconUpDown width={16} height={16} className="shrink-0 text-zinc-400" />
      </button>

      {open && (
        <div
          id={listId}
          role="listbox"
          aria-label="Version"
          className={`absolute inset-x-0 z-30 flex flex-col gap-0.5 rounded-xl border border-zinc-200 bg-white p-1.5 shadow-xl dark:border-zinc-700 dark:bg-zinc-800 ${
            upward ? "bottom-full mb-1.5" : "top-full mt-1.5"
          }`}
        >
          {options.map(({ variant, fit }) => {
            const on = variant.quant === value;
            const name = versionName(variants, variant.quant);
            return (
              <button
                key={variant.quant}
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => {
                  onChange(variant.quant);
                  close();
                }}
                className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left ${
                  on ? "bg-brand-50 dark:bg-brand-500/20" : "hover:bg-zinc-100 dark:hover:bg-zinc-700/60"
                }`}
              >
                <IconCheck
                  width={16}
                  height={16}
                  strokeWidth={2.5}
                  className={`shrink-0 text-brand-600 dark:text-brand-400 ${on ? "" : "invisible"}`}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{name.name}</span>
                  <span className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                    <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${FIT_DOT[fit.label]}`} />
                    <span className="truncate">{FIT_TEXT[fit.label]}</span>
                  </span>
                </span>
                <span className="shrink-0 text-xs font-semibold">{gb(variant.sizeGB)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
