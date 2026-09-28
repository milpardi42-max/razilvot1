import type { Metadata } from "next";
import "./globals.css";
import { ADMIN_SHELL_BOOTSTRAP, THEME_BOOTSTRAP } from "@/lib/theme-script";
import { dirOf, type Locale } from "@/lib/i18n/types";

export const metadata: Metadata = {
  title: "Rosie Atelier",
  description: "Pattern, design, creativity and lifestyle.",
};

export default async function RootLayout({
  children,
  params,
}: Readonly<{ children: React.ReactNode; params: Promise<{ locale?: string }> }>) {
  const { locale } = await params;
  const lang = (locale as Locale) ?? "fa";
  const dir = dirOf(lang);

  return (
    /*
     * The root layout owns the only <html>/<head>/<body> in the tree. `app/admin/[locale]/layout.tsx`
     * used to render a second, nested set — the browser silently drops nested <html>/<head>/<body>
     * tags, so the server tree stopped matching the client one and React threw
     * "a tree hydrated but some attributes of the server rendered HTML didn't match"
     * (the theme <script> and the admin <body> class were the visible symptoms).
     */
    <html lang={lang} dir={dir} suppressHydrationWarning>
      <head>
        {/* Order matters: the admin bootstrap must run after the theme bootstrap so it can
            override a saved dark theme on /admin/* routes. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} suppressHydrationWarning />
        <script dangerouslySetInnerHTML={{ __html: ADMIN_SHELL_BOOTSTRAP }} suppressHydrationWarning />
      </head>
      <body className="min-h-dvh flex flex-col" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}