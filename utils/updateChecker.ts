export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  releaseUrl: string;
  releaseNotes?: string;
  publishedAt?: string;
  downloadUrl?: string;
}

/**
 * Compara duas versões no formato semver (ex: '0.4.0' vs 'v0.4.1').
 * Retorna > 0 se v1 > v2, < 0 se v1 < v2 e 0 se forem iguais.
 */
export function compareSemver(v1: string, v2: string): number {
  const parse = (v: string) =>
    v
      .replace(/^v/, '')
      .split('.')
      .map((num) => parseInt(num, 10) || 0);

  const parts1 = parse(v1);
  const parts2 = parse(v2);
  const length = Math.max(parts1.length, parts2.length);

  for (let i = 0; i < length; i++) {
    const p1 = parts1[i] ?? 0;
    const p2 = parts2[i] ?? 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }

  return 0;
}

/**
 * Consulta a API pública de releases do GitHub para verificar se há versão mais recente.
 */
export async function checkGithubRelease(
  currentVersion: string,
  repo = 'luizGDpulz/octa-blaster',
): Promise<UpdateInfo> {
  const cleanCurrent = currentVersion.replace(/^v/, '').trim();
  const endpoint = `https://api.github.com/repos/${repo}/releases/latest`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(endpoint, {
      signal: controller.signal,
      headers: {
        Accept: 'application/vnd.github.v3+json',
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Nenhuma versão pública encontrada no repositório.');
      }
      if (response.status === 403) {
        throw new Error('Limite de consultas temporariamente atingido no GitHub. Tente mais tarde.');
      }
      throw new Error(`Servidor do GitHub respondeu com status ${response.status}`);
    }

    const data = await response.json();
    const rawTag = (data.tag_name || '').trim();
    const cleanLatest = rawTag.replace(/^v/, '').trim();

    if (!cleanLatest) {
      throw new Error('Formato de versão inválido na release do GitHub.');
    }

    const hasUpdate = compareSemver(cleanLatest, cleanCurrent) > 0;

    // Procura por arquivo de asset relevante (.zip ou .xpi)
    let downloadUrl = data.html_url;
    if (Array.isArray(data.assets) && data.assets.length > 0) {
      const preferredAsset =
        data.assets.find((a: any) => a.name?.endsWith('.xpi')) ||
        data.assets.find((a: any) => a.name?.endsWith('.zip')) ||
        data.assets[0];

      if (preferredAsset?.browser_download_url) {
        downloadUrl = preferredAsset.browser_download_url;
      }
    }

    return {
      currentVersion: cleanCurrent,
      latestVersion: cleanLatest,
      hasUpdate,
      releaseUrl: data.html_url || `https://github.com/${repo}/releases`,
      releaseNotes: data.body || '',
      publishedAt: data.published_at || '',
      downloadUrl,
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('Tempo limite excedido ao conectar com o GitHub.');
    }
    throw err;
  }
}
