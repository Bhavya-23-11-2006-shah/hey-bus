// Regenerates sticky-days/Sticky-Days.html — the single-file copy of the app that
// people can keep or open in any browser. It is generated from index.html so it can
// never drift behind the real app (it used to be a hand-kept copy and went stale).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const src = path.join(root, 'sticky-days', 'index.html');
const out = path.join(root, 'sticky-days', 'Sticky-Days.html');

let html = fs.readFileSync(src, 'utf8');

// Inline the fonts, so the downloaded file looks exactly like the app even with no
// folder and no internet next to it.
const fontsDir = path.join(root, 'sticky-days', 'fonts');
let fontCss = fs.readFileSync(path.join(fontsDir, 'fonts.css'), 'utf8');
fontCss = fontCss.replace(/url\('([^']+\.woff2)'\)/g, (whole, file) => {
  const b64 = fs.readFileSync(path.join(fontsDir, file)).toString('base64');
  return `url('data:font/woff2;base64,${b64}')`;
});
if (fontCss.includes(".woff2'")) throw new Error('a font url was not inlined');
html = html.replace(
  '<link rel="stylesheet" href="fonts/fonts.css">',
  '<style>' + fontCss + '</style>'
);

// A saved file has no manifest and cannot register a service worker.
html = html.replace('<link rel="manifest" href="manifest.webmanifest">', '');
const swStart = html.indexOf("<script>\nif('serviceWorker' in navigator){");
if (swStart !== -1) html = html.slice(0, swStart) + '</body></html>';

const mustHave = ["indexedDB.open('sticky-days'", 'localStorage', '</html>', 'data:font/woff2;base64'];
if (html.includes('href="fonts/fonts.css"')) throw new Error('font stylesheet was not inlined');
for (const needle of mustHave) {
  if (!html.includes(needle)) throw new Error('missing expected app content: ' + needle);
}
if (/serviceWorker/.test(html)) throw new Error('service worker code still present');
if (/rel="manifest"/.test(html)) throw new Error('manifest link still present');

fs.writeFileSync(out, html);
console.log(`standalone app written: ${out} (${html.length} bytes)`);
