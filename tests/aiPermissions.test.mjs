import test from 'node:test';
import assert from 'node:assert/strict';
import { declaresApiOrigin, requestApiOrigin } from '../services/ai/api/permissions.ts';

const origin = 'https://integrate.api.nvidia.com/*';
test('API host declarations are recognized in Firefox MV2 and Chromium MV3', () => {
  assert.equal(declaresApiOrigin({ optional_permissions: ['https://*/*'] }, origin), true);
  assert.equal(declaresApiOrigin({ optional_host_permissions: ['https://*/*'] }, origin), true);
  assert.equal(declaresApiOrigin({ optional_permissions: [origin] }, origin), true);
  assert.equal(declaresApiOrigin({ optional_permissions: ['https://*.nvidia.com/*'] }, origin), true);
  assert.equal(declaresApiOrigin({ optional_permissions: ['https://nvidia.com/*'] }, origin), false);
  assert.equal(declaresApiOrigin({ optional_permissions: ['http://*/*'] }, origin), false);
  assert.equal(declaresApiOrigin({ optional_permissions: ['https://*.nvidia.com/*'] }, 'https://nvidia.com.attacker.invalid/*'), false);
});
test('an outdated loaded manifest shows recovery instructions without requesting undeclared access', async () => {
  const previous = globalThis.browser;
  let requests = 0;
  globalThis.browser = { runtime: { getManifest: () => ({ manifest_version: 2 }) }, permissions: { request: async () => { requests++; return true; } } };
  try {
    assert.throws(() => requestApiOrigin('https://integrate.api.nvidia.com/v1'), /recarregue a extensão/);
    assert.equal(requests, 0);
    browser.runtime.getManifest = () => ({ optional_permissions: ['https://*/*'] });
    browser.permissions.request = options => { requests++; assert.deepEqual(options, { origins: [origin] }); return Promise.resolve(true); };
    const result = requestApiOrigin('https://integrate.api.nvidia.com/v1');
    assert.equal(requests, 1); // Solicita no gesto síncrono, antes de aguardar uma Promise.
    assert.equal(await result, true);
  } finally { globalThis.browser = previous; }
});
