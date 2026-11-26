import test from 'node:test';
import assert from 'node:assert/strict';
import { installDom, installStorage } from './helpers.mjs';

test('content insertion requires its registered editor and ignores forged window messages', async () => {
  const dom = installDom(`<section ticket-id="A"><textarea id="a"></textarea></section>
    <section ticket-id="B"><textarea id="b"></textarea></section>`);
  const storage = installStorage();
  const previousDefine = globalThis.defineContentScript;
  const previousTimeout = globalThis.setTimeout;
  const listeners = [];
  let token;
  globalThis.defineContentScript = (definition) => definition;
  globalThis.browser.runtime = {
    id: 'test-extension',
    onMessage: { addListener(fn) { listeners.push(fn); }, removeListener() {} },
    async sendMessage(message) { token = message.editorToken; },
  };
  dom.window.HTMLElement.prototype.getBoundingClientRect = () => ({ width: 500, height: 100, top: 0, left: 0, bottom: 100, right: 500 });
  // Lifecycle scheduling is unrelated to message routing and would outlive this fixture.
  globalThis.setTimeout = () => 0;
  try {
    const { default: content } = await import('../entrypoints/content.ts');
    content.main();
    const a = dom.document.querySelector('#a');
    const b = dom.document.querySelector('#b');
    a.focus();
    const tokenA = token;
    assert.ok(tokenA);
    dom.window.postMessage({ type: 'OCTABLASTER_INSERT_BROADCAST', content: 'forged' }, '*');
    assert.equal(a.value, '');
    const request = (message, sender = { id: 'test-extension' }) => {
      let response;
      for (const listener of listeners) listener(message, sender, (value) => { response = value; });
      return response;
    };
    assert.equal(request({ action: 'INSERT_REPLY', content: 'wrong', editorToken: 'unknown' }).success, false);
    assert.equal(request({ action: 'INSERT_REPLY', content: 'correct', editorToken: tokenA, requestId: '1' }).success, true);
    assert.equal(a.value, 'correct');
    assert.equal(b.value, '');
    b.focus();
    assert.equal(request({ action: 'INSERT_REPLY', content: 'stale', editorToken: tokenA, requestId: '2' }).success, false);
    assert.equal(b.value, '');
    b.closest('section').setAttribute('ticket-id', 'C');
    assert.equal(request({ action: 'INSERT_REPLY', content: 'recycled', editorToken: token, requestId: 'recycled' }).success, false);
    assert.equal(b.value, '');
    b.closest('section').hidden = true;
    assert.equal(request({ action: 'INSERT_REPLY', content: 'hidden', editorToken: token, requestId: '3' }).success, false);
    assert.equal(b.value, '');
  } finally {
    globalThis.setTimeout = previousTimeout;
    if (previousDefine === undefined) delete globalThis.defineContentScript;
    else globalThis.defineContentScript = previousDefine;
    storage.restore();
    dom.restore();
  }
});
