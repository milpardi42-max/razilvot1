"use client";

import { Mail, Phone } from "lucide-react";
import type { CSSProperties } from "react";
import { BRAND_ICONS } from "@/components/icons/BrandIcons";
import { useLocale } from "@/components/providers/AppProviders";
import { SOCIAL_PLATFORMS, socialLabel, visibleSocials } from "@/lib/socials";
import type { SocialLink } from "@/lib/types";
import { cn } from "@/lib/utils";

type Size = "sm" | "md";

const SIZES: Record<Size, { button: string; icon: string }> = {
  sm: { button: "h-9 w-9", icon: "h-4 w-4" },
  md: { button: "h-11 w-11", icon: "h-[18px] w-[18px]" },
};

/**
 * ردیف آیکون‌های شبکه‌های اجتماعی.
 *
 * در فوتر (کنار برند) و در صفحه‌ی تماس استفاده می‌شود؛ فهرست از تنظیمات ادمین
 * («شبکه‌های اجتماعی») می‌آید و اگر خالی باشد به `defaultSocials` برمی‌گردد.
 * هر آیکون در hover رنگ برند خودش را می‌گیرد.
 */
export function SocialLinks({
  socials,
  size = "md",
  className,
  showLabels = false,
}: {
  socials?: SocialLink[];
  size?: Size;
  className?: string;
  showLabels?: boolean;
}) {
  const { locale } = useLocale();
  const links = visibleSocials(socials);
  if (links.length === 0) return null;
  const dims = SIZES[size];

  return (
    <ul
      className={cn("flex flex-wrap items-center gap-2", showLabels && "gap-x-3 gap-y-2", className)}
      aria-label={locale === "fa" ? "شبکه‌های اجتماعی" : "Social media"}
    >
      {links.map((link) => {
        const label = socialLabel(link, locale);
        const color = SOCIAL_PLATFORMS[link.platform]?.color ?? "var(--accent)";
        const Icon = BRAND_ICONS[link.platform as keyof typeof BRAND_ICONS];
        const isExternal = /^https?:/i.test(link.href);

        const inner = (
          <>
            <span className="sr-only">{label}</span>
            {link.platform === "email" ? (
              <Mail className={cn(dims.icon, "shrink-0")} aria-hidden />
            ) : link.platform === "phone" ? (
              <Phone className={cn(dims.icon, "shrink-0")} aria-hidden />
            ) : Icon ? (
              <Icon className={cn(dims.icon, "shrink-0")} />
            ) : (
              <Mail className={cn(dims.icon, "shrink-0")} aria-hidden />
            )}
            {showLabels && <span className="text-sm">{label}</span>}
          </>
        );

        const classes = cn(
          "group/social flex items-center justify-center gap-2 border border-border text-foreground-secondary outline-none transition-[color,border-color,transform,box-shadow,background-color] duration-200",
          "hover:-translate-y-0.5 hover:border-[var(--social-color)] hover:text-[var(--social-color)] hover:shadow-soft",
          "focus-visible:ring-2 focus-visible:ring-accent/50",
          showLabels
            ? "h-10 rounded-full px-4"
            : cn("rounded-full glass", dims.button),
        );

        const style = { "--social-color": color } as CSSProperties;

        return (
          <li key={link.id} className="flex">
            {isExternal ? (
              <a
                href={link.href}
                target="_blank"
                rel="noreferrer noopener me"
                className={classes}
                style={style}
                title={label}
              >
                {inner}
              </a>
            ) : (
              <a href={link.href} className={classes} style={style} title={label}>
                {inner}
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );
}
