/**
 * پارس هدر `Range` برای پخش و جابه‌جایی (seek) ویدیو.
 *
 * بدون پاسخ `206 Partial Content` مرورگر ویدیو را پخش نمی‌کند یا اسکراب کار
 * نمی‌کند؛ این تابع هم بازه‌ی معمولی، هم بازه‌ی باز (`bytes=100-`) و هم بازه‌ی
 * پسوندی (`bytes=-500`) را می‌فهمد.
 */
export function parseRange(
  header: string | null,
  size: number,
): { start: number; end: number } | null {
  if (!header) return null;
  const match = header.match(/bytes=(\d*)-(\d*)/);
  if (!match) return null;
  const [, rawStart, rawEnd] = match;
  if (rawStart === "" && rawEnd === "") return null;

  if (rawStart === "") {
    const length = Number(rawEnd);
    if (!Number.isFinite(length) || length <= 0) return null;
    return { start: Math.max(0, size - length), end: size - 1 };
  }
  const start = Number(rawStart);
  if (!Number.isFinite(start)) return null;
  const end = rawEnd === "" ? size - 1 : Number(rawEnd);
  if (start >= size) return { start, end: size - 1 };
  return { start, end: Math.min(Number.isFinite(end) ? end : size - 1, size - 1) };
}
