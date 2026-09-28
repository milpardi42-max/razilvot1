"use client";

import { Check, Copy, TriangleAlert } from "lucide-react";
import { useCopy } from "@/hooks/use-copy";
import { cn } from "@/lib/utils";

/**
 * دکمه‌ی کپی با بازخورد صادقانه.
 *
 * اگر مرورگر کلیپ‌بورد را مسدود کند (iframe بدون مجوز `clipboard-write`)، به‌جای
 * «کپی شد» حالت «کپی نشد» نمایش داده می‌شود و — به‌صورت پیش‌فرض — همان متن در یک
 * فیلد خواندنی می‌آید تا کاربر با Ctrl/Cmd+C خودش کپی کند. هیچ استثنایی هم به
 * کنسول نمی‌رود (`copyText` هرگز throw نمی‌کند).
 */
export function CopyButton({
  text,
  labels,
  className,
  iconClassName,
  showLabel = true,
  showManualField = true,
  manualHint,
  manualClassName,
  title,
}: {
  /** متنی که کپی می‌شود */
  text: string;
  labels: { idle: string; copied: string; failed: string };
  /** کلاس‌های خود دکمه — ظاهر هر محل استفاده را حفظ می‌کند */
  className?: string;
  iconClassName?: string;
  showLabel?: boolean;
  showManualField?: boolean;
  manualHint?: string;
  manualClassName?: string;
  title?: string;
}) {
  const { state, copy } = useCopy();
  const failed = state === "failed";

  const button = (
    <button
      type="button"
      onClick={() => void copy(text)}
      title={title ?? labels.idle}
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-1.5 transition-colors",
        failed && "text-error",
        className,
      )}
    >
      {state === "copied" ? (
        <Check className={cn("h-3.5 w-3.5", iconClassName)} aria-hidden />
      ) : failed ? (
        <TriangleAlert className={cn("h-3.5 w-3.5", iconClassName)} aria-hidden />
      ) : (
        <Copy className={cn("h-3.5 w-3.5", iconClassName)} aria-hidden />
      )}
      {showLabel && <span>{state === "copied" ? labels.copied : failed ? labels.failed : labels.idle}</span>}
      {!showLabel && <span className="sr-only">{state === "copied" ? labels.copied : failed ? labels.failed : labels.idle}</span>}
    </button>
  );

  if (!failed || !showManualField) {
    return <span className="inline-flex">{button}</span>;
  }

  return (
    <span className="inline-flex flex-col items-stretch gap-1.5">
      {button}
      <input
        readOnly
        dir="ltr"
        value={text}
        aria-label={labels.idle}
        onFocus={(event) => event.currentTarget.select()}
        onClick={(event) => event.currentTarget.select()}
        className={cn(
          "h-8 w-full min-w-[12rem] rounded-md border border-border bg-background-secondary px-2 font-mono text-[11px] text-foreground-secondary",
          "selection:bg-accent selection:text-accent-foreground",
          manualClassName,
        )}
      />
      {manualHint && <span className="text-[10px] text-muted">{manualHint}</span>}
    </span>
  );
}
