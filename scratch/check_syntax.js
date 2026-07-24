const fs = require('fs');
const vm = require('vm');

try {
  const html = fs.readFileSync('dashboard.html', 'utf8');
  // Match script blocks
  const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  let index = 1;
  while ((match = scriptRegex.exec(html)) !== null) {
    const js = match[1];
    if (js.trim()) {
      console.log(`Checking script block ${index}...`);
      try {
        new vm.Script(js);
        console.log(`  Block ${index} is valid.`);
      } catch (err) {
        console.error(`  Error in block ${index}:`, err.stack);
        // Find line number in original html
        const precedingText = html.substring(0, match.index);
        const startLine = precedingText.split('\n').length;
        console.error(`  Approximate line number in dashboard.html: around line ${startLine}`);
      }
    }
    index++;
  }
} catch (e) {
  console.error(e);
}
