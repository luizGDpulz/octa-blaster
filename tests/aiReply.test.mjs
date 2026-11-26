import test from 'node:test';
import assert from 'node:assert/strict';
import { installDom, installStorage } from './helpers.mjs';
import { startReplyAssistance } from '../services/octadesk/aiReply.ts';
import { AI_BEHAVIOR_KEY, AI_WRITING_KEY, writingIdentity, writingGuidance, rememberWriting, cleanupWriting } from '../services/ai/writingMemory.ts';
import { withoutGeneratedSignature } from '../services/ai/replySignature.ts';
import { collectAiTicketContext } from '../services/octadesk/aiTicketContext.ts';
const settle = () => new Promise(resolve => setTimeout(resolve, 60));
async function submitGuidance(dom, direction = 'Explique a solução de forma breve e cordial.') {
  const field = dom.document.querySelector('.octa-reply-guidance'); field.value = direction;
  dom.document.querySelector('.octa-reply-guidance-form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  for (let attempt = 0; attempt < 100 && field.disabled; attempt++) await new Promise(resolve => setTimeout(resolve, 20));
}
function fixture() {
  const storage = installStorage();
  const dom = installDom('<form ticket="ticket"><h2>Ticket A</h2><div class="content-comment-interaction">Pedido do cliente A</div><div class="comment-panel"><bexs-thumb user-logged><img alt="Agente ficticio"></bexs-thumb><div ng-if="ticketViewModel.typeInteractionSelected == 2"><div class="note-editable" contenteditable="true"><p><br></p></div></div></div><button type="button" class="btn-save">Enviar</button></form><section ticket-id="B"><div class="content-comment-interaction">SEGREDO B</div></section>');
  dom.window.HTMLElement.prototype.getBoundingClientRect = () => ({ top: 400, bottom: 600, left: 20, right: 820, width: 800, height: 200 });
  const editor = dom.document.querySelector('.note-editable');
  return { ...dom, data: storage.data, editor, restore() { dom.restore(); storage.restore(); } };
}
test('learning waits for a newly published matching draft and stores only numeric writing patterns', async () => {
  const dom = fixture(), stop = startReplyAssistance(dom.document);
  try {
    const user = await writingIdentity(dom.editor);
    dom.editor.innerHTML = '<p>Bom dia, cliente@example.com.</p><p>Por favor, confira o numero do banco para continuarmos o atendimento.</p>';
    dom.document.querySelector('.btn-save').click(); await settle(); assert.equal(dom.data[AI_WRITING_KEY], undefined);
    const published = dom.document.createElement('div'); published.className = 'content-comment-interaction'; published.innerHTML = dom.editor.innerHTML; dom.document.querySelector('form').append(published); await settle();
    assert.equal(dom.data[AI_WRITING_KEY][user].count, 1);
    assert.ok(!JSON.stringify(dom.data[AI_WRITING_KEY]).includes('cliente@example.com'));
    assert.equal(await writingGuidance(user), '');
    await rememberWriting(user, 'Boa tarde!\nPor favor, confirme as informacoes solicitadas.');
    await rememberWriting(user, 'Ola!\nPodemos conferir os dados para continuar o atendimento.');
    assert.match(await writingGuidance(user), /Padrões de escrita/);
    dom.data[AI_BEHAVIOR_KEY] = { learnWriting: false }; assert.equal(await writingGuidance(user), '');
    await rememberWriting(user, 'Nao deve aprender com esta resposta enviada.'); assert.equal(dom.data[AI_WRITING_KEY][user].count, 3);
  } finally { stop(); dom.restore(); }
});

test('writing identities isolate workspace users and cleanup removes expired patterns', async () => {
  const dom = fixture();
  try {
    const first = await writingIdentity(dom.editor);
    dom.document.querySelector('bexs-thumb img').alt = 'Outro agente';
    const other = await writingIdentity(dom.editor); assert.notEqual(first, other);
    dom.data[AI_WRITING_KEY] = { [first]: { count: 3, words: 12, paragraphs: 2, greeting: 1, closing: 0, updated: Date.now() - 91 * 86400000 }, [other]: { count: 3, words: 20, paragraphs: 2, greeting: 1, closing: 0, updated: Date.now() } };
    assert.equal(await writingGuidance(first), ''); await cleanupWriting();
    assert.equal(dom.data[AI_WRITING_KEY][first], undefined); assert.ok(dom.data[AI_WRITING_KEY][other]);
    dom.document.querySelector('bexs-thumb img').remove(); assert.equal(await writingIdentity(dom.editor), null);
  } finally { dom.restore(); }
});

test('truncating a long email retains its author metadata and never labels an unknown author as the agent', () => {
  const dom = fixture();
  try {
    dom.document.querySelector('.content-comment-interaction').outerHTML = `<interaction-comment><header><span class="comment-title">Pessoa Cliente (Cliente) | Mensagem</span></header><div class="content-comment-interaction">${'x'.repeat(60000)}</div></interaction-comment>`;
    const context = collectAiTicketContext(dom.editor); assert.ok(context.context.length <= 50000); assert.equal(context.truncated, true); assert.match(context.context, /"autor":"Pessoa Cliente","papel":"cliente\/solicitante"/);
    dom.document.querySelector('.comment-title').textContent = 'Pessoa sem classificação | Mensagem';
    assert.match(collectAiTicketContext(dom.editor).context, /não identificado; não inferir pela assinatura/);
  } finally { dom.restore(); }
});

test('signature filter handles standard and markdown closings without deleting a generic cordial sentence', () => {
  for (const closing of ['Atenciosamente,', '**Atenciosamente,**', 'Att.', 'Cordialmente,']) assert.deepEqual(withoutGeneratedSignature(`Resposta útil.\n\nFico à disposição!\n\n${closing}\nEquipe da Empresa Cliente`), { text: 'Resposta útil.\n\nFico à disposição!', removed: true });
  assert.deepEqual(withoutGeneratedSignature('Resposta útil.\n\nEquipe de Suporte Empresa Cliente'), { text: 'Resposta útil.', removed: true });
  assert.deepEqual(withoutGeneratedSignature('Resposta útil.\n\nFico à disposição!'), { text: 'Resposta útil.\n\nFico à disposição!', removed: false });
});
