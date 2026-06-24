import { copyFile, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const extensionRoot = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const distDir = join(extensionRoot, "dist");

const filesToCopy = [
  ["public/manifest.json", "manifest.json"],
  ["src/popup/popup.html", "popup/popup.html"],
  ["src/popup/popup.css", "popup/popup.css"],
  ["src/popup/popup.js", "popup/popup.js"],
  ["src/content/banglaDictionary.js", "content/banglaDictionary.js"],
  ["src/content/domTranslator.js", "content/domTranslator.js"],
  ["src/content/contentScript.js", "content/contentScript.js"]
];

await rm(distDir, { recursive: true, force: true });

for (const [source, destination] of filesToCopy) {
  const sourcePath = join(extensionRoot, source);
  const destinationPath = join(distDir, destination);

  await mkdir(dirname(destinationPath), { recursive: true });
  await copyFile(sourcePath, destinationPath);
}

console.log(`Extension build created at ${distDir}`);
