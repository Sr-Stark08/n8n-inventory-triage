import fs from 'fs';
const load = (f) => new Function('$input', '$', '$getWorkflowStaticData', 'return (async()=>{' + fs.readFileSync(f, 'utf8') + '})()');
const validate = load('nodes/validate.js'), guard = load('nodes/guardrails.js');
const store = {};
const sd = () => store;
const inp = (json) => ({ first: () => ({ json }) });
let pass = 0, fail = 0;
const check = (name, cond) => { cond ? pass++ : (fail++, console.log('FAIL', name)); };

async function run(body, modelJsonTail) {
  const v = (await validate(inp({ body }), null, sd))[0].json;
  if (v.skip) return v;
  const claude = { content: [{ type: 'text', text: modelJsonTail }] };
  const $ = (name) => ({ first: () => ({ json: v }) });
  return (await guard(inp(claude), $, sd))[0].json;
}
const m = (o) => 'Here it is:\n```json\n' + JSON.stringify(o) + '\n```';

let r = await run({ message_id: 'a1', text: 'Se gastaron 10 cascos en faena norte' }, m({ intent: 'stock_movement', sku: 'EPP-CASCO', type: 'out', quantity: 10, confidence: 0.95, needs_human: false }));
check('ok movement', r.status === 'ok' && r.action.quantity === 10);
r = await run({ message_id: 'a1', text: 'Se gastaron 10 cascos en faena norte' }, 'x');
check('duplicate', r.status === 'duplicate');
r = await run({ message_id: 'a2', text: 'Se gastaron cascos' }, m({ intent: 'stock_movement', sku: 'EPP-CASCO', type: 'out', quantity: 5, confidence: 0.9 }));
check('invented qty escalates', r.status === 'escalated' && /does not appear/.test(r.reason));
r = await run({ message_id: 'a3', text: 'cuantos guantes quedan' }, m({ intent: 'stock_query', sku: 'EPP-GUANTE', confidence: 0.92 }));
check('stock query ok', r.status === 'ok' && r.action.intent === 'stock_query' && r.action.quantity === undefined);
r = await run({ message_id: 'a4', text: 'saquen 3 martillos' }, m({ intent: 'stock_movement', sku: 'HER-MARTILLO', type: 'out', quantity: 3, confidence: 0.9 }));
check('unknown sku escalates', r.status === 'escalated' && /catalog/.test(r.reason));
r = await run({ message_id: 'a5', text: 'hola' }, 'not json');
check('bad json escalates', r.status === 'escalated');
r = await run({ message_id: 'a6', text: 'algo raro 2' }, m({ intent: 'stock_movement', sku: 'EPP-CASCO', type: 'out', quantity: 2, confidence: 0.4 }));
check('low confidence escalates', /low confidence/.test(r.reason));
r = await run({ message_id: 'a7', text: 'quiero hablar con alguien' }, m({ intent: 'other', confidence: 0.9, reason: 'user asks for a person' }));
check('other escalates', r.status === 'escalated');
r = await run({ text: 'sin id' }, 'x');
check('missing id rejected', r.status === 'rejected');
r = await run({ message_id: 'a8', text: 'llegaron 120 sacos' }, m({ intent: 'stock_movement', sku: 'MAT-CEMENTO', type: 'in', quantity: 12, confidence: 0.9 }));
check('partial number (12 vs 120) escalates', r.status === 'escalated');
console.log(`${pass} passed, ${fail} failed`);
