import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    name: 'OctaBlaster - Respostas Rápidas Octadesk',
    description: 'Respostas prontas automatizadas, injeção rápida de texto e automação de licenças para tickets no Octadesk',
    version: '0.3.8',
    permissions: ['storage', 'activeTab', 'tabs'],
    host_permissions: ['*://app.octadesk.com/*', '*://*.octadesk.com/*'],
    browser_specific_settings: {
      gecko: {
        id: 'octablaster@local.extension',
      },
    },
    // Toolbar Popup nativo do Firefox
    browser_action: {
      default_title: 'OctaBlaster',
      default_popup: 'popup.html',
      default_icon: {
        16: 'icon/16.png',
        32: 'icon/32.png',
      },
    },
    // Suporte ao Painel Lateral nativo do Firefox (Sidebar Action)
    sidebar_action: {
      default_title: 'OctaBlaster',
      default_panel: 'sidepanel.html',
      default_icon: {
        16: 'icon/16.png',
        32: 'icon/32.png',
      },
    },
  },
  suppressWarnings: {
    firefoxDataCollection: true,
  },
});
