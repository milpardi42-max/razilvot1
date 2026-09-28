import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

/**
 * تضمین نمایش مدیا بدون فیلترشکن — تست رفتاری و ساختاری.
 *
 * سه چیز باید ثابت بمانند:
 *   ۱. آپلودها پیش‌فرض روی دامنه‌ی خودمان ذخیره می‌شوند (Cloudinary/Vercel Blob
 *      فقط با پرچم صریح `MEDIA_ALLOW_FOREIGN_CDN=1`، چون در ایران بدون
 *      فیلترشکن باز نمی‌شوند).
 *   ۲. هر آدرس خارجی از مسیر هم‌دامنه‌ی `/api/media/remote` سرو می‌شود و اگر
 *      شکست بخورد، به تصویر جانشین برند ریدایرکت می‌شود — نه تصویر شکسته.
 *   ۳. فونت اسناد چاپی ادمین دیگر از `fonts.googleapis.com` نمی‌آید.
 */

const require = createRequire(import.meta.url);
const ts = require('typescript');

/** یک ماژول TS خالص را ترنسپایل و در Node اجرا می‌کند. */
function loadTs(relativePath) {
  const source = fs.readFileSync(relativePath, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
    },
  });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ra-media-'));
  const file = path.join(dir, `${path.basename(relativePath, '.ts')}.cjs`);
  fs.writeFileSync(file, outputText);
  return require(file);
}

/** سورس بدون کامنت — برای تست‌های ساختاری. */
function readSource(relativePath) {
  return fs
    .readFileSync(relativePath, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
}


/** ترنسپایل یک ماژول به همراه وابستگی‌های نسبی‌اش در یک پوشه‌ی موقت. */
function loadTsTree(entryRelative, deps) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ra-media-tree-'));
  const options = {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    esModuleInterop: true,
    allowSyntheticDefaultImports: true,
  };
  for (const rel of [entryRelative, ...deps]) {
    const source = fs.readFileSync(rel, 'utf8');
    const { outputText } = ts.transpileModule(source, { compilerOptions: options });
    fs.writeFileSync(path.join(dir, `${path.basename(rel, '.ts')}.cjs`), outputText);
  }
  const entry = path.join(dir, `${path.basename(entryRelative, '.ts')}.cjs`);
  // rewrite extensionless relative requires to the .cjs siblings
  fs.writeFileSync(entry, fs.readFileSync(entry, 'utf8').replace(/require\("\.\/([\w.-]+)"\)/g, 'require("./$1.cjs")'));
  return require(entry);
}

const url = loadTs('src/lib/media/url.ts');
const guard = loadTs('src/lib/media/guard.ts');
const range = loadTs('src/lib/media/range.ts');

/* ────────────────────────── آدرس مدیا ────────────────────────── */

test('external media URLs are rescued through the same-origin proxy', () => {
  const cloudinary = 'https://res.cloudinary.com/rozadi/image/upload/v1/old.jpg';
  const proxied = url.resolveMediaSrc(cloudinary);
  assert.match(proxied, /^\/api\/media\/remote\?src=/);
  assert.ok(proxied.includes(encodeURIComponent(cloudinary)));
  assert.ok(proxied.startsWith('/api/media/remote?'), 'the browser must only ever call our own domain');
  assert.ok(proxied.endsWith('&kind=image'));
});

test('videos keep their kind so the proxy returns a playable response', () => {
  const proxied = url.resolveMediaSrc('https://blob.vercel-storage.com/academy/lesson.mp4', { kind: 'video' });
  assert.ok(proxied.includes('kind=video'));
});

test('local and self-hosted sources pass through untouched', () => {
  for (const src of ['/images/media/placeholder.png', '/videos/academy/preview.mp4', '/api/media/uploads/a-b.jpg']) {
    assert.equal(url.resolveMediaSrc(src), src);
  }
});

