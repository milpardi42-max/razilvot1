"use client";

import { useEffect, useState, type VideoHTMLAttributes } from "react";
import { MEDIA_PLACEHOLDER_VIDEO, resolveMediaSrc } from "@/lib/media/url";

/**
 * `<video>` امن برای ویدیوهای آپلودشده.
 *
 *   · src خارجی → از مسیر هم‌دامنه‌ی `/api/media/remote` (کش روی دامنه‌ی خودمان).
 *   · خطای پخش یا نبود فایل → پوستر جانشین برند روی پلیر می‌ماند؛ کاربر صفحه‌ی
 *     سیاه/شکسته نمی‌بیند.
 *   · اگر خود پوستر هم لود نشود، به پوستر جانشین برند برمی‌گردد.
 *
 * ویدیوهای زنده‌ی وبینار که `srcObject` را با JS ست می‌کنند از این کامپوننت
 * استفاده نمی‌کنند.
 */
export interface SafeVideoProps extends Omit<VideoHTMLAttributes<HTMLVideoElement>, "src" | "poster" | "onError"> {
  src?: string | null;
  poster?: string | null;
  fallbackPoster?: string;
  onError?: VideoHTMLAttributes<HTMLVideoElement>["onError"];
}

export function SafeVideo({
  src,
  poster,
  fallbackPoster = MEDIA_PLACEHOLDER_VIDEO,
  onError,
  ...props
}: SafeVideoProps) {
  const resolvedPoster = poster ? resolveMediaSrc(poster, { kind: "image" }) : fallbackPoster;
  const resolvedSrc = src ? resolveMediaSrc(src, { kind: "video", fallback: "" }) : "";
  const [posterSrc, setPosterSrc] = useState<string>(resolvedPoster);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setPosterSrc(resolvedPoster);
    setFailed(false);
  }, [resolvedPoster, resolvedSrc]);

  /* پوسترِ نبوده هم «شکسته» حساب می‌شود → جانشین برند. */
  useEffect(() => {
    if (!posterSrc || posterSrc === fallbackPoster) return;
    const probe = new window.Image();
    const onLoad = () => undefined;
    const onProbeError = () => setPosterSrc(fallbackPoster);
    probe.addEventListener("load", onLoad);
    probe.addEventListener("error", onProbeError);
    probe.src = posterSrc;
    return () => {
      probe.removeEventListener("load", onLoad);
      probe.removeEventListener("error", onProbeError);
    };
  }, [posterSrc, fallbackPoster]);

  return (
    <video
      {...props}
      src={resolvedSrc || undefined}
      poster={failed ? fallbackPoster : posterSrc}
      onError={(event) => {
        setFailed(true);
        onError?.(event);
      }}
    />
  );
}

export default SafeVideo;
