const origin = process.env.SMOKE_ORIGIN ?? "http://localhost:3000";
const routes = [["/fa", 200], ["/en", 200], ["/fa/portfolio", 200], ["/fa/artists", 200], ["/api/auth/me", 200], ["/api/admin/stats", 401]];
let failed = false;
for (const [path, expected] of routes) {
  try {
    const response = await fetch(new URL(path, origin), { signal: AbortSignal.timeout(180_000) });
    const body = await response.text();
    const ok = response.status === expected && !/Expected workUnitAsyncStorage to have a store|InvariantError|"__NEXT_ERROR_CODE":"E696"/.test(body);
    console.log(`${ok ? "PASS" : "FAIL"} ${path}: HTTP ${response.status} (expected ${expected})`);
    if (!ok) failed = true;
  } catch (error) {
    console.error(`FAIL ${path}: ${error.message}`);
    failed = true;
  }
}
if (failed) {
  console.error("Smoke test failed. Share these results and the Next terminal stack trace; do not bypass request-store/authentication checks.");
  process.exitCode = 1;
} else console.log("HTTP checks passed in this runtime. Browser hydration/playback and native upload processing are separate checks.");
