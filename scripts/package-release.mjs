#!/usr/bin/env node

import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const distDir = path.resolve(projectRoot, "dist");
const releaseDir = path.resolve(projectRoot, "release");

async function ensureDistExists() {
  try {
    const info = await stat(distDir);
    if (!info.isDirectory()) {
      throw new Error("dist is not a directory.");
    }
  } catch {
    throw new Error('Missing "dist/" output. Run "npm run build" first.');
  }
}

async function readVersion() {
  const packageJsonPath = path.resolve(projectRoot, "package.json");
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  const version = String(packageJson?.version || "").trim();
  if (!version) {
    throw new Error("Could not resolve version from package.json.");
  }
  return version;
}

async function sha256(filePath) {
  const content = await readFile(filePath);
  return createHash("sha256").update(content).digest("hex");
}

async function packageRelease() {
  await ensureDistExists();
  const version = await readVersion();
  const bundleBase = `mikroscope-console-v${version}`;
  const stagingRoot = path.resolve(releaseDir, "_staging");
  const bundleDir = path.resolve(stagingRoot, bundleBase);

  await rm(releaseDir, { force: true, recursive: true });
  await mkdir(bundleDir, { recursive: true });

  await cp(distDir, path.resolve(bundleDir, "public"), { recursive: true });
  await writeFile(
    path.resolve(bundleDir, "README.txt"),
    [
      "MikroScope Console Release Bundle",
      "",
      "Quick start:",
      "1. Edit public/config.json and set apiOrigin to your MikroScope API URL.",
      "2. Serve the public/ directory with any static web server.",
      "3. Open index.html in your browser via that server URL.",
      "",
      "Example:",
      "  npx http-server public -p 4320 -c-1",
      "",
    ].join("\n"),
    "utf8",
  );

  const tarPath = path.resolve(releaseDir, `${bundleBase}.tar.gz`);
  const zipPath = path.resolve(releaseDir, `${bundleBase}.zip`);

  await execFileAsync("tar", ["-czf", tarPath, bundleBase], { cwd: stagingRoot });
  await execFileAsync("zip", ["-qr", zipPath, bundleBase], { cwd: stagingRoot });

  const tarHash = await sha256(tarPath);
  const zipHash = await sha256(zipPath);
  await writeFile(
    path.resolve(releaseDir, "SHA256SUMS.txt"),
    `${tarHash}  ${path.basename(tarPath)}\n${zipHash}  ${path.basename(zipPath)}\n`,
    "utf8",
  );

  await rm(stagingRoot, { force: true, recursive: true });

  process.stdout.write(
    [
      `Created release artifacts in ${releaseDir}`,
      `- ${path.basename(tarPath)}`,
      `- ${path.basename(zipPath)}`,
      "- SHA256SUMS.txt",
      "",
    ].join("\n"),
  );
}

packageRelease().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