test('missing or unusable sources fall back to the branded placeholder', () => {
  assert.equal(url.resolveMediaSrc(undefined), url.MEDIA_PLACEHOLDER_IMAGE);
  assert.equal(url.resolveMediaSrc(''), url.MEDIA_PLACEHOLDER_IMAGE);
  assert.equal(url.resolveMediaSrc('   '), url.MEDIA_PLACEHOLDER_IMAGE);
  assert.equal(url.resolveMediaSrc(null, { kind: 'video' }), url.MEDIA_PLACEHOLDER_VIDEO);
});

test('self-hosted responses skip the next/image optimizer (they are already served by us)', () => {
  assert.equal(url.needsUnoptimized('/api/media/uploads/a.jpg'), true);
  assert.equal(url.needsUnoptimized('/api/media/remote?src=x&kind=image'), true);
  assert.equal(url.needsUnoptimized('/images/hero/hero-bg-01.jpg'), false);
});

test('branded placeholders exist on disk', () => {
  for (const file of ['public/images/media/placeholder.png', 'public/images/media/placeholder-video.png', 'public/images/artists/placeholder.jpg', 'public/images/artists/cover-placeholder.jpg']) {
    assert.ok(fs.existsSync(file), `${file} must ship with the repo`);
  }
});

/* ────────────────────────── محافظ SSRF ────────────────────────── */

test('private and link-local addresses are refused', () => {
  for (const ip of ['127.0.0.1', '10.0.0.5', '172.16.0.1', '172.31.255.255', '192.168.1.10', '169.254.169.254', '100.64.0.1', '::1', 'fe80::1', 'fd00::1']) {
    assert.equal(guard.isPrivateAddress(ip), true, `${ip} must be treated as private`);
  }
  for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '185.55.226.26', '2606:4700::1111']) {
    assert.equal(guard.isPrivateAddress(ip), false, `${ip} must be treated as public`);
  }
});

test('the rescue route refuses non-http, credentialed and odd-port URLs', async () => {
  await assert.rejects(() => guard.assertPublicUrl('ftp://example.com/file.jpg'));
  await assert.rejects(() => guard.assertPublicUrl('file:///etc/passwd'));
  await assert.rejects(() => guard.assertPublicUrl('http://user:pass@example.com/a.jpg'));
  await assert.rejects(() => guard.assertPublicUrl('http://example.com:8080/a.jpg'));
  await assert.rejects(() => guard.assertPublicUrl('http://localhost/a.jpg'));
  await assert.rejects(() => guard.assertPublicUrl('http://internal.local/a.jpg'));
  await assert.rejects(() => guard.assertPublicUrl('http://127.0.0.1/a.jpg'));
});

test('public IP literals are accepted without any lookup', async () => {
  const parsed = await guard.assertPublicUrl('https://185.55.226.26/img/a.jpg');
  assert.equal(parsed.hostname, '185.55.226.26');
});

/* ────────────────────────── Range / پخش ویدیو ────────────────────────── */

test('range parsing covers open, closed and suffix forms', () => {
  assert.deepEqual(range.parseRange('bytes=0-499', 1000), { start: 0, end: 499 });
  assert.deepEqual(range.parseRange('bytes=500-', 1000), { start: 500, end: 999 });
  assert.deepEqual(range.parseRange('bytes=-200', 1000), { start: 800, end: 999 });
  assert.deepEqual(range.parseRange('bytes=990-2000', 1000), { start: 990, end: 999 });
  assert.equal(range.parseRange(null, 1000), null);
  assert.equal(range.parseRange('bytes=-', 1000), null);
});

/* ────────────────────────── تست‌های ساختاری ────────────────────────── */

