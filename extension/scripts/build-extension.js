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
  ["src/settings/settings.html", "settings/settings.html"],
  ["src/settings/settings.css", "settings/settings.css"],
  ["src/settings/settings.js", "settings/settings.js"],
  ["src/background/serviceWorker.js", "background/serviceWorker.js"],
  ["src/voice/offscreen.html", "voice/offscreen.html"],
  ["src/voice/offscreen.js", "voice/offscreen.js"],
  ["src/voice/microphone.html", "voice/microphone.html"],
  ["src/voice/microphone.js", "voice/microphone.js"],
  ["src/content/voiceNavigation.js", "content/voiceNavigation.js"],
  ["src/content/banglaDictionary.js", "content/banglaDictionary.js"],
  ["src/content/domTranslator.js", "content/domTranslator.js"],
  ["src/content/reasonCodes.js", "content/reasonCodes.js"],
  ["src/content/accessibilityCore.js", "content/accessibilityCore.js"],
  ["src/content/adaptationRegistry.js", "content/adaptationRegistry.js"],
  ["src/content/liveRegion.js", "content/liveRegion.js"],
  ["src/content/scanner.js", "content/scanner.js"],
  ["src/content/keyboardRepair.js", "content/keyboardRepair.js"],
  ["src/content/imageAssistant.js", "content/imageAssistant.js"],
  ["src/content/formAssistant.js", "content/formAssistant.js"],
  ["src/content/pageContextCollector.js", "content/pageContextCollector.js"],
  ["src/content/pageSummaryPlanner.js", "content/pageSummaryPlanner.js"],
  ["src/content/summaryAssistant.js", "content/summaryAssistant.js"],
  ["src/content/navigationModel.js", "content/navigationModel.js"],
  ["src/content/contentProtection.js", "content/contentProtection.js"],
  ["src/content/noiseClassifier.js", "content/noiseClassifier.js"],
  ["src/content/focusManager.js", "content/focusManager.js"],
  ["src/content/navigationAssistant.js", "content/navigationAssistant.js"],
  ["src/content/navigationShortcut.js", "content/navigationShortcut.js"],
  ["src/content/keybindings.js", "content/keybindings.js"],
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
