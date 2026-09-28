"use client";

import { useState, useCallback } from "react";
import { Link2, Check, Share2, TriangleAlert } from "lucide-react";
import { copyText } from "@/lib/clipboard";
import { cn } from "@/lib/utils";

interface Props {
  title: string;
  locale: "fa" | "en";
}

/** Copy-link + native share / social share buttons for portfolio detail. */
export function ShareButtons({ title, locale }: Props) {
  /* "failed" is a real state: an iframe without the clipboard-write permission
     blocks navigator.clipboard, and `copyText` falls back to execCommand. */
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [manualUrl, setManualUrl] = useState("");

  const copy = useCallback(async () => {
    const url = window.location.href;
    const ok = await copyText(url);
    setCopyState(ok ? "copied" : "failed");
    setManualUrl(ok ? "" : url);
    setTimeout(() => {
      setCopyState("idle");
      setManualUrl("");
    }, 6000);
  }, []);

  const nativeShare = useCallback(async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        // user cancelled or not supported — fall back to copy
      }
    }
    await copy();
  }, [title, copy]);

  const shareX = () => {
    const url = encodeURIComponent(window.location.href);
    const text = encodeURIComponent(title);
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, "_blank", "noopener,noreferrer");
  };

  const shareLinkedIn = () => {
    const url = encodeURIComponent(window.location.href);
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${url}`, "_blank", "noopener,noreferrer");
  };

  const shareWhatsApp = () => {
    const url = encodeURIComponent(window.location.href);
    const text = encodeURIComponent(title);
    window.open(`https://wa.me/?text=${text}%20${url}`, "_blank", "noopener,noreferrer");
  };

  const fa = locale === "fa";
  const label = fa ? "اشتراک‌گذاری" : "Share";
  const copiedLabel = fa ? "کپی شد" : "Copied!";
  const copyLabel =
    copyState === "copied"
      ? copiedLabel
      : copyState === "failed"
        ? fa
          ? "کپی نشد"
          : "Copy blocked"
        : fa
          ? "کپی لینک"
          : "Copy link";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-caption text-muted">{label}:</span>
      {/* Native share (mobile) — shown when API is available; falls back to copy */}
      <button
        type="button"
        onClick={nativeShare}
        aria-label={label}
        className="flex h-8 items-center justify-center rounded-full border border-border px-2.5 text-[11px] font-medium text-foreground-secondary transition-colors hover:border-foreground hover:text-foreground md:hidden"
      >
        <Share2 className="h-3.5 w-3.5" />
      </button>
      {/* Copy link */}
      <button
        type="button"
        onClick={copy}
        className={cn(
          "hidden md:flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] transition-all duration-200",
          copyState === "copied"
            ? "border-success text-success"
            : copyState === "failed"
              ? "border-error text-error"
              : "border-border text-foreground-secondary hover:border-foreground hover:text-foreground",
        )}
      >
        {copyState === "copied" ? (
          <Check className="h-3 w-3" />
        ) : copyState === "failed" ? (
          <TriangleAlert className="h-3 w-3" />
        ) : (
          <Link2 className="h-3 w-3" />
        )}
        {copyLabel}
      </button>

      {/* The browser blocked the clipboard (embedded/preview frame): let the
          visitor copy the link by hand instead of pretending it worked. */}
      {manualUrl && (
        <input
          readOnly
          dir="ltr"
          value={manualUrl}
          aria-label={fa ? "لینک این صفحه" : "This page's link"}
          onFocus={(event) => event.currentTarget.select()}
          onClick={(event) => event.currentTarget.select()}
          className="h-8 w-full max-w-sm rounded-full border border-border bg-background-secondary px-3 text-[11px] text-foreground-secondary"
        />
      )}
      {/* Social buttons — desktop only */}
      <button type="button" onClick={shareX} aria-label="Share on X / Twitter" className="hidden md:flex h-8 items-center justify-center rounded-full border border-border px-2.5 text-[11px] font-medium text-foreground-secondary transition-colors hover:border-foreground hover:text-foreground">
        𝕏
      </button>
      <button type="button" onClick={shareLinkedIn} aria-label="Share on LinkedIn" className="hidden md:flex h-8 items-center justify-center rounded-full border border-border px-2.5 text-[11px] font-medium text-foreground-secondary transition-colors hover:border-foreground hover:text-foreground">
        in
      </button>
      <button type="button" onClick={shareWhatsApp} aria-label="Share on WhatsApp" className="hidden md:flex h-8 items-center justify-center rounded-full border border-border px-2.5 text-[11px] font-medium text-foreground-secondary transition-colors hover:border-foreground hover:text-foreground">
        WA
      </button>
    </div>
  );
}
