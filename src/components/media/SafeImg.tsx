"use client";

import { useEffect, useState, type ImgHTMLAttributes } from "react";
import { MEDIA_PLACEHOLDER_IMAGE, resolveMediaSrc } from "@/lib/media/url";

/**
 * `<img>` ساده‌ی امن — همان propsها، ولی هیچ‌وقت شکسته نمی‌شود.
 *
 * برای جاهایی که بهینه‌سازی `next/image` لازم نیست (بندانگشتی‌های پنل ادمین،
 * تصاویر داخل جدول‌ها) ولی همچنان می‌خواهیم خطای بارگذاری به تصویر جانشین برند
 * تبدیل شود.
 */
export interface SafeImgProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "onError"> {
  src?: string | null;
  fallback?: string;
  onError?: ImgHTMLAttributes<HTMLImageElement>["onError"];
}

export function SafeImg({ src, fallback = MEDIA_PLACEHOLDER_IMAGE, onError, ...props }: SafeImgProps) {
  const resolved = resolveMediaSrc(src, { kind: "image", fallback });
  const [current, setCurrent] = useState(resolved);

  useEffect(() => {
    setCurrent(resolved);
  }, [resolved]);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...props}
      alt={props.alt ?? ""}
      src={current}
      onError={(event) => {
        onError?.(event);
        setCurrent((value) => (value === fallback ? value : fallback));
      }}
    />
  );
}

export default SafeImg;
