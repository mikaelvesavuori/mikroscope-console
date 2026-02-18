import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { minify } from 'html-minifier-terser';
import { transform } from 'lightningcss';

const ROOT = process.cwd();
const SRC_DIR = resolve(ROOT, 'src');
const DIST_DIR = resolve(ROOT, 'dist');

const packageVersion = JSON.parse(
  readFileSync(resolve(ROOT, 'package.json'), 'utf8'),
).version;

function cleanDist() {
  rmSync(DIST_DIR, { recursive: true, force: true });
  mkdirSync(DIST_DIR, { recursive: true });
}

async function buildClientScript() {
  await build({
    entryPoints: [resolve(SRC_DIR, 'app.js')],
    outfile: resolve(DIST_DIR, 'app.js'),
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['es2024'],
    minify: true,
    sourcemap: false,
  });
}

function getSourceFilesByExtension(extension) {
  return readdirSync(SRC_DIR)
    .filter((name) => name.endsWith(extension))
    .sort();
}

async function buildClientStyles() {
  const cssFiles = getSourceFilesByExtension('.css');

  for (const file of cssFiles) {
    const cssInput = readFileSync(resolve(SRC_DIR, file));
    const { code } = transform({
      filename: file,
      code: cssInput,
      minify: true,
      sourceMap: false,
    });
    writeFileSync(resolve(DIST_DIR, file), code);
  }
}

async function buildClientHtml() {
  const htmlFiles = getSourceFilesByExtension('.html');

  for (const file of htmlFiles) {
    const html = readFileSync(resolve(SRC_DIR, file), 'utf8');
    const minifiedHtml = await minify(html, {
      collapseWhitespace: true,
      removeComments: true,
      minifyCSS: false,
      minifyJS: false,
      removeRedundantAttributes: true,
      removeOptionalTags: true,
      removeEmptyAttributes: true,
      removeScriptTypeAttributes: true,
      removeStyleLinkTypeAttributes: true,
      useShortDoctype: true,
    });
    writeFileSync(resolve(DIST_DIR, file), minifiedHtml);
  }
}

function copyStaticAssets() {
  cpSync(resolve(SRC_DIR, 'config.json'), resolve(DIST_DIR, 'config.json'));

  const sourceFontsDir = resolve(SRC_DIR, 'fonts');
  if (existsSync(sourceFontsDir)) {
    cpSync(sourceFontsDir, resolve(DIST_DIR, 'fonts'), { recursive: true });
  }
}

async function main() {
  const startedAt = Date.now();
  console.log(`Building MikroScope Console v${packageVersion}...`);

  cleanDist();
  await Promise.all([buildClientScript(), buildClientStyles(), buildClientHtml()]);
  copyStaticAssets();

  const seconds = ((Date.now() - startedAt) / 1000).toFixed(2);
  console.log(`Build completed in ${seconds}s`);
  console.log(`Output: ${DIST_DIR}`);
}

main().catch((error) => {
  console.error('Build failed:', error);
  process.exit(1);
});
