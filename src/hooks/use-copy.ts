"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { copyText } from "@/lib/clipboard";

export type CopyState = "idle" | "copied" | "failed";

/**
 * وضعیت کپی را برای UI نگه می‌دارد.
 *
 * سه حالت دارد تا هرگز «کپی شد» الکی نشان داده نشود: اگر مرورگر کلیپ‌بورد را
 * مسدود کند (`failed`) رابط کاربری می‌تواند متن را برای کپی دستی نشان دهد.
 */
export function useCopy(resetAfterMs = 2500) {
  const [state, setState] = useState<CopyState>("idle");
  const timer = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  const copy = useCallback(
    async (text: string) => {
      const ok = await copyText(text);
      setState(ok ? "copied" : "failed");
      clearTimer();
      timer.current = window.setTimeout(() => setState("idle"), resetAfterMs);
      return ok;
    },
    [clearTimer, resetAfterMs],
  );

  const reset = useCallback(() => {
    clearTimer();
    setState("idle");
  }, [clearTimer]);

  return { state, copy, reset };
}
