import type { QuickReplyTemplate } from '@/types/template';

export const STORAGE_KEY = 'octablaster_quick_replies_v2';
export const HAS_INITIALIZED_KEY = 'octablaster_initialized_v2';

const LEGACY_INACTIVITY_CONTENTS: Record<string, string> = {
  'inatividade-2-4':
    '{{Saudacao}}\n\nAlgum retorno sobre este ticket? Caso contrário o mesmo será encerrado.',
  'inatividade-6':
    '{{Saudacao}}\n\nNão recebemos retorno do último e-mail enviado e não havendo mais interações neste canal de atendimento, estaremos marcando este ticket como resolvido. Caso tenha alguma novidade sobre o assunto, basta responder este e-mail que reabriremos o caso.',
};

export const DEFAULT_TEMPLATES: QuickReplyTemplate[] = [
  {
    id: 'inatividade-2-4',
    title: 'Cobrança de Retorno (2º e 4º dia)',
    content:
      '{{Saudacao}}\n\nGostaria de verificar se há algum retorno ou atualização sobre este ticket. Fico no aguardo da sua resposta.',
    category: 'Inatividade',
    updatedAt: 1700000000001,
  },
  {
    id: 'inatividade-6',
    title: 'Encerramento por Falta de Retorno (6º dia)',
    content:
      '{{Saudacao}}\n\nComo não tivemos retorno ao nosso último e-mail, vamos marcar este ticket como resolvido por enquanto.\n\nMas não se preocupe! Se tiver alguma novidade ou precisar continuar tratando desse assunto, basta responder a este e-mail que reabriremos o atendimento para dar continuidade.',
    category: 'Inatividade',
    updatedAt: 1700000000001,
  },
  {
    id: 'saudacao-geral',
    title: 'Saudação e Em Análise',
    content: '{{Saudacao}} Tudo bem?\n\nRecebemos sua solicitação e já estamos analisando o caso.\nEm breve entraremos em contato com mais detalhes.',
    category: 'Geral',
    updatedAt: 1700000000000,
  },
  {
    id: 'solicitacao-prints',
    title: 'Solicitação de Prints / Evidências',
    content: '{{Saudacao}}\n\nPara que possamos prosseguir com o diagnóstico, poderia nos enviar:\n1. Print ou gravação da tela com a mensagem de erro;\n2. O passo a passo exato para reproduzir o problema;\n3. O horário aproximado em que ocorreu.\n\nFicamos no aguardo!',
    category: 'Suporte',
    updatedAt: 1700000000000,
  },
];

/**
 * Sanitiza um único modelo, garantindo campos obrigatórios e eliminando `undefined`
 * para compatibilidade absoluta com a serialização do storage do navegador.
 */
