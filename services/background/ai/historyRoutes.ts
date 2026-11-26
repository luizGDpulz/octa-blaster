export const HISTORY_ACTIONS = ['AI_CHAT_LIST', 'AI_CHAT_LOAD', 'AI_CHAT_SAVE', 'AI_CHAT_DRAFT', 'AI_CHAT_MESSAGES', 'AI_HISTORY_STATS'];
export async function handleHistoryMessage(message: any, sender: any, extensionPage: boolean, chats: any) {
  if(message.action==='AI_HISTORY_STATS'){if(!extensionPage)throw new Error('Abra o histórico na extensão.');return chats.stats();}
  if (message.action === 'AI_CHAT_LIST') {
    if (!extensionPage) throw new Error('Abra as conversas na extensão.');
    return chats.list('local',{cursor:message.cursor,query:message.query,limit:message.limit});
  }
  if (!extensionPage) {
    const url = new URL(sender.url || sender.tab.url);
    if (url.protocol !== 'https:' || !(url.hostname === 'app.octadesk.com' || url.hostname.endsWith('.octadesk.com'))) throw new Error('Frame não autorizado.');
  }
  return chats.handle(message.action, message.key, message.revision, message.content, message.options || (message.action==='AI_CHAT_LOAD'?{limit:60}:{}));
}
