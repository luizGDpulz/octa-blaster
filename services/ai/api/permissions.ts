import { apiOrigin } from './catalog';

interface PermissionManifest {
  optional_permissions?: string[];
  optional_host_permissions?: string[];
}

/** Confere o manifesto efetivamente carregado, não somente o arquivo gerado em disco. */
export function declaresApiOrigin(manifest: PermissionManifest, origin: string): boolean {
  const target = new URL(origin);
  return [...(manifest.optional_permissions || []), ...(manifest.optional_host_permissions || [])].some(pattern => {
    const match = /^(\*|https?):\/\/([^/]+)\/.*$/.exec(pattern);
    if (!match || (match[1] !== '*' && `${match[1]}:` !== target.protocol)) return false;
    const host = match[2] || '';
    return host === '*' || host === target.host
      || (host.startsWith('*.') && (target.hostname === host.slice(2) || target.hostname.endsWith(`.${host.slice(2)}`)));
  });
}

export function requestApiOrigin(baseUrl: string): Promise<boolean> {
  const origin = apiOrigin(baseUrl);
  if (!declaresApiOrigin(browser.runtime.getManifest(), origin)) {
    throw new Error('A extensão carregada não declara acesso às APIs. Atualize ou recarregue a extensão em about:debugging (Firefox) ou chrome://extensions (Chrome) e reabra esta tela.');
  }
  // Precisa ser iniciado no mesmo gesto do clique; não aguarda contains/getAll antes.
  return browser.permissions.request({ origins: [origin] });
}
