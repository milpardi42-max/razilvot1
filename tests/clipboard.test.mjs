import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

/**
 * کپی کلیپ‌بورد — تست رفتاری.
 *
 * `src/lib/clipboard.ts` با TypeScript API ترنسپایل و در Node اجرا می‌شود تا ثابت شود
 * وقتی مرورگر `navigator.clipboard.writeText` را با `NotAllowedError` رد می‌کند
 * (سند داخل iframe بدون مجوز clipboard-write)، هیچ استثنای مدیریت‌نشده‌ای بیرون
 * نمی‌زند و به مسیر جایگزین (textarea + execCommand) می‌رود.
 */

const require = createRequire(import.meta.url);
const ts = require('typescript');

/** ماژول را ترنسپایل و در یک فایل موقت CJS می‌نویسد. */
function loadClipboardModule() {
  const source = fs.readFileSync('src/lib/clipboard.ts', 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ra-clipboard-'));
  const file = path.join(dir, 'clipboard.cjs');
  fs.writeFileSync(file, outputText);
  return require(file);
}

/** پنجره‌ی جعلی مرورگر برای ماژول. */
function define(key, value) {
  // Node 22 ships a getter-only `navigator` global, so plain assignment throws.
  Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
}

function stubBrowser({ writeText, permissions = 'granted', execCommand = true }) {
  const execCalls = [];
  define('window', { isSecureContext: true });
  define('navigator', {
    ...(writeText ? { clipboard: { writeText } } : {}),
    permissions: { query: async () => ({ state: permissions }) },
  });
  define('document', {
    getSelection: () => null,
    execCommand: (cmd) => {
      execCalls.push(cmd);
      return execCommand;
    },
    createElement: () => ({
      style: {},
      setAttribute() {},
      focus() {},
      select() {},
      setSelectionRange() {},
      remove() {},
    }),
    body: { appendChild() {} },
  });
  return execCalls;
}

function resetGlobals() {
  for (const key of ['window', 'navigator', 'document']) {
    Object.defineProperty(globalThis, key, { value: undefined, configurable: true, writable: true });
  }
}

test('a NotAllowedError from the async clipboard falls back instead of throwing', async () => {
  const { copyText } = loadClipboardModule();
  const calls = stubBrowser({
    writeText: async () => {
      const error = new Error('The Clipboard API has been blocked because of a permissions policy');
      error.name = 'NotAllowedError';
      throw error;
    },
    execCommand: true,
  });

  await assert.doesNotReject(() => copyText('https://example.com'), 'copyText must never reject');
  assert.equal(await copyText('https://example.com'), true, 'legacy execCommand path succeeds');
  assert.deepEqual(calls, ['copy', 'copy']);
  resetGlobals();
});

test('returns false (never throws) when every strategy is blocked', async () => {
  const { copyText } = loadClipboardModule();
  stubBrowser({ writeText: undefined, permissions: 'denied', execCommand: false });

  const result = await copyText('blocked text');
  assert.equal(result, false, 'a blocked clipboard is reported, not swallowed as success');
  resetGlobals();
});

test('skips the async clipboard entirely when the permission is already denied', async () => {
  const { copyText } = loadClipboardModule();
  let asyncAttempts = 0;
  const calls = stubBrowser({
    writeText: async () => {
      asyncAttempts += 1;
    },
    permissions: 'denied',
    execCommand: true,
  });

  assert.equal(await copyText('text'), true);
  assert.equal(asyncAttempts, 0, 'no console-noisy attempt is made when Permissions API says denied');
  assert.deepEqual(calls, ['copy']);
  resetGlobals();
});

test('uses the async clipboard when it is available and allowed', async () => {
  const { copyText } = loadClipboardModule();
  const written = [];
  const calls = stubBrowser({ writeText: async (text) => written.push(text), permissions: 'granted' });

  assert.equal(await copyText('hello clipboard'), true);
  assert.deepEqual(written, ['hello clipboard']);
  assert.deepEqual(calls, [], 'no execCommand fallback needed');
  resetGlobals();
});

test('no component reaches for navigator.clipboard directly any more', () => {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full);
    }
  };
  walk('src');

  const offenders = files.filter((file) => {
    if (file === path.join('src', 'lib', 'clipboard.ts')) return false;
    const code = fs
      .readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '') // block comments
      .replace(/(^|[^:])\/\/.*$/gm, '$1'); // line comments (keep https:// intact)
    return /navigator\.clipboard/.test(code);
  });
  assert.deepEqual(offenders, [], 'clipboard access must go through src/lib/clipboard.ts');
});

test('every copy button reports failure honestly through CopyButton/useCopy', () => {
  const copyButton = fs.readFileSync('src/components/ui/CopyButton.tsx', 'utf8');
  assert.match(copyButton, /useCopy/);
  assert.match(copyButton, /state === "failed"/);
  assert.match(copyButton, /showManualField/, 'offers manual copy when the browser blocks it');

  for (const file of [
    'src/components/marketplace/MyLicenses.tsx',
    'src/components/marketplace/ArtistStudio.tsx',
    'src/components/admin/AcademyManager.tsx',
    'src/components/admin/WebinarAttendeesPanel.tsx',
  ]) {
    assert.match(fs.readFileSync(file, 'utf8'), /<CopyButton/, file);
  }
  assert.match(fs.readFileSync('src/components/portfolio/ShareButtons.tsx', 'utf8'), /copyText/);
});
