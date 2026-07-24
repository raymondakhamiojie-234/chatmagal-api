const fs = require('fs');

const html = fs.readFileSync('dashboard.html', 'utf8');
const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
let match;
let blockIndex = 1;

while ((match = scriptRegex.exec(html)) !== null) {
  const js = match[1];
  if (blockIndex === 4) { // Main script block
    console.log(`Analyzing block 4...`);
    const precedingText = html.substring(0, match.index);
    const blockStartLine = precedingText.split('\n').length;
    
    const stack = [];
    let inString = null; // null, '"', "'", '`'
    let inComment = null; // null, '//', '/*'
    let line = blockStartLine;
    let col = 1;

    for (let i = 0; i < js.length; i++) {
      const c = js[i];
      const next = js[i+1];

      // Update line and col
      if (c === '\n') {
        line++;
        col = 1;
      } else {
        col++;
      }

      // Handle comments and strings
      if (inComment === '//') {
        if (c === '\n') {
          inComment = null;
        }
        continue;
      }
      if (inComment === '/*') {
        if (c === '*' && next === '/') {
          inComment = null;
          i++; // skip /
          col++;
        }
        continue;
      }
      if (inString) {
        if (c === '\\') {
          i++; // skip next char
          col++;
        } else if (c === inString) {
          inString = null;
        }
        continue;
      }

      // Detect comments
      if (c === '/' && next === '/') {
        inComment = '//';
        i++;
        col++;
        continue;
      }
      if (c === '/' && next === '*') {
        inComment = '/*';
        i++;
        col++;
        continue;
      }

      // Detect strings
      if (c === '"' || c === "'" || c === '`') {
        inString = c;
        continue;
      }

      // Track braces, brackets, parentheses
      if (c === '{' || c === '(' || c === '[') {
        stack.push({ char: c, line, col });
      } else if (c === '}' || c === ')' || c === ']') {
        if (stack.length === 0) {
          console.error(`ERROR: Extra closing '${c}' at line ${line}, col ${col}`);
        } else {
          const last = stack[stack.length - 1];
          const matches = (last.char === '{' && c === '}') ||
                          (last.char === '(' && c === ')') ||
                          (last.char === '[' && c === ']');
          if (matches) {
            stack.pop();
          } else {
            console.error(`ERROR: Mismatched closing '${c}' at line ${line}, col ${col}. Expected match for '${last.char}' opened at line ${last.line}, col ${last.col}`);
            // Let's assume it matches and pop anyway to keep scanning
            stack.pop();
          }
        }
      }
    }

    if (stack.length > 0) {
      console.log(`\nFound ${stack.length} unclosed items at end of block 4:`);
      stack.forEach(item => {
        console.log(`- '${item.char}' opened at line ${item.line}, col ${item.col}`);
        
        // Let's print the line content around this unclosed item
        const lines = html.split('\n');
        const contextLine = lines[item.line - 1];
        console.log(`  Context: ${contextLine.trim()}`);
      });
    } else {
      console.log(`No unclosed items found in block 4.`);
    }
  }
  blockIndex++;
}
