import type { Metadata } from "next";
import "../../globals.css";
import { notFound } from "next/navigation";
import { AppProviders } from "@/components/providers/AppProviders";
import { LOCALES, type Locale } from "@/lib/i18n/types";

export const metadata: Metadata = {
  robots: { index: false },
};

export default async function AdminLocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  if (!LOCALES.includes(raw as Locale)) notFound();
  const locale = raw as Locale;

  /*
   * This segment must NOT render <html>, <head> or <body>: the root layout
   * (`src/app/layout.tsx`) already owns them for the whole app. Rendering a
   * second nested shell made the browser drop the duplicated tags, which broke
   * hydration for everything below it (theme script + body class), and the admin
   * looked like it had two different themes fighting each other.
   *
   * The admin shell is still RTL + the grey admin background, and the shared
   * theme script lives in the root <head>. The always-RTL wrapper below keeps the
   * admin identical in RTL even when the visitor chose /en.
   */
  return (
    <div lang="fa" dir="rtl" className="admin-shell min-h-dvh">
      <AppProviders locale={locale}>{children}</AppProviders>
    </div>
  );
}
