import { rememberWritingLocally, writingProfile, saveWritingPreferences, clearWriting, AI_BEHAVIOR_KEY } from '@/services/ai/writingMemory';
export const WRITING_ACTIONS = ['AI_WRITING_STATE', 'AI_WRITING_SAVE', 'AI_WRITING_CLEAR', 'AI_WRITING_LEARN'];
export async function handleWritingMessage(message: any, extensionPage: boolean, ticketPage: boolean) {
        if(['AI_WRITING_STATE','AI_WRITING_SAVE','AI_WRITING_CLEAR'].includes(message.action)){
          if(!extensionPage)throw new Error('Abra as configurações de escrita na extensão.');
          const [tab]=await browser.tabs.query({active:true,currentWindow:true});
          let validTab=false;try{const url=new URL(tab?.url || '');validTab=url.protocol==='https:'&&(url.hostname==='app.octadesk.com'||url.hostname.endsWith('.octadesk.com'));}catch{}
          if(!tab || !validTab || !Number.isInteger(tab.id))throw new Error('Abra um ticket do Octadesk e clique no campo de resposta.');
          const key=`octablaster_editor_${tab.id}`,data=await browser.storage.local.get([key]),target=data[key] as {frameId?:number;editorToken?:string}|undefined;
          if(!target || typeof target.frameId!=='number' || !Number.isInteger(target.frameId) || typeof target.editorToken!=='string')throw new Error('Clique no campo de resposta do ticket e atualize esta tela.');
          let source;
          try {
            source=await browser.tabs.sendMessage(tab.id!,{action:'AI_WRITING_CONTEXT',editorToken:target.editorToken},{frameId:target.frameId});
          } catch {
            throw new Error('A conexão com o ticket foi interrompida. Atualize a página do Octadesk, clique no campo de resposta e depois em Atualizar atendente.');
          }
          if(!source?.success || !/^[a-f0-9]{64}$/.test(source.data?.identity || '') || typeof source.data?.label!=='string')throw new Error(source?.error || 'Não foi possível confirmar o atendente do ticket.');
          if(!(await browser.tabs.get(tab.id!)).active)throw new Error('A aba mudou. Volte ao ticket e atualize esta tela.');
          const identity=source.data.identity;
          if(message.action!=='AI_WRITING_STATE' && message.identity!==identity)throw new Error('O atendente ou a conexão mudou. Atualize esta tela antes de salvar.');
          if(message.action==='AI_WRITING_SAVE'){
            if(typeof message.learnWriting!=='boolean')throw new Error('Opção de aprendizado inválida.');
            await saveWritingPreferences(identity,message.preferences);
            const behavior=(await browser.storage.local.get([AI_BEHAVIOR_KEY]))[AI_BEHAVIOR_KEY] || {};
            await browser.storage.local.set({[AI_BEHAVIOR_KEY]:{...behavior,learnWriting:message.learnWriting}});
          }
          if(message.action==='AI_WRITING_CLEAR')await clearWriting(identity);
          return {identity,label:source.data.label.slice(0,160),...await writingProfile(identity)};
        }
        if (message.action === 'AI_WRITING_LEARN') {
          if (!ticketPage || typeof message.identity !== 'string' || !/^[a-f0-9]{64}$/.test(message.identity) || typeof message.text !== 'string' || message.text.length > 50000) throw new Error('Aprendizado de escrita inválido.');
          await rememberWritingLocally(message.identity, message.text); return { saved: true };
        }
}
