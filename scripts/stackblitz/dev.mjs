import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const preload = fileURLToPath(new URL("./async-context.cjs", import.meta.url));
// NODE_OPTIONS is inherited by Next's forked development server and workers too.
const nodeOptions = `${process.env.NODE_OPTIONS ?? ""} --require ${JSON.stringify(preload)}`.trim();
const env = { ...process.env, ROSIE_STACKBLITZ: "1", NODE_ENV: "development", NODE_OPTIONS: nodeOptions };

function run(args) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, args, { env, stdio: "inherit" });
    const forward = signal => child.kill(signal);
    const onInt = () => forward("SIGINT");
    const onTerm = () => forward("SIGTERM");
    process.on("SIGINT", onInt); process.on("SIGTERM", onTerm);
    child.once("error", error => { console.error(error); resolve(1); });
    child.once("exit", (code, signal) => {
      process.removeListener("SIGINT", onInt); process.removeListener("SIGTERM", onTerm);
      resolve(code ?? (signal === "SIGINT" ? 130 : 1));
    });
  });
}

const check = await run([fileURLToPath(new URL("./diagnose.mjs", import.meta.url))]);
if (check !== 0) process.exitCode = check;
else {
  console.log("[StackBlitz] Starting Next with opt-in scheduler context binding. Keep the full log if E696 persists.");
  process.exitCode = await run([require.resolve("next/dist/bin/next"), "dev", "--hostname", "0.0.0.0", ...process.argv.slice(2)]);
}
