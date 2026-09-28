import type { Localized } from "./i18n/types";
import type { SocialLink, SocialPlatform } from "./types";

/**
 * شبکه‌های اجتماعی — تنظیمات مشترک بین فوتر، صفحه تماس، seed و پنل ادمین.
 *
 * این فایل نه `server-only` است و نه `use client`: هم seed (سرور) و هم کامپوننت
 * ردیف آیکون‌ها (کلاینت) از آن استفاده می‌کنند.
 */

export interface SocialPlatformMeta {
  label: Localized;
  /** رنگ برند — فقط برای حالت hover استفاده می‌شود */
  color: string;
  /** نمونه‌ی آدرس، برای راهنمای فیلد در پنل ادمین */
  placeholder: string;
}

export const SOCIAL_PLATFORMS: Record<SocialPlatform, SocialPlatformMeta> = {
  instagram: { label: { fa: "اینستاگرام", en: "Instagram" }, color: "#E1306C", placeholder: "https://instagram.com/yourpage" },
  telegram: { label: { fa: "تلگرام", en: "Telegram" }, color: "#229ED9", placeholder: "https://t.me/yourchannel" },
  whatsapp: { label: { fa: "واتس‌اپ", en: "WhatsApp" }, color: "#25D366", placeholder: "https://wa.me/989120000000" },
  pinterest: { label: { fa: "پینترست", en: "Pinterest" }, color: "#BD081C", placeholder: "https://pinterest.com/yourpage" },
  youtube: { label: { fa: "یوتیوب", en: "YouTube" }, color: "#FF0033", placeholder: "https://youtube.com/@yourchannel" },
  linkedin: { label: { fa: "لینکدین", en: "LinkedIn" }, color: "#0A66C2", placeholder: "https://linkedin.com/company/yourpage" },
  x: { label: { fa: "ایکس (توییتر)", en: "X (Twitter)" }, color: "#111111", placeholder: "https://x.com/yourpage" },
  facebook: { label: { fa: "فیسبوک", en: "Facebook" }, color: "#0866FF", placeholder: "https://facebook.com/yourpage" },
  threads: { label: { fa: "تردز", en: "Threads" }, color: "#111111", placeholder: "https://threads.net/@yourpage" },
  email: { label: { fa: "ایمیل", en: "Email" }, color: "#B5713A", placeholder: "mailto:hello@rosieatelier.com" },
  phone: { label: { fa: "تلفن", en: "Phone" }, color: "#1F8A70", placeholder: "tel:+982188000000" },
};

export const SOCIAL_PLATFORM_ORDER: SocialPlatform[] = [
  "instagram",
  "telegram",
  "whatsapp",
  "pinterest",
  "youtube",
  "linkedin",
  "x",
  "threads",
  "facebook",
  "email",
  "phone",
];

/** ردیف پیش‌فرض — تا وقتی ادمین آدرس‌های واقعی را وارد نکرده است. */
export const defaultSocials: SocialLink[] = [
  { id: "social-instagram", platform: "instagram", href: "https://instagram.com/rosie.atelier", enabled: true },
  { id: "social-telegram", platform: "telegram", href: "https://t.me/rosieatelier", enabled: true },
  { id: "social-whatsapp", platform: "whatsapp", href: "https://wa.me/982188000000", enabled: true },
  { id: "social-pinterest", platform: "pinterest", href: "https://pinterest.com/rosieatelier", enabled: true },
  { id: "social-youtube", platform: "youtube", href: "https://youtube.com/@rosieatelier", enabled: true },
  { id: "social-email", platform: "email", href: "mailto:hello@rosieatelier.com", enabled: true },
];

export function isSocialPlatform(value: unknown): value is SocialPlatform {
  return typeof value === "string" && value in SOCIAL_PLATFORMS;
}

export function socialLabel(link: SocialLink, locale: "fa" | "en"): string {
  const custom = link.label?.[locale] ?? link.label?.en ?? link.label?.fa;
  if (custom && custom.trim()) return custom.trim();
  return SOCIAL_PLATFORMS[link.platform]?.label[locale] ?? link.platform;
}

/** ردیف فعال برای رندر در سایت (ورودی ادمین + پیش‌فرض‌ها). */
export function visibleSocials(socials: SocialLink[] | undefined): SocialLink[] {
  const list = socials && socials.length > 0 ? socials : defaultSocials;
  return list.filter((link) => link.enabled !== false && link.href.trim().length > 0 && isSocialPlatform(link.platform));
}
