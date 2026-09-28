/**
 * متن را در کلیپ‌بورد کپی می‌کند و **همیشه** یک boolean برمی‌گرداند (هرگز throw نمی‌کند).
 *
 * چرا فقط `navigator.clipboard` کافی نیست:
 *   مرورگر Async Clipboard API را وقتی سند داخل iframe بدون مجوز
 *   `clipboard-write` باشد — یا کاربر اجازه را رد کرده باشد — مسدود می‌کند و
 *   `writeText` با `NotAllowedError` رد می‌شود. اگر آن rejection مدیریت نشود،
 *   به‌صورت «Uncaught (in promise)» در کنسول می‌نشیند (خطای گزارش‌شده‌ی سایت).
 *
 * ترتیب تلاش:
 *   1. `navigator.clipboard.writeText` — اگر secure context باشد و policy اجازه دهد
 *   2. نسخه‌ی قدیمی: `<textarea>` موقت + `document.execCommand("copy")` که مشمول
 *      Permissions-Policy نیست و در iframe هم کار می‌کند
 */

function canUseAsyncClipboard(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  if (!window.isSecureContext) return false;
  return typeof navigator.clipboard?.writeText === "function";
}

/** اگر مرورگر از Permissions API پشتیبانی می‌کند، وضعیت مجوز را از قبل می‌خوانیم. */
async function clipboardWriteDenied(): Promise<boolean> {
  try {
    const query = navigator.permissions?.query;
    if (!query) return false;
    const status = await query.call(navigator.permissions, {
      name: "clipboard-write" as PermissionName,
    });
    return status.state === "denied";
  } catch {
    // نام مجوز در این مرورگر پشتیبانی نمی‌شود — بدون pre-flight ادامه می‌دهیم.
    return false;
  }
}

/**
 * کپی با روش قدیمی (execCommand) — روی iframe های محدودشده هم جواب می‌دهد.
 * انتخاب متن فعلی کاربر را برمی‌گرداند تا چیزی خراب نشود.
 */
export function copyTextLegacy(text: string): boolean {
  if (typeof document === "undefined") return false;
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.setAttribute("aria-hidden", "true");
  area.tabIndex = -1;
  // نباید هیچ تغییری در چیدمان صفحه ایجاد کند.
  area.style.position = "fixed";
  area.style.top = "0";
  area.style.insetInlineStart = "0";
  area.style.width = "1px";
  area.style.height = "1px";
  area.style.padding = "0";
  area.style.border = "0";
  area.style.opacity = "0";
  area.style.pointerEvents = "none";

  const selection = document.getSelection();
  const previousRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

  try {
    document.body.appendChild(area);
    area.focus({ preventScroll: true });
    area.select();
    area.setSelectionRange(0, text.length);
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    area.remove();
    if (previousRange && selection) {
      selection.removeAllRanges();
      selection.addRange(previousRange);
    }
  }
}

/**
 * کپی متن — `true` یعنی در کلیپ‌بورد نشست.
 * در صورت شکست، فراخوان می‌تواند به کاربر «کپی دستی» پیشنهاد دهد.
 */
export async function copyText(text: string): Promise<boolean> {
  if (canUseAsyncClipboard()) {
    const denied = await clipboardWriteDenied();
    if (!denied) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        // مسدود توسط Permissions-Policy، نبود focus یا رد شدن کاربر → fallback
      }
    }
  }
  return copyTextLegacy(text);
}
