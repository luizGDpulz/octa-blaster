import { JSDOM } from 'jsdom';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';

export function installDom(html = '') {
  const dom = new JSDOM(html, { url: 'https://app.octadesk.com/tickets' });
  const descriptors = new Map();
  const names = ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLIFrameElement',
    'Node', 'Element', 'Event', 'InputEvent', 'KeyboardEvent', 'MouseEvent', 'MutationObserver', 'localStorage'];
  for (const name of names) {
    descriptors.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name] });
  }
  return {
    window: dom.window,
    document: dom.window.document,
    restore() {
      dom.window.close();
      for (const [name, descriptor] of descriptors) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else delete globalThis[name];
      }
    },
  };
}

export function installStorage(initial = {}) {
  const data = structuredClone(initial);
  const previous = globalThis.browser;
  const previousIdb=globalThis.indexedDB,previousRange=globalThis.IDBKeyRange;
  globalThis.indexedDB=new IDBFactory();globalThis.IDBKeyRange=IDBKeyRange;
  globalThis.browser = {
    storage: {
      local: {
        async getKeys() { return Object.keys(data); },
        async get(keys) {
          if (keys === null) keys = Object.keys(data);
          return Object.fromEntries(keys.filter((key) => key in data).map((key) => [key, structuredClone(data[key])]));
        },
        async set(items) { Object.assign(data, structuredClone(items)); },
        async remove(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) delete data[key]; },
      },
    },
  };
  return {
    data,
    restore() {
      globalThis.indexedDB=previousIdb;globalThis.IDBKeyRange=previousRange;
      if (previous === undefined) delete globalThis.browser;
      else globalThis.browser = previous;
    },
  };
}
