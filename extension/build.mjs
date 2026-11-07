import { build } from "esbuild";
import { copyFile, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, "dist");

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

await build({
  entryPoints: ["background", "content", "main-world"].map((name) => join(root, "src", `${name}.ts`)),
  outdir: dist,
  bundle: true,
  format: "iife",
  target: "chrome120",
  logLevel: "warning",
});

await copyFile(join(root, "manifest.json"), join(dist, "manifest.json"));

// Real credentials live in the git-ignored config.local.json; otherwise ship the deliberately wrong example.
const localConfig = join(root, "config.local.json");
const configSource = existsSync(localConfig) ? localConfig : join(root, "config.example.json");
await copyFile(configSource, join(dist, "config.json"));

console.log(`Built extension to ${dist} using ${configSource.endsWith("local.json") ? "config.local.json" : "config.example.json (deliberately wrong)"}`);
