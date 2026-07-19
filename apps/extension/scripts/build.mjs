import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { build, context } from "esbuild";

const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "dist");
const watch = process.argv.includes("--watch");

await rm(output, { recursive: true, force: true });
await mkdir(resolve(output, "popup"), { recursive: true });
await Promise.all([
  cp(resolve(root, "manifest.json"), resolve(output, "manifest.json")),
  cp(resolve(root, "src/popup/index.html"), resolve(output, "popup/index.html")),
  cp(resolve(root, "src/popup/popup.css"), resolve(output, "popup/popup.css")),
]);

const options = {
  entryPoints: {
    background: resolve(root, "src/background.ts"),
    content: resolve(root, "src/content.ts"),
    "page-bridge": resolve(root, "src/page-bridge.ts"),
    "popup/popup": resolve(root, "src/popup/popup.ts"),
  },
  bundle: true,
  format: "esm",
  outdir: output,
  target: "chrome120",
  sourcemap: false,
  minify: false,
};

if (watch) {
  const buildContext = await context(options);
  await buildContext.watch();
  console.log(`正在监听扩展源码：${output}`);
} else {
  await build(options);
  console.log(`扩展已构建：${output}`);
}
