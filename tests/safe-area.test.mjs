import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('shell reserves the iOS safe area and requests an opaque status bar', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(html, /name="apple-mobile-web-app-status-bar-style" content="black"/);
  assert.match(css, /body \{[^}]*padding: env\(safe-area-inset-top, 0px\)/);
  assert.match(css, /body::before \{[^}]*position: fixed;[^}]*height: env\(safe-area-inset-top, 0px\);[^}]*background: #fff;[^}]*pointer-events: none;/);
});