test('uploads default to our own store; foreign CDNs need an explicit opt-in', () => {
  const artist = readSource('src/app/api/artist/upload/route.ts');
  const academy = readSource('src/app/api/admin/academy/upload-video/route.ts');

  for (const source of [artist, academy]) {
    assert.match(source, /putMedia\(/, 'the own-domain media store must be wired in');
    assert.match(source, /foreignCdnAllowed\(\)/, 'foreign CDNs must be gated');
    assert.ok(
      !/else if \(process\.env\.BLOB_READ_WRITE_TOKEN\)/.test(source),
      'Vercel Blob must not be reachable as a plain fallback',
    );
  }

  const store = readSource('src/lib/media/store.ts');
  assert.match(store, /MEDIA_ALLOW_FOREIGN_CDN/, 'foreign CDNs must be off by default');
  assert.match(store, /path\.join\(process\.cwd\(\), "data", "media"\)/, 'uploads live in data/media so builds keep them');
  assert.ok(!/public[\\/"]?,\s*"images",\s*"uploads"/.test(store), 'uploads must not land in public/ where builds wipe them');
});

test('phone-friendly video responses: the media route supports ranges and long caching', () => {
  const route = readSource('src/app/api/media/[...key]/route.ts');
  assert.match(route, /serveMediaKey\(/);
  const serve = readSource('src/lib/media/serve.ts');
  assert.match(serve, /206/, 'partial responses are required for video seeking');
  assert.match(serve, /content-range/i);
  assert.match(serve, /accept-ranges/i);
  assert.match(serve, /immutable/);
});

test('images can never break: wrappers exist and are used site-wide', () => {
  const safeImage = readSource('src/components/media/SafeImage.tsx');
  assert.match(safeImage, /MEDIA_PLACEHOLDER_IMAGE/);
  assert.match(safeImage, /resolveMediaSrc/);

  for (const file of ['src/components/media/SafeImg.tsx', 'src/components/media/SafeVideo.tsx']) {
    assert.ok(fs.existsSync(file), `${file} exists`);
  }

  const consumers = [
    'src/components/home/Hero.tsx',
    'src/components/cards/ArtistCard.tsx',
    'src/components/academy/VideoGrid.tsx',
    'src/app/[locale]/academy/AcademyClient.tsx',
    'src/app/[locale]/portfolio/[slug]/page.tsx',
  ];
  const dead = consumers.filter((file) => !fs.readFileSync(file, 'utf8').includes('@/components/media/Safe'));
  assert.deepEqual(dead, [], 'public media surfaces must use the safe wrappers');

  // هیچ کامپوننتی نباید مستقیم از next/image استفاده کند جز خود SafeImage
  const offenders = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.tsx') && !full.endsWith('SafeImage.tsx')) {
        if (/from "next\/image"/.test(fs.readFileSync(full, 'utf8'))) offenders.push(full);
      }
    }
  };
  walk('src');
  assert.deepEqual(offenders, [], 'import SafeImage instead of next/image');
});

test('admin exports no longer wait on Googles blocked font CDN', () => {
  const exporters = [
    'src/components/admin/ArtistsManager.tsx',
    'src/components/admin/ArtistsSignupManager.tsx',
    'src/components/admin/BuyersManager.tsx',
    'src/components/admin/UsersManager.tsx',
  ];
  for (const file of exporters) {
    const source = fs.readFileSync(file, 'utf8');
    assert.ok(!source.includes('fonts.googleapis.com'), `${file} must not call Google Fonts`);
    assert.match(source, /printFontFace\(\)/, `${file} must use the self-hosted face`);
  }

  assert.ok(fs.existsSync('public/fonts/vazirmatn/Vazirmatn-variable.woff2'), 'the Vazirmatn face must ship locally');

  const helper = readSource('src/lib/print-document.ts');
  assert.match(helper, /\/fonts\/vazirmatn\/Vazirmatn-variable\.woff2/);
  assert.match(helper, /\.fonts\?\.ready/, 'printing must wait for the local font');
  assert.ok(!/https?:\/\//.test(helper), 'the print document must not reference any external host');
});

test('the rescue route always answers with a usable image URL', () => {
  const route = readSource('src/app/api/media/remote/route.ts');
  assert.match(route, /rescueRemoteMedia\(/);
  const rescueSource = readSource('src/lib/media/rescue.ts');
  assert.match(rescueSource, /assertPublicUrl/, 'the rescue pipeline must run the SSRF guard by default');
  assert.match(route, /NextResponse\.redirect\(new URL\(fallback, request\.url\)/, 'failures redirect to the branded placeholder');
  assert.match(rescueSource, /VIDEO_MAX_BYTES/);
  assert.match(rescueSource, /IMAGE_MAX_BYTES/);
  assert.match(route, /stale-while-revalidate/, 'rescued files are cached with revalidation so a moved source self-heals');
});

/* ────────────────────────── نجات مدیای بیرونی ────────────────────────── */

test('the rescue pipeline downloads once, keeps it on our disk and enforces limits', async () => {
  const http = await import('node:http');
  const png = fs.readFileSync('public/images/media/placeholder.png');
  const clip = Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]); // tiny ftyp box

  const server = http.createServer((req, res) => {
    if (!req.url) return res.writeHead(400).end();
    if (req.url.startsWith('/img.png')) {
      res.writeHead(200, { 'content-type': 'image/png' });
      return res.end(png);
    }
    if (req.url.startsWith('/clip.mp4')) {
      res.writeHead(200, { 'content-type': 'video/mp4' });
      return res.end(clip);
    }
    if (req.url.startsWith('/page.html')) {
      res.writeHead(200, { 'content-type': 'text/html' });
      return res.end('<html>not an image</html>');
    }
    if (req.url.startsWith('/redirect.png')) {
      res.writeHead(302, { location: '/img.png' });
      return res.end();
    }
    res.writeHead(404);
    return res.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  const rescue = loadTsTree('src/lib/media/rescue.ts', ['src/lib/media/guard.ts', 'src/lib/media/mime.ts']);
  const allowsLocalhost = async (raw) => new URL(raw); // تست: اجازه‌ی آدرس محلی

  const pristine = process.cwd();
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'ra-rescue-'));
  process.chdir(sandbox);
  try {
    const first = await rescue.rescueRemoteMedia({ src: `${base}/img.png`, kind: 'image', validate: allowsLocalhost });
    assert.equal(first.cached, false);
    assert.equal(first.type, 'image/png');
    assert.equal(first.bytes, png.length);
    assert.match(first.key, /^remote-cache\/[a-f0-9]{32}\.png$/);
    assert.ok(fs.existsSync(path.join(sandbox, 'data', 'media', first.key)), 'the file lands under data/media');

    const viaRedirect = await rescue.rescueRemoteMedia({ src: `${base}/redirect.png`, kind: 'image', validate: allowsLocalhost });
    assert.equal(viaRedirect.cached, false, 'a redirect is followed and cached too');

    const again = await rescue.rescueRemoteMedia({ src: `${base}/img.png`, kind: 'image', validate: allowsLocalhost });
    assert.equal(again.cached, true, 'the second request is served from our cache');
    assert.equal(again.key, first.key);

    const video = await rescue.rescueRemoteMedia({ src: `${base}/clip.mp4`, kind: 'video', validate: allowsLocalhost });
    assert.match(video.key, /\.mp4$/);
    assert.equal(video.type, 'video/mp4');

    await assert.rejects(
      // آدرس متفاوت تا کش رد شود و سقف حجم واقعاً تست شود
      () => rescue.rescueRemoteMedia({ src: `${base}/img.png?oversize=1`, kind: 'image', validate: allowsLocalhost, maxBytes: 1024 }),
      /too_large/,
    );
    await assert.rejects(
      () => rescue.rescueRemoteMedia({ src: `${base}/page.html`, kind: 'image', validate: allowsLocalhost }),
      /bad_content_type/,
    );
    await assert.rejects(
      () => rescue.rescueRemoteMedia({ src: `${base}/missing.png`, kind: 'image', validate: allowsLocalhost }),
      /upstream_failed/,
    );

    const leftovers = fs.readdirSync(path.join(sandbox, 'data', 'media', 'remote-cache')).filter((name) => name.endsWith('.part'));
    assert.deepEqual(leftovers, [], 'failed downloads must not leave partial files');
  } finally {
    process.chdir(pristine);
    server.close();
  }
});
