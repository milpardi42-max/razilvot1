/**
 * اسکریپت‌های bootstrap که پیش از رنگ‌آمیزی صفحه در `<head>` اصلی اجرا می‌شوند.
 *
 * این‌ها در `app/layout.tsx` تزریق می‌شوند — یعنی یک‌بار و در همان `<html>/<head>`
 * واقعی؛ نه در لِی‌اوت پنل ادمین که قبلاً یک `<html>/<head>/<body>` تودرتو می‌ساخت
 * و مرورگر آن تگ‌های تکراری را دور می‌ریخت (نتیجه: عدم تطابق hydration).
 *
 * هر دو اسکریپت پیش از اولین رنگ‌آمیزی اجرا می‌شوند، پس هیچ‌کدام باعث «پرش» ظاهری
 * نمی‌شوند و روی `<html>` مقادیری می‌گذارند که React آن‌ها را رندر نمی‌کند.
 */

/** تم تاریک ذخیره‌شده را برای صفحه‌های سایت اعمال می‌کند. */
export const THEME_BOOTSTRAP = `(function(){try{var t=localStorage.getItem('ra-theme');if(t==='dark')document.documentElement.setAttribute('data-theme','dark');}catch(e){}})();`;

/**
 * پنل ادمین را از تمِ سایت جدا می‌کند.
 *
 * قبلاً پنل ادمین `<html>` مستقل خودش را داشت (بدون `data-theme`)، پس همیشه روشن
 * و راست‌چین بود. حالا که یک `<html>` مشترک داریم، همان رفتار را اینجا بازمی‌سازیم:
 *
 *   · کلاس `admin-shell` → پس‌زمینه‌ی خاکستری، فونت فارسی و RTL (globals.css)
 *   · `data-theme="light"` → اگر بازدیدکننده حالت تاریک را انتخاب کرده باشد، پنل
 *     ادمین هم تاریک نشود و ترکیب «کارت‌های روشن روی زمینه‌ی خاکستری» حفظ شود.
 *
 * (وضعیت ادمین یک حساب جداگانه است و از داخل پنل هیچ دکمه‌ی تغییر تمی وجود ندارد.)
 */
export const ADMIN_SHELL_BOOTSTRAP = `(function(){try{if(location.pathname.indexOf('/admin/')===0){var r=document.documentElement;r.classList.add('admin-shell');r.setAttribute('data-theme','light');}}catch(e){}})();`;
