import { startAiPanelBridge } from '@/services/octadesk/aiPanelBridge';
import { initEditorContext } from '@/services/octadesk/editorContext';
import { startTicketWidgetLifecycle } from '@/services/octadesk/ticketWidget';
import { startReplyAssistance } from '@/services/octadesk/aiReply';
import { startSummaryLifecycle } from '@/services/octadesk/aiSummaryLifecycle';

export default defineContentScript({
  matches: ['*://app.octadesk.com/*', '*://*.octadesk.com/*'],
  allFrames: true,
  matchAboutBlank: true,
  runAt: 'document_idle',
  main() {
    console.log('[OctaBlaster] Content script inicializado no frame:', window.location.href);
    const editorContext = initEditorContext(document);
    startAiPanelBridge(document, editorContext);
    startTicketWidgetLifecycle(editorContext, document);
    startSummaryLifecycle(document);
    startReplyAssistance(document);
  },
});
