import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('studio portfolio uses its own media hero and retains its introduction and works', () => {
  const page = fs.readFileSync('src/app/[locale]/portfolio/page.tsx', 'utf8');
  assert.match(page, /<PortfolioHero\s/);
  assert.match(page, /<PortfolioIntro locale=\{locale\} \/>/);
  assert.match(page, /id="works"/);
  assert.doesNotMatch(page, /<PageHero\s/);
  assert.match(page, /artist-razieh-khairipour/);
});
test('hero media is available in the repository', () => {
  for (const file of ['public/images/hero/hero-back.webp', 'public/videos/academy/preview.mp4', 'public/images/portfolios/pf-process.jpg']) {
    assert.ok(fs.statSync(file).size > 0, file);
  }
});
test('hero player does not autoplay and has error feedback and native controls', () => {
  const player = fs.readFileSync('src/components/portfolio/PortfolioHeroVideo.tsx', 'utf8');
  assert.doesNotMatch(player, /\bautoPlay\b/);
  assert.match(player, /controls=\{/);
  assert.match(player, /playsInline/);
  assert.match(player, /role="alert"/);
  assert.match(player, /onError=/);
});
test('studio hero does not leak into artist portfolio routes', () => {
  for (const file of ['src/app/[locale]/artists/[slug]/portfolio/page.tsx', 'src/app/[locale]/artists/[slug]/portfolio/[workSlug]/page.tsx']) {
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /PortfolioHero|PortfolioIntro/);
  }
});

test('video preview card keeps its dimensions: the admin stretch is capped and never clips the frame', () => {
  const hero = fs.readFileSync('src/components/portfolio/PortfolioHero.tsx', 'utf8');
  const css = fs.readFileSync('src/app/globals.css', 'utf8');

  // The stretch is handed to CSS as a variable — no raw negative margin-left any more.
  assert.match(hero, /"--pf-video-pull"/);
  assert.doesNotMatch(hero, /marginLeft: `-\$\{/);
  assert.match(hero, /className="pf-video-card/);

  // …and the cap lives next to the other portfolio-hero rules.
  const rule = css.slice(css.indexOf('.pf-video-card'));
  assert.match(rule, /margin-inline-end:\s*calc\(-1 \* min\(var\(--pf-video-pull/);
  assert.match(rule, /min\(var\(--pf-video-pull[^)]*\),\s*clamp\(1rem, 4vw, 2\.5rem\)\)/);
  // Desktop only, so the card stays full width on phones and tablets.
  assert.match(css.slice(0, css.indexOf('.pf-video-card')), /@media \(min-width: 64rem\)[\s\S]*$/);
});

test('video preview keeps a fixed 16/9 frame so the poster, player and controls line up', () => {
  const player = fs.readFileSync('src/components/portfolio/PortfolioHeroVideo.tsx', 'utf8');
  assert.match(player, /relative aspect-video/);
  assert.match(player, /object-contain/);
  assert.match(player, /object-cover/);
});
