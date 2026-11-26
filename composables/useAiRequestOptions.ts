import { computed, ref } from 'vue';
import type { AiConfig, AiGenerationOptions } from '@/types/ai';
import { aiMessage } from '@/services/ai/messageClient';
import { reasoningChoices, reasoningFields } from '@/services/ai/api/reasoning';
import { resolveOutputLimit } from '@/services/ai/api/outputLimits';
import { parseRequestOptions } from '@/services/ai/requestOptions';

/** Escolhas só do compositor atual; não altera conexão nem persiste parâmetros no chat. */
export function useAiRequestOptions() {
  const config=ref<AiConfig|null>(null),loading=ref(false),error=ref('');
  const options=ref<AiGenerationOptions>({maxOutputTokens:null,reasoning:'auto'});
  const provider=computed(()=>config.value?.provider || 'compatible');
  const model=computed(()=>config.value?.providers[provider.value].model || 'Conexão de IA');
  function reset(){options.value={maxOutputTokens:provider.value==='claude'?8192:null,reasoning:'auto'};}
  async function refresh(){
    loading.value=true;error.value='';
    try{
      const next:AiConfig=await aiMessage('AI_CONFIG');
      const changed=config.value?.revision!==next.revision;config.value=next;
      if(changed)reset();
    }catch(failure){error.value=failure instanceof Error?failure.message:'Não foi possível ler a conexão.';}
    finally{loading.value=false;}
  }
  const validation=computed(()=>{
    if(error.value)return error.value;
    if(!config.value)return 'Carregando a conexão…';
    try{
      const parsed=parseRequestOptions(options.value);
      const limit=resolveOutputLimit(provider.value,parsed?.maxOutputTokens,'chat');
      reasoningFields(provider.value,model.value,parsed?.reasoning,limit);
      return '';
    }catch(failure){return failure instanceof Error?failure.message:'Opções inválidas.';}
  });
  return {options,provider,model,loading,validation,refresh,reset,
    choices:computed(()=>reasoningChoices(provider.value,model.value)),
    snapshot(){if(validation.value)throw new Error(validation.value);return {generation:parseRequestOptions(JSON.parse(JSON.stringify(options.value))),configRevision:config.value!.revision};},
  };
}
