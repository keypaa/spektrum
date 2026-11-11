import * as R from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import { cn } from "../lib/cn";

export const Dialog = R.Root;
export const DialogTrigger = R.Trigger;

// Bundle: `text-text-editor-primary text-lg font-semibold` — weight 600, and the
// default `text-lg` line-height (28 px), not `leading-6`.
export function DialogTitle({
  className,
  ...rest
}: R.DialogTitleProps) {
  return (
    <R.Title
      className={cn("text-lg font-semibold text-text-editor-primary", className)}
      {...rest}
    />
  );
}

export function DialogDescription({
  className,
  ...rest
}: R.DialogDescriptionProps) {
  return (
    <R.Description
      className={cn("text-sm text-text-editor-secondary", className)}
      {...rest}
    />
  );
}

export function DialogContent({
  className,
  children,
  ...rest
}: R.DialogContentProps & { children: ReactNode }) {
  return (
    <R.Portal>
      {/* Ref 15 (dark): the scrim lightens the card from #1f1f20 to (56,56,57).
          That is white @10 % over the card after `backdrop-brightness-110`
          (31*1.1=34; 0.1*255+0.9*34=56) plus `backdrop-blur-md`. No light-theme
          dialog capture exists; the light pair is the bundle's own. */}
      <R.Overlay
        className={cn(
          "fixed inset-0 z-50 backdrop-blur-md",
          "bg-black/20 backdrop-brightness-95 dark:bg-white/10 dark:backdrop-brightness-110",
        )}
      />
      {/* Measured in ref 15: 651x246 physical = 576x218 CSS = `max-w-xl`, centred,
          radius 13.6 physical = 12 CSS = `rounded-xl`, bg #1f1f1f = --modal-bg,
          shadow ~19 physical below the panel. NO close X. */}
      <R.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-50 grid h-auto w-full max-w-xl -translate-x-1/2 -translate-y-1/2",
          "gap-4 rounded-xl bg-modal-bg p-6 shadow-lg",
          // The bundle adds the border in light mode only; a transparent border
          // in dark keeps the inner metrics identical to the capture.
          "border border-border-outline dark:border-transparent",
          "focus:outline-none",
          className,
        )}
        {...rest}
      >
        {children}
      </R.Content>
    </R.Portal>
  );
}

// `sm:` is always true at our viewport widths, so the sm: branch applies.
export function DialogHeader({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-2 text-left">{children}</div>;
}

export function DialogFooter({ children }: { children: ReactNode }) {
  return <div className="flex flex-row justify-end gap-2">{children}</div>;
}

// Ref 15 footer, measured: the action pill is 133x47 physical = 118x41 CSS at
// `px-4`, and it is grey #8f8f8f because the empty input disables it — white
// (--button-primary-bg) @ 50 % over #1f1f1f. Using a solid grey token instead
// would be ~0.18 % of all pixels by itself, so use the real token + opacity.
export function DialogAction({
  className,
  ...rest
}: R.DialogCloseProps) {
  return (
    <R.Close
      className={cn(
        "inline-flex h-10 items-center justify-center rounded-full bg-button-primary-bg px-4 text-sm font-medium text-button-primary-text",
        "hover:bg-button-primary-bg-hover hover:text-button-primary-text-hover",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-button-primary-bg",
        "disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...rest}
    />
  );
}

// Variant outline: text-button-secondary-text (#e8e8e8 dark), px-4 (the Cancel
// text ends 28 physical before the pill's left edge = 16 CSS padding + 8 CSS
// footer gap).
export function DialogCancel({
  className,
  ...rest
}: R.DialogCloseProps) {
  return (
    <R.Close
      className={cn(
        "inline-flex h-10 items-center justify-center rounded-full px-4 text-sm font-medium text-button-secondary-text",
        "hover:bg-button-secondary-bg-hover hover:text-button-secondary-text-hover",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-button-primary-bg",
        "disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...rest}
    />
  );
}
