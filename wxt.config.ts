import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    name: 'OctaBlaster - Respostas Rápidas Octadesk',
    description: 'Respostas prontas automatizadas e injeção rápida de texto para tickets no Octadesk e Helpdesks',
    version: '0.1.0',
    version_name: '0.1.0-beta.2',
    permissions: ['storage', 'activeTab'],
    host_permissions: ['*://*.octadesk.com/*', '<all_urls>'],
    browser_specific_settings: {
      gecko: {
        id: 'octablaster@local.extension',
      },
    },
  },
  suppressWarnings: {
    firefoxDataCollection: true,
  },
});
