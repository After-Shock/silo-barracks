const fs = require('node:fs');
const path = require('node:path');

const roots = ['apps/web/src', 'apps/web/public/locales', 'apps/api'];
const attributionPatterns = [
  /derived from JellyGlance by Nerdy-Technician/,
  /github\.com\/Nerdy-Technician\/JellyGlance/,
];
const violations = [];
function walk(entry) {
  for (const item of fs.readdirSync(entry, { withFileTypes: true })) {
    const file = path.join(entry, item.name).split(path.sep).join('/');
    if (item.isDirectory()) walk(file);
    else if (/\.(?:js|jsx|json)$/.test(item.name)) {
      const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
      lines.forEach((line, index) => {
        if (/JellyGlance/.test(line) && !attributionPatterns.some(pattern => pattern.test(line))) {
          violations.push(`${file}:${index + 1}: ${line.trim()}`);
        }
      });
    }
  }
}
roots.forEach(walk);
if (violations.length) {
  console.error(`Legacy product branding found outside the attribution allowlist:\n${violations.join('\n')}`);
  process.exit(1);
}
console.log('PASS Barracks product branding audit');
