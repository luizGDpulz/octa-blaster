import test from 'node:test';
import assert from 'node:assert/strict';
import {assertReplyFactsPreserved} from '../services/ai/replyFacts.ts';

test('declared IP and ports survive formatting changes and sentence punctuation',()=>{
 const draft='IP do servidor: 20.206.161.75\nPorta servidor: 11291\nPorta Push: 9956';
 assert.doesNotThrow(()=>assertReplyFactsPreserved(draft,'Servidor: 20.206.161.75. Porta: 11291. Push: 9956.'));
});
test('instructions mentioning a value are not mistaken for declared fields',()=>{
 assert.doesNotThrow(()=>assertReplyFactsPreserved('Não informe a porta 9956. Peça o endereço IP.','Qual é o endereço IP?'));
});
