"use client";

import NextImage, { type ImageProps } from "next/image";
import { useEffect, useState } from "react";
import { MEDIA_PLACEHOLDER_IMAGE, needsUnoptimized, resolveMediaSrc } from "@/lib/media/url";

/**
 * جایگزین امن `next/image`.
 *
 * تضمین می‌کند کاربر هیچ‌وقت «تصویر شکسته» نبیند:
 *   · آدرس خارجی → از مسیر هم‌دامنه‌ی `/api/media/remote` سرو می‌شود
 *     (سرور یک‌بار می‌گیرد و روی دامنه‌ی خودمان کش می‌کند) پس در ایران هم باز می‌شود.
 *   · آدرس خالی یا نامعتبر → تصویر جانشین برند.
 *   · هر خطای بارگذاری (۴۰۴، قطع شبکه، هاست مسدود) → تصویر جانشین برند.
 *
 * آدرس‌های محلی (`/images/…`) مثل قبل با بهینه‌ساز `next/image` سرو می‌شوند.
 */
export interface SafeImageProps extends Omit<ImageProps, "src" | "onError"> {
  src: ImageProps["src"] | string | null | undefined;
  /** تصویر جانشین در صورت خطا (پیش‌فرض: جانشین برند). */
  fallback?: string;
  onError?: ImageProps["onError"];
}

export function SafeImage({ src, fallback = MEDIA_PLACEHOLDER_IMAGE, onError, unoptimized, ...props }: SafeImageProps) {
  const isStatic = typeof src !== "string";
  const resolved = isStatic ? src : resolveMediaSrc(src, { kind: "image", fallback });
  const [current, setCurrent] = useState<ImageProps["src"] | string | null | undefined>(resolved);

  useEffect(() => {
    setCurrent(resolved);
  }, [resolved]);

  if (isStatic && src) {
    return <NextImage {...props} src={src} unoptimized={unoptimized} onError={onError} />;
  }

  const source = typeof current === "string" ? current : fallback;

  return (
    <NextImage
      {...props}
      src={source}
      unoptimized={unoptimized ?? needsUnoptimized(source)}
      onError={(event) => {
        onError?.(event);
        setCurrent((value) => (value === fallback ? value : fallback));
      }}
    />
  );
}

export default SafeImage;
