/**
 * فونت اسناد چاپی/PDF پنل ادمین.
 *
 * قالب‌های «خروجی PDF» در پنل ادمین سند تازه‌ای می‌سازند (`window.open("")` یا
 * `<iframe srcdoc>`) و قبلاً فونت را با
 * `@import url('https://fonts.googleapis.com/...')` از گوگل می‌گرفتند.
 * `fonts.googleapis.com` در ایران بدون فیلترشکن باز نمی‌شود؛ نتیجه این بود که
 * پنجره‌ی چاپ مدت‌ها منتظر می‌ماند و خروجی با فونت Tahoma چاپ می‌شد.
 *
 * حالا فونت به‌صورت **خودمیزبان** از دامنه‌ی خود سایت خوانده می‌شود. سند چاپی با
 * `about:blank` نوشته می‌شود، پس آدرس باید مطلق باشد — همان `location.origin`.
 */

/** `@font-face` آماده برای درج در `<style>` سند چاپی. */
export function printFontFace(): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return [
    "@font-face{",
    "font-family:'Vazirmatn';",
    `src:url('${origin}/fonts/vazirmatn/Vazirmatn-variable.woff2') format('woff2-variations');`,
    "font-weight:100 900;font-style:normal;font-display:block;",
    "}",
  ].join("");
}

/**
 * تا آماده‌شدن فونت‌ها و تصاویر صبر می‌کند و بعد چاپ را صدا می‌زند.
 *
 * `setTimeout(…, 600)` قبلی یک حدس بود؛ اگر فونت دیر می‌رسید، خروجی بی‌فونت چاپ
 * می‌شد. `document.fonts.ready` + `load` رویدادها تضمین می‌کنند سند کامل باشد.
 */
export async function printWhenReady(win: Window, options: { delayMs?: number } = {}): Promise<void> {
  const delayMs = options.delayMs ?? 0;

  const wait = async () => {
    const doc = win.document;
    try {
      await doc.fonts?.ready;
    } catch {
      /* مرورگر قدیمی — پایین‌تر با تایمر جبران می‌شود */
    }
    if (delayMs > 0) await new Promise((resolve) => window.setTimeout(resolve, delayMs));
    try {
      win.focus();
      win.print();
    } catch {
      /* کاربر پنجره را بسته است */
    }
  };

  // اگر سند هنوز در حال بارگذاری است، اول همان را تمام کن.
  if (win.document.readyState === "complete") {
    await wait();
  } else {
    await new Promise<void>((resolve) => {
      win.addEventListener("load", () => resolve(), { once: true });
      window.setTimeout(resolve, 4000); // سقف انتظار: هیچ‌وقت بی‌نهایت معطل نماند
    });
    await wait();
  }
}
