const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'dashboard.html');
let content = fs.readFileSync(filePath, 'utf8');

// Fix 1: msg.content.text -> msg.content && msg.content.text
content = content.replace(
  `if (msg.content.text && msg.content.text.body) {`,
  `if (msg.content && msg.content.text && msg.content.text.body) {`
);

// Fix 2: msg.content.type === 'image' -> msg.content && msg.content.type === 'image'
content = content.replace(
  `} else if (msg.content.type === 'image') {`,
  `} else if (msg.content && msg.content.type === 'image') {`
);

// Fix 3: document
content = content.replace(
  `} else if (msg.content.type === 'document') {`,
  `} else if (msg.content && msg.content.type === 'document') {`
);

// Fix 4: audio/voice
content = content.replace(
  `} else if (msg.content.type === 'audio' || msg.content.type === 'voice') {`,
  `} else if (msg.content && (msg.content.type === 'audio' || msg.content.type === 'voice')) {`
);

// Fix 5: location
content = content.replace(
  `} else if (msg.content.type === 'location') {`,
  `} else if (msg.content && msg.content.type === 'location') {`
);

// Fix 6: template
content = content.replace(
  `} else if (msg.content.template && msg.content.template.name) {`,
  `} else if (msg.content && msg.content.template && msg.content.template.name) {`
);

// Fix 7: appendChatBubble msgType
content = content.replace(
  `const msgType = message.content.type;`,
  `const msgType = message.content ? message.content.type : undefined;`
);

// Fix 8: appendChatBubble template
content = content.replace(
  `} else if (message.content.template && message.content.template.name) {`,
  `} else if (message.content && message.content.template && message.content.template.name) {`
);

// Fix 9: appendChatBubble unsupported
content = content.replace(
  `bodyText = (message.content.text && message.content.text.body) ? message.content.text.body : '[Unsupported Message Format]';`,
  `bodyText = (message.content && message.content.text && message.content.text.body) ? message.content.text.body : '[Unsupported Message Format]';`
);

fs.writeFileSync(filePath, content);
console.log('Successfully patched dashboard.html');
