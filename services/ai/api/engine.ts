import type { AiSummaryInput } from '@/types/ai';
import type { ApiStore, RemoteRef } from './state';
import { supportsRemoteState } from './catalog';
import { compactTicketContext } from './context';
import { GENERAL_INSTRUCTIONS, INSTRUCTIONS_VERSION, TICKET_INSTRUCTIONS } from './instructions';
import { enqueueDeletes, expireSessions } from './retention';
import { digest, validateInput } from './validation';
import { generateProvider } from './providers/index';
import { ProviderError, type HttpOptions } from './transport';
import { boundedChat } from '../summaryRequest';
import { createQueryTimer, timingClock } from '../queryTiming';
import { resolveOutputLimit } from './outputLimits';
import { parseRequestOptions } from '../requestOptions';
import { reasoningFields } from './reasoning';

export function createApiEngine(store: ApiStore, options: HttpOptions = {}, now = Date.now, clock = timingClock) {
  let queue: Promise<unknown> = Promise.resolve();
  return {
    generate(input: AiSummaryInput, signal: AbortSignal) {
      const timer = createQueryTimer(clock, 'queueMs');
      const task = queue.then(async () => {
        timer.phase('preparationMs');
        const history = validateInput(input);
        if (signal.aborted) throw new Error('Solicitação cancelada.');
        const snapshot = await store.update(state => expireSessions(state, now()));
        const { provider, providers } = snapshot.config, config = providers[provider];
        if (input.configRevision !== undefined && input.configRevision !== snapshot.revision) throw new Error('A conexão mudou. Reabra o chat para atualizar as opções antes de enviar.');
        const generation = parseRequestOptions(input.generation) || { maxOutputTokens: provider === 'claude' ? 8192 : null };
        const maxOutputTokens = resolveOutputLimit(provider, generation?.maxOutputTokens, input.task);
        reasoningFields(provider, config.model, generation?.reasoning, maxOutputTokens);
        if (!config.apiKey || !config.model || !config.baseUrl) throw new Error('Configure o endereço, modelo e chave em Inteligência artificial → Conexões de API.');
        if (provider === 'nvidia' && !config.approvedData) throw new Error('Confirme nas configurações que seu endpoint NVIDIA permite os dados de atendimento.');
        const key = input.task === 'summary_latest' ? undefined : input.conversationKey;
        const previous = key ? snapshot.sessions[key] : undefined;
        const credentialId = await digest(config.apiKey);
        const fingerprint = await digest([INSTRUCTIONS_VERSION, provider, config.model, config.baseUrl, credentialId, input.context, input.task === 'general', generation || {}]);
        const remoteStore = !!key && supportsRemoteState(provider) && config.remoteStore;
        const reusable = ['chat', 'general'].includes(input.task) && remoteStore && previous?.fingerprint === fingerprint
          && previous.historyDigest === await digest(history) && previous.turns < 12 && previous.refs.length > 0;
        const previousId = reusable ? previous.refs.at(-1)?.id : undefined;
        if (previous && !reusable && key) await store.update(state => {
          const sessions = { ...state.sessions }; delete sessions[key];
          return enqueueDeletes({ ...state, sessions }, previous.refs);
        });
        const context = input.task === 'chat' && !previousId
          ? compactTicketContext(input.context, input.instruction, previous?.fingerprint === fingerprint ? previous.memo : '') : input.context;
        let result;
        try {
          timer.phase('apiMs');
          result = await generateProvider(provider, config, {
            instructions: input.task === 'general' ? GENERAL_INSTRUCTIONS : TICKET_INSTRUCTIONS,
            prompt: JSON.stringify({ ...(previousId ? {} : { contexto: context }), pergunta: input.instruction }),
            history: previousId ? [] : history, previousId, remoteStore,
            maxOutputTokens, reasoning: generation?.reasoning,
          }, { ...options, signal });
        } catch (error) {
          timer.phase('finalizationMs');
          if (previousId && error instanceof ProviderError && error.status === 404 && key) await store.update(state => {
            const sessions = { ...state.sessions }; delete sessions[key];
            return enqueueDeletes({ ...state, sessions }, previous?.refs || []);
          });
          throw error;
        }
        timer.phase('finalizationMs');
        if (remoteStore && (!result.id || !/^[a-zA-Z0-9_-]{1,256}$/.test(result.id))) throw new Error('A API não retornou um identificador de contexto válido.');
        const ref: RemoteRef[] = remoteStore && result.id ? [{ id: result.id, provider, baseUrl: config.baseUrl, credentialId }] : [];
        const historyDigest = await digest(boundedChat([...(input.task === 'summary_full' ? [] : history),
          { role: 'user', content: input.instruction }, { role: 'assistant', content: result.text }]));
        let discarded = false;
        await store.update(state => {
          if (signal.aborted || state.revision !== snapshot.revision) { discarded = true; return enqueueDeletes(state, ref); }
          if (!key) return state;
          return { ...state, sessions: { ...state.sessions, [key]: {
            fingerprint, historyDigest, refs: [...(reusable ? previous!.refs : []), ...ref], turns: reusable ? previous!.turns + 1 : 1,
            memo: input.task === 'summary_full' ? result.text.slice(0, 4000) : previous?.fingerprint === fingerprint ? previous.memo : '',
            createdAt: previous?.fingerprint === fingerprint ? previous.createdAt : now(), usedAt: now(),
          } } };
        });
        if (discarded) throw new Error('A consulta foi cancelada ou a conexão mudou. Envie novamente quando desejar.');
        return { text: result.text, contextMode: previousId ? 'remote' : remoteStore ? 'remote-created' : context.length < input.context.length ? 'compact' : 'full', contextTruncated: !previousId && context.length < input.context.length, timing: timer.snapshot() };
      }).catch(error => { throw Object.assign(error instanceof Error ? error : new Error('Falha na consulta à IA.'), { timing: timer.snapshot() }); });
      queue = task.catch(() => {});
      return task;
    },
  };
}
