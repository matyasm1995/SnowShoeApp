const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '..', 'dist');
const indexPath = path.join(distDir, 'index.html');

if (!fs.existsSync(indexPath)) {
  console.error('dist/index.html not found — run `expo export --platform web` first.');
  process.exit(1);
}

let html = fs.readFileSync(indexPath, 'utf8');

const pwaHeadTags = [
  '<meta name="theme-color" content="#0B0D10" />',
  '<meta name="apple-mobile-web-app-capable" content="yes" />',
  '<meta name="mobile-web-app-capable" content="yes" />',
  '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />',
  '<meta name="apple-mobile-web-app-title" content="TO Guides" />',
  '<link rel="manifest" href="/manifest.json" />',
  '<link rel="apple-touch-icon" href="/apple-touch-icon.png" />',
  '<style>html,body,#root{background-color:#0B0D10;height:100%;height:100dvh;overscroll-behavior:none;-webkit-tap-highlight-color:transparent;}</style>',
].join('\n    ');

// Update viewport for notch/safe-area support on iPhone PWA
html = html.replace(
  /<meta name="viewport"[^>]*>/i,
  '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" />'
);

if (!html.includes('rel="manifest"')) {
  html = html.replace('</head>', `    ${pwaHeadTags}\n  </head>`);
}

fs.writeFileSync(indexPath, html, 'utf8');

// Copy public/ files into dist/ if Expo didn't already copy them
const publicDir = path.join(__dirname, '..', 'public');
if (fs.existsSync(publicDir)) {
  for (const file of fs.readdirSync(publicDir)) {
    const src = path.join(publicDir, file);
    const dst = path.join(distDir, file);
    if (fs.statSync(src).isFile()) {
      fs.copyFileSync(src, dst);
    }
  }
}

// Add Cloudflare Pages _headers for clean service-worker & manifest caching
const headersContent = `/sw.js
  Cache-Control: no-cache, no-store, must-revalidate
/manifest.json
  Cache-Control: public, max-age=3600
`;
fs.writeFileSync(path.join(distDir, '_headers'), headersContent, 'utf8');

console.log('Patched dist/index.html with iOS PWA meta tags, manifest, icons, and _headers.');
