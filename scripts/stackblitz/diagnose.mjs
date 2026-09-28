import { AsyncLocalStorage } from "node:async_hooks";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

/** Concurrent probes: success in a single request alone can hide context leaks. */
export async function diagnose() {
  const request = new AsyncLocalStorage();
  const render = new AsyncLocalStorage();
  const failures = new Set();
  const check = (label, id) => {
    if (request.getStore() !== id || render.getStore() !== `render-${id}`) failures.add(label);
  };
  await Promise.all(Array.from({ length: 12 }, (_, id) => request.run(id, () => render.run(`render-${id}`, async () => {
    check("nested.run", id);
    await Promise.resolve();
    check("promise/await", id);
    const tasks = [
      ["queueMicrotask", queueMicrotask],
      ["nextTick", process.nextTick],
      ["setImmediate", setImmediate],
      ["setTimeout", callback => setTimeout(callback, id % 3)],
    ];
    await Promise.all(tasks.map(([label, schedule]) => new Promise(resolve => {
      schedule(() => { check(label, id); resolve(); });
    })));
    check("Promise.all", id);
    await readFile(fileURLToPath(import.meta.url));
    check("fs.readFile", id);
    const snapshot = AsyncLocalStorage.snapshot();
    request.run("other", () => snapshot(() => check("snapshot", id)));
  }))));
  if (request.getStore() !== undefined || render.getStore() !== undefined) failures.add("outside-request-isolation");
  return [...failures];
}

export async function report() {
  const failures = await diagnose();
  console.log(`[StackBlitz check] Node ${process.version}; Next is not running yet.`);
  if (failures.length) {
    console.error(`[StackBlitz check] Async context failed: ${failures.join(", ")}`);
    console.error("This runtime cannot safely preserve concurrent request context. Use the Node.js preview or GitHub Codespaces; do not disable Next's request-store checks.");
    return false;
  }
  console.log("[StackBlitz check] Async context/isolation probes passed. This is not a complete Next.js compatibility guarantee.");
  return true;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  if (!await report()) process.exitCode = 1;
}