export function sanitizeTemplate(raw: any): QuickReplyTemplate | null {
  if (!raw || typeof raw !== 'object') return null;

  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  const content = typeof raw.content === 'string' ? raw.content.trim() : '';
  if (!title || !content) return null;

  const id = typeof raw.id === 'string' && raw.id.trim()
    ? raw.id.trim()
    : (typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `tpl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);

  const category = typeof raw.category === 'string' ? raw.category.trim() : '';
  const updatedAt = typeof raw.updatedAt === 'number' && !isNaN(raw.updatedAt)
    ? raw.updatedAt
    : Date.now();

  const clean: QuickReplyTemplate = {
    id,
    title,
    content,
    updatedAt,
  };

  // Define categoria somente se preenchida para nunca enviar undefined ao storage
  if (category) {
    clean.category = category;
  }

  return clean;
}

/**
 * Sanitiza uma lista completa de modelos, desfazendo Proxies do Vue 3 e eliminando
 * valores inválidos ou propriedades com undefined.
 */
export function sanitizeTemplatesList(rawList: any[]): QuickReplyTemplate[] {
  if (!Array.isArray(rawList)) return [];
  const result: QuickReplyTemplate[] = [];

  for (const item of rawList) {
    const clean = sanitizeTemplate(item);
    if (clean) {
      result.push(clean);
    }
  }

  // Desfaz referências circulares e proxies do Vue (POJO puro)
  return JSON.parse(JSON.stringify(result));
}

/**
 * Obtém a área local de armazenamento disponível no ambiente (WXT browser, chrome ou browser global).
 */
function getBrowserStorageArea(): any {
  if (typeof browser !== 'undefined' && browser?.storage?.local) {
    return browser.storage.local;
  }
  const gChrome = (globalThis as any).chrome;
  if (gChrome?.storage?.local) {
    return gChrome.storage.local;
  }
  const gBrowser = (globalThis as any).browser;
  if (gBrowser?.storage?.local) {
    return gBrowser.storage.local;
  }
  return null;
}

/**
 * Leitura de chaves com compatibilidade entre Promise (MV3) e Callback (MV2 / Chromium legado).
 */
export async function rawStorageGet(keys: string[]): Promise<Record<string, any>> {
  const st = getBrowserStorageArea();

  if (st) {
    try {
      const res = st.get(keys);
      if (res && typeof res.then === 'function') {
        const data = await res;
        if (data && typeof data === 'object') return data;
      } else {
        const callbackData = await new Promise<Record<string, any>>((resolve, reject) => {
          st.get(keys, (items: any) => {
            const err = (globalThis as any).chrome?.runtime?.lastError;
            if (err) reject(new Error(err.message || String(err)));
            else resolve(items || {});
          });
        });
        if (callbackData && typeof callbackData === 'object') return callbackData;
      }
    } catch (err) {
      console.warn('[OctaBlaster] Erro ao ler browser.storage.local, tentando fallback:', err);
    }
  }

  // Fallback redundante para localStorage
  const fallback: Record<string, any> = {};
  if (typeof localStorage !== 'undefined') {
    for (const key of keys) {
      try {
        const stored = localStorage.getItem(key);
        if (stored) {
          fallback[key] = JSON.parse(stored);
        }
      } catch {}
    }
  }

  return fallback;
}

/**
 * Escrita segura de chaves com sanitização e sincronização redundante com localStorage.
 */
export async function rawStorageSet(items: Record<string, any>): Promise<void> {
  const st = getBrowserStorageArea();
  let storageSaved = false;

  // Sanitiza tudo que vai pro storage para garantir POJO puro sem undefined
  const pojoItems = JSON.parse(JSON.stringify(items));

  if (st) {
    try {
      const res = st.set(pojoItems);
      if (res && typeof res.then === 'function') {
        await res;
        storageSaved = true;
      } else {
        await new Promise<void>((resolve, reject) => {
          st.set(pojoItems, () => {
            const err = (globalThis as any).chrome?.runtime?.lastError;
            if (err) reject(new Error(err.message || String(err)));
            else resolve();
          });
        });
        storageSaved = true;
      }
    } catch (err) {
      console.warn('[OctaBlaster] Erro ao salvar em browser.storage.local:', err);
    }
  }

  // Backup em localStorage
  if (typeof localStorage !== 'undefined') {
    try {
      for (const [key, value] of Object.entries(pojoItems)) {
        localStorage.setItem(key, JSON.stringify(value));
      }
    } catch {}
  }

  if (!storageSaved && typeof localStorage === 'undefined') {
    throw new Error('Nenhum armazenamento disponível no navegador para salvar.');
  }
}

/**
 * Carrega todos os modelos armazenados. Inicializa com os padrões na primeira execução.
 */
export async function loadStoredTemplates(): Promise<QuickReplyTemplate[]> {
  try {
    const data = await rawStorageGet([STORAGE_KEY, HAS_INITIALIZED_KEY]);
    const stored = data[STORAGE_KEY] as any[] | undefined;
    const initialized = Boolean(data[HAS_INITIALIZED_KEY]);

    if (!initialized && (!stored || stored.length === 0)) {
      const initial = sanitizeTemplatesList(DEFAULT_TEMPLATES);
      await rawStorageSet({
        [STORAGE_KEY]: initial,
        [HAS_INITIALIZED_KEY]: true,
      });
      return initial;
    }

    if (Array.isArray(stored)) {
      const sanitized = sanitizeTemplatesList(stored);
      let migrated = false;
      const defaultMap = new Map(DEFAULT_TEMPLATES.map((t) => [t.id, t]));

      const updated = sanitized.map((item) => {
        const legacyContent = LEGACY_INACTIVITY_CONTENTS[item.id];
        const nextDefault = defaultMap.get(item.id);
        if (legacyContent && nextDefault && item.content === legacyContent) {
          migrated = true;
          return {
            ...item,
            content: nextDefault.content,
            updatedAt: nextDefault.updatedAt,
          };
        }
        return item;
      });

      if (migrated) {
        await rawStorageSet({ [STORAGE_KEY]: updated });
      }
      return updated;
    }

    return [];
  } catch (err) {
    console.error('[OctaBlaster] Falha crítica ao carregar modelos:', err);
    return sanitizeTemplatesList(DEFAULT_TEMPLATES);
  }
}

/**
 * Persiste a lista completa de modelos com sanitização rigorosa.
 */
export async function saveStoredTemplates(templates: QuickReplyTemplate[]): Promise<QuickReplyTemplate[]> {
  const cleanList = sanitizeTemplatesList(templates);
  await rawStorageSet({
    [STORAGE_KEY]: cleanList,
    [HAS_INITIALIZED_KEY]: true,
  });
  return cleanList;
}

/**
 * Restaura os modelos de fábrica mantendo modelos personalizados criados pelo usuário.
 */
export async function resetToDefaultTemplates(currentTemplates: QuickReplyTemplate[]): Promise<QuickReplyTemplate[]> {
  const defaultIds = new Set(DEFAULT_TEMPLATES.map((t) => t.id));
  const userTemplates = currentTemplates.filter((t) => !defaultIds.has(t.id));
  const combined = [...DEFAULT_TEMPLATES, ...userTemplates];
  return await saveStoredTemplates(combined);
}

/**
 * Exporta a lista de modelos para download em JSON via Data URI seguro.
 */
export function exportTemplatesToJson(templates: QuickReplyTemplate[]): void {
  const cleanList = sanitizeTemplatesList(templates);
  const dataStr = JSON.stringify(cleanList, null, 2);
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `octablaster-templates-${dateStr}.json`;

  const dataUri = `data:application/json;charset=utf-8,${encodeURIComponent(dataStr)}`;
  const a = document.createElement('a');
  a.href = dataUri;
  a.download = filename;
  a.style.display = 'none';

  document.body.appendChild(a);
  a.click();

  setTimeout(() => {
    try {
      if (a.parentNode) {
        document.body.removeChild(a);
      }
    } catch {}
  }, 1000);
}

/**
 * Processa e valida texto JSON importado pelo usuário.
 */
export function parseTemplatesFromJson(jsonText: string): QuickReplyTemplate[] {
  let parsed: any;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error('Arquivo JSON inválido ou corrompido.');
  }

  if (!Array.isArray(parsed)) {
    throw new Error('O arquivo deve conter uma lista (array) de modelos.');
  }

  const validItems = sanitizeTemplatesList(parsed);
  if (validItems.length === 0) {
    throw new Error('Nenhum modelo válido encontrado no arquivo JSON.');
  }

  return validItems;
}

/**
 * Mescla modelos importados com os existentes, substituindo duplicidades de ID
 * e adicionando novos itens no topo.
 */
export async function mergeImportedTemplates(
  current: QuickReplyTemplate[],
  incoming: QuickReplyTemplate[]
): Promise<{ count: number; merged: QuickReplyTemplate[] }> {
  const map = new Map<string, QuickReplyTemplate>();

  // Adiciona itens existentes
  for (const t of current) {
    map.set(t.id, t);
  }

  // Mescla os novos (preservando ordem e atualizando)
  let count = 0;
  for (const item of incoming) {
    map.set(item.id, item);
    count++;
  }

  const merged = Array.from(map.values());
  const saved = await saveStoredTemplates(merged);
  return { count, merged: saved };
}
