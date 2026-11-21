// Builds the offline asset copy of the app for the Android APK.
// The app's own code is left exactly as-is; only the web-install extras
// (manifest link + service-worker registration) are removed, because an APK
// runs from file:// and does not need or support them.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const src = path.join(root, 'sticky-days', 'index.html');
const outDir = path.join(root, '.android-build', 'app', 'assets');
const out = path.join(outDir, 'index.html');

let html = fs.readFileSync(src, 'utf8');
const before = html.length;

html = html.replace('<link rel="manifest" href="manifest.webmanifest">', '');

const swStart = html.indexOf("<script>\nif('serviceWorker' in navigator){");
if (swStart !== -1) {
  html = html.slice(0, swStart) + '</body></html>';
}

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(out, html);

// The fonts ship inside the APK too, so the handwriting works with no network.
// They are copied FLAT into the assets root: aapt2 packs a sub-folder on Windows
// with backslashes in the name ("fonts\\caveat.woff2"), which the WebView can
// never look up. Flat names avoid that entirely.
const fontsSrc = path.join(root, 'sticky-days', 'fonts');
const staleFonts = path.join(outDir, 'fonts');
fs.rmSync(staleFonts, { recursive: true, force: true });
for (const f of fs.readdirSync(fontsSrc)) {
  if (!/\.(css|woff2)$/.test(f)) continue;
  fs.copyFileSync(path.join(fontsSrc, f), path.join(outDir, f));
}
html = html.replace('href="fonts/fonts.css"', 'href="fonts.css"');
fs.writeFileSync(out, html);

// sanity: the app itself must still be intact
const mustHave = ["indexedDB.open('sticky-days'", 'localStorage', 'Sticky Days', '</html>', 'href="fonts.css"'];
for (const needle of mustHave) {
  if (!html.includes(needle)) throw new Error('missing expected app content: ' + needle);
}
if (/serviceWorker/.test(html)) throw new Error('service worker code still present');
if (/rel="manifest"/.test(html)) throw new Error('manifest link still present');

console.log(`asset index.html written: ${out} (${before} -> ${html.length} bytes)`);
console.log('asset fonts written flat into ' + outDir);
