import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const distDir = resolve(root, "dist-upload");
const releaseDir = resolve(root, "release");
const packageDir = resolve(releaseDir, "linode-guard-lite-worker");
const zipPath = resolve(releaseDir, "linode-guard-lite-worker.zip");

await rm(packageDir, { recursive: true, force: true });
await rm(zipPath, { force: true });
await mkdir(packageDir, { recursive: true });

await copyFile(resolve(distDir, "index.js"), resolve(packageDir, "index.js"));
await copyFile(resolve(root, "schema.sql"), resolve(packageDir, "schema.sql"));
await copyFile(resolve(root, "wrangler.toml.example"), resolve(packageDir, "wrangler.toml.example"));
await copyFile(resolve(root, "secrets.example.md"), resolve(packageDir, "secrets.example.md"));
await copyFile(resolve(root, "docs", "deployment", "zip-upload.md"), resolve(packageDir, "DEPLOY-ZIP.md"));

await writeFile(resolve(packageDir, "README.txt"), [
  "Linode Guard Lite Cloudflare Worker upload package",
  "",
  "Upload index.js to Cloudflare Workers, then manually configure:",
  "- D1 binding: DB",
  "- Secrets listed in secrets.example.md",
  "- Variables listed in DEPLOY-ZIP.md",
  "- Cron Trigger: */5 * * * *",
  "",
  "After deployment, open /setup to initialize D1 schema and defaults.",
  ""
].join("\n"));

await compressArchive(packageDir, zipPath);
console.log(`Created ${zipPath}`);

function compressArchive(sourceDir, destination) {
  const command = [
    "-NoProfile",
    "-Command",
    `Compress-Archive -Path '${sourceDir.replaceAll("'", "''")}\\*' -DestinationPath '${destination.replaceAll("'", "''")}' -Force`
  ];
  return new Promise((resolvePromise, reject) => {
    const child = spawn("powershell.exe", command, { stdio: "inherit" });
    child.on("exit", (code) => code === 0 ? resolvePromise() : reject(new Error(`Compress-Archive failed with code ${code}`)));
    child.on("error", reject);
  });
}
