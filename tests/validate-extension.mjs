import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const manifest = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8"));

assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.name, "Handshake Message Triage Assistant");
assert.equal(manifest.background.type, "module");
assert.ok(manifest.content_scripts[0].matches.some((match) => match.includes("joinhandshake.com")));
assert.ok(manifest.permissions.includes("storage"));

const referencedFiles = new Set([
  manifest.action?.default_popup,
  manifest.background?.service_worker,
  ...(manifest.content_scripts || []).flatMap((entry) => [...(entry.js || []), ...(entry.css || [])])
].filter(Boolean));

for (const filePath of referencedFiles) {
  const fileUrl = new URL(`../${filePath}`, import.meta.url);
  await access(fileUrl);
  const content = await readFile(fileUrl, "utf8");
  assert.ok(content.length > 0, `${filePath} should not be empty`);
}

console.log("extension validation passed");
