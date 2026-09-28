import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/** متن فایل بدون کامنت‌ها — تا توضیحاتِ داخل کد با تگ‌های واقعی اشتباه گرفته نشوند. */
function readSource(file) {
  return fs
    .readFileSync(file, 'utf8')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '') // JSX comments
    .replace(/\/\*[\s\S]*?\*\//g, '') // block comments
    .replace(/(^|[^:])\/\/.*$/gm, '$1'); // line comments (keeps https:// intact)
}

/**
 * پوسته‌ی سند (document shell) — تست رگرسیون برای خطای hydration.
 *
 * ریشه‌ی خطای «A tree hydrated but some attributes of the server rendered HTML didn't match»
 * این بود که `app/[locale]/layout.tsx` و `app/admin/[locale]/layout.tsx` هر دو
 * `<html>/<head>/<body>` خودشان را رندر می‌کردند و مرورگر نسخه‌ی تودرتو را دور می‌ریخت.
 * حالا فقط ریشه (`app/layout.tsx`) صاحب این تگ‌ها است و بقیه فقط محتوا رندر می‌کنند.
 */

test('the root layout owns exactly one html/head/body shell', () => {
  const root = readSource('src/app/layout.tsx');
  assert.equal((root.match(/<html/g) ?? []).length, 1);
  assert.equal((root.match(/<head>/g) ?? []).length, 1);
  assert.equal((root.match(/<body/g) ?? []).length, 1);
  assert.match(root, /__html: THEME_BOOTSTRAP/, 'theme bootstrap lives in the real <head>');
  assert.match(root, /__html: ADMIN_SHELL_BOOTSTRAP/);
});

test('no nested document shell outside the root layout', () => {
  const layouts = [
    'src/app/[locale]/layout.tsx',
    'src/app/admin/[locale]/layout.tsx',
  ];
  for (const file of layouts) {
    const source = readSource(file);
    assert.doesNotMatch(source, /<html[\s>]/, `${file} must not render <html>`);
    assert.doesNotMatch(source, /<body[\s>]/, `${file} must not render <body>`);
  }

  /*
   * `<head>` may only appear in the root layout. A nested <head> is not hoisted: the HTML
   * parser drops it, so React kept a node the DOM did not have — the locale layout used to
   * render one for the theme script + font preloads. React 19 hoists the preload <link>s on
   * its own, so neither nested layout needs a <head> at all.
   */
  for (const file of layouts) {
    const source = readSource(file);
    assert.equal((source.match(/<head[ >]/g) ?? []).length, 0, `${file} must not render <head>`);
  }

  // The font preloads must still reach the real <head> (React 19 link hoisting).
  const locale = readSource('src/app/[locale]/layout.tsx');
  assert.match(locale, /rel="preload"[\s\S]*?IRANSansWeb\.woff2/, 'Persian font preload kept');
  assert.match(locale, /instrument-serif-latin-400-normal\.woff2/, 'Latin font preload kept');
});

test('the theme bootstrap is defined once and shared', () => {
  const themeModule = readSource('src/lib/theme-script.ts');
  assert.match(themeModule, /export const THEME_BOOTSTRAP/);
  assert.match(themeModule, /export const ADMIN_SHELL_BOOTSTRAP/);
  assert.match(themeModule, /localStorage\.getItem\('ra-theme'\)/);

  // The admin bootstrap must run second so it can override a saved dark theme.
  const root = readSource('src/app/layout.tsx');
  const head = root.slice(root.indexOf('<head>'));
  assert.ok(
    head.indexOf('THEME_BOOTSTRAP') >= 0 &&
      head.indexOf('THEME_BOOTSTRAP') < head.indexOf('ADMIN_SHELL_BOOTSTRAP'),
    'admin bootstrap runs after the theme bootstrap',
  );
});

test('the admin keeps RTL, the Persian font and the grey shell without its own <body>', () => {
  const admin = fs.readFileSync('src/app/admin/[locale]/layout.tsx', 'utf8');
  assert.match(admin, /lang="fa" dir="rtl"/, 'always RTL, even when reached through /en');
  assert.match(admin, /admin-shell/, 'carries the admin-shell class');

  const css = fs.readFileSync('src/app/globals.css', 'utf8');
  assert.match(css, /html\.admin-shell\s*\{[\s\S]*?#f0f2f5/, 'grey admin background');
  assert.match(css, /html\.admin-shell body\s*\{[\s\S]*?font-family: var\(--font-fa\)/, 'Persian font for the admin');
  for (const utility of ['text-display', 'text-h1', 'text-h2', 'text-h3', 'text-label']) {
    assert.ok(
      css.includes(`html.admin-shell .${utility}`),
      `${utility} keeps its Persian typography override inside the admin`,
    );
  }
});
