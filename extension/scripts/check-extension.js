import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const extensionRoot = new URL("../", import.meta.url);
const roots = ["src", "scripts"];
const files = [];

for (const root of roots) await collectJavaScript(new URL(`${root}/`, extensionRoot), files);

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.exit(result.status || 1);
  }
}

console.log(`Syntax check passed for ${files.length} JavaScript files.`);

async function collectJavaScript(directoryUrl, output) {
  const entries = await readdir(directoryUrl, { withFileTypes: true });
  for (const entry of entries) {
    const entryUrl = new URL(entry.name, directoryUrl);
    if (entry.isDirectory()) await collectJavaScript(new URL(`${entry.name}/`, directoryUrl), output);
    else if (entry.name.endsWith(".js") && entry.name !== "check-extension.js") output.push(fileURLToPath(entryUrl));
  }
}
