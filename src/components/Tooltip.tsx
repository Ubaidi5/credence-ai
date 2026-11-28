import { useEffect, useId, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { placeTooltip } from "../lib/tooltip";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { tip: ReactNode };

/**
 * A button with a tooltip that works with mouse, keyboard and touch. It renders on
 * <body> with fixed positioning, so scrolling panels never clip it. No browser
 * popover or anchor APIs: older WebKitGTK on Linux does not have them.
 */
export function Tooltip({ tip, children, onClick, ...rest }: Props) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useLayoutEffect(() => {
    const t = trigger.current;
    const b = bubble.current;
    if (!open || !t || !b) return;
    const { top, left } = placeTooltip(
      t.getBoundingClientRect(),
      { width: b.offsetWidth, height: b.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight },
    );
    Object.assign(b.style, { top: `${top}px`, left: `${left}px`, visibility: "visible" });
  }, [open, tip]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    const onPointer = (e: PointerEvent) => !trigger.current?.contains(e.target as Node) && close();
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        {...rest}
        ref={trigger}
        aria-describedby={open ? id : undefined}
        onPointerEnter={(e) => e.pointerType === "mouse" && setOpen(true)}
        onPointerLeave={(e) => e.pointerType === "mouse" && setOpen(false)}
        onFocus={(e) => e.currentTarget.matches(":focus-visible") && setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => {
          setOpen(true);
          onClick?.(e);
        }}
      >
        {children}
      </button>
      {open &&
        createPortal(
          <div
            ref={bubble}
            id={id}
            role="tooltip"
            style={{ top: 0, left: 0, visibility: "hidden" }}
            className="pointer-events-none fixed z-50 w-max max-w-[min(16rem,calc(100vw-1rem))] rounded-lg bg-zinc-900 px-3 py-2 text-xs leading-relaxed font-medium text-white shadow-lg dark:bg-zinc-100 dark:text-zinc-900"
          >
            {tip}
          </div>,
          document.body,
        )}
    </>
  );
}
