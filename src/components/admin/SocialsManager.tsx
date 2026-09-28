"use client";

import { ArrowDown, ArrowUp, Eye, EyeOff, Plus, RotateCcw, Share2, Trash2 } from "lucide-react";
import { useCallback } from "react";
import { SocialLinks } from "@/components/layout/SocialLinks";
import { SOCIAL_PLATFORM_ORDER, SOCIAL_PLATFORMS, defaultSocials, socialLabel } from "@/lib/socials";
import type { SocialLink, SocialPlatform } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * «شبکه‌های اجتماعی» در پنل ادمین — همان ردیفی که در فوتر و صفحه‌ی تماس دیده
 * می‌شود. تغییرات با دکمه‌ی «ذخیره» بالای پنل روی `SiteContent.socials` می‌نشیند.
 */
export function SocialsManager({
  socials,
  onChange,
}: {
  socials: SocialLink[];
  onChange: (socials: SocialLink[]) => void;
}) {
  const list = socials.length > 0 ? socials : defaultSocials;

  const patch = useCallback(
    (id: string, changes: Partial<SocialLink>) => {
      onChange(list.map((link) => (link.id === id ? { ...link, ...changes } : link)));
    },
    [list, onChange],
  );

  const move = useCallback(
    (index: number, direction: -1 | 1) => {
      const next = [...list];
      const target = index + direction;
      if (target < 0 || target >= next.length) return;
      [next[index], next[target]] = [next[target]!, next[index]!];
      onChange(next);
    },
    [list, onChange],
  );

  const add = useCallback(() => {
    const used = new Set(list.map((link) => link.platform));
    const platform = SOCIAL_PLATFORM_ORDER.find((item) => !used.has(item)) ?? "instagram";
    onChange([
      ...list,
      {
        id: `social-${Date.now().toString(36)}`,
        platform,
        href: SOCIAL_PLATFORMS[platform].placeholder,
        enabled: true,
      },
    ]);
  }, [list, onChange]);

  const remove = useCallback(
    (id: string) => onChange(list.filter((link) => link.id !== id)),
    [list, onChange],
  );

  const visible = list.filter((link) => link.enabled !== false).length;

  return (
    <div className="space-y-6" dir="rtl">
      {/* سرتیتر */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <Share2 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-gray-900">شبکه‌های اجتماعی</h1>
            <p className="text-xs text-gray-400">
              ردیف آیکون‌های فوتر و صفحه‌ی تماس · {visible} آیکون فعال
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onChange(defaultSocials.map((link) => ({ ...link })))}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-xs text-gray-600 transition-colors hover:bg-gray-50"
          >
            <RotateCcw className="h-3.5 w-3.5" /> بازگردانی پیش‌فرض
          </button>
          <button
            type="button"
            onClick={add}
            className="flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-medium text-white transition-colors hover:bg-accent-hover"
          >
            <Plus className="h-3.5 w-3.5" /> افزودن
          </button>
        </div>
      </div>

      {/* پیش‌نمایش زنده */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-400">پیش‌نمایش</p>
        <SocialLinks socials={list} size="md" />
        <p className="mt-3 text-[11px] text-gray-400">
          آیکون در حالت hover رنگ برند خودش را می‌گیرد. اگر فهرست خالی باشد، ردیف پیش‌فرض نمایش داده می‌شود.
        </p>
      </section>

      {/* فهرست */}
      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <div className="grid grid-cols-12 gap-3 border-b border-gray-100 bg-gray-50 px-4 py-3 text-[11px] font-semibold text-gray-500">
          <span className="col-span-12 sm:col-span-3">شبکه</span>
          <span className="col-span-12 sm:col-span-5">آدرس</span>
          <span className="col-span-12 sm:col-span-2">برچسب دلخواه</span>
          <span className="col-span-12 sm:col-span-2 text-center">وضعیت</span>
        </div>

        <div className="divide-y divide-gray-100">
          {list.map((link, index) => (
            <div key={link.id} className="grid grid-cols-12 items-center gap-3 px-4 py-3">
              <div className="col-span-12 sm:col-span-3">
                <select
                  value={link.platform}
                  onChange={(event) => patch(link.id, { platform: event.target.value as SocialPlatform })}
                  className="h-10 w-full rounded-lg border border-gray-200 bg-white px-2.5 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/10"
                >
                  {SOCIAL_PLATFORM_ORDER.map((platform) => (
                    <option key={platform} value={platform}>
                      {SOCIAL_PLATFORMS[platform].label.fa} — {SOCIAL_PLATFORMS[platform].label.en}
                    </option>
                  ))}
                </select>
              </div>

              <div className="col-span-12 sm:col-span-5">
                <input
                  value={link.href}
                  onChange={(event) => patch(link.id, { href: event.target.value })}
                  dir="ltr"
                  placeholder={SOCIAL_PLATFORMS[link.platform].placeholder}
                  className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/10"
                />
                <p className="mt-1 truncate text-[10px] text-gray-400" dir="rtl">
                  نمایش در سایت: {socialLabel(link, "fa")} / {socialLabel(link, "en")}
                </p>
              </div>

              <div className="col-span-12 flex gap-2 sm:col-span-2">
                <input
                  value={link.label?.fa ?? ""}
                  onChange={(event) => patch(link.id, { label: { fa: event.target.value, en: link.label?.en ?? "" } })}
                  placeholder="فارسی"
                  className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/10"
                />
                <input
                  value={link.label?.en ?? ""}
                  onChange={(event) => patch(link.id, { label: { fa: link.label?.fa ?? "", en: event.target.value } })}
                  placeholder="EN"
                  dir="ltr"
                  className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/10"
                />
              </div>

              <div className="col-span-12 flex items-center justify-end gap-1.5 sm:col-span-2">
                <button
                  type="button"
                  onClick={() => patch(link.id, { enabled: link.enabled === false })}
                  title={link.enabled === false ? "نمایش در سایت" : "پنهان کردن"}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-lg border transition-colors",
                    link.enabled === false
                      ? "border-gray-200 bg-white text-gray-400 hover:text-gray-600"
                      : "border-emerald-200 bg-emerald-50 text-emerald-600",
                  )}
                >
                  {link.enabled === false ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  title="جابه‌جایی به بالا"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-400 transition-colors hover:text-gray-600 disabled:opacity-40"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={index === list.length - 1}
                  title="جابه‌جایی به پایین"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-400 transition-colors hover:text-gray-600 disabled:opacity-40"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => remove(link.id)}
                  title="حذف"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-400 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}

          {list.length === 0 && (
            <p className="px-4 py-12 text-center text-sm text-gray-400">
              فهرستی ثبت نشده — با «افزودن» یک شبکه اضافه کنید یا پیش‌فرض‌ها را بازگردانید.
            </p>
          )}
        </div>
      </section>

      <p className="text-xs text-gray-400">
        برای ذخیره‌ی تغییرات، دکمه‌ی «ذخیره» را در نوار بالای پنل بزنید. همین ردیف در صفحه‌ی «تماس» هم نمایش داده می‌شود.
      </p>
    </div>
  );
}
