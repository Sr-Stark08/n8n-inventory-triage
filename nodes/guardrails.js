// Parse Claude's output and apply guardrails before anything is trusted.
const original = $('Validate & dedupe').first().json;
const raw = $input.first().json;
const fullText = (raw.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('');
// Take only the JSON object, even if the model wraps it in text or code fences.
const start = fullText.indexOf('{');
const end = fullText.lastIndexOf('}');
const modelText = start >= 0 && end > start ? fullText.slice(start, end + 1) : '';

const escalate = (reason, extra = {}) => ({
  status: 'escalated',
  needs_human: true,
  reason,
  message_id: original.message_id,
  text: original.text,
  ...extra,
});

let result;
let data;
try {
  data = JSON.parse(modelText);
} catch (e) {
  result = escalate('model output is not valid JSON');
}

if (!result) {
  const INTENTS = ['stock_movement', 'stock_query', 'other'];
  const SKUS = ['EPP-CASCO', 'EPP-GUANTE', 'EPP-LENTE', 'FLT-ACEITE', 'MAT-CEMENTO'];
  const confidence = Number(data.confidence);

  if (!INTENTS.includes(data.intent)) {
    result = escalate(`unknown intent: ${data.intent}`);
  } else if (!(confidence >= 0 && confidence <= 1)) {
    result = escalate('missing or invalid confidence');
  } else if (data.intent === 'other' || data.needs_human === true) {
    result = escalate(data.reason || 'model requested a human', { intent: data.intent });
  } else if (confidence < 0.7) {
    result = escalate(`low confidence (${confidence})`, { intent: data.intent });
  } else if (!SKUS.includes(data.sku)) {
    result = escalate(`SKU not in catalog: ${data.sku}`, { intent: data.intent });
  } else if (data.intent === 'stock_movement') {
    const qty = data.quantity;
    if (!Number.isInteger(qty) || qty <= 0) {
      result = escalate('quantity must be a positive whole number', { intent: data.intent });
    } else if (!['in', 'out'].includes(data.type)) {
      result = escalate('movement type must be in or out', { intent: data.intent });
    } else if (!new RegExp(`\\b${qty}\\b`).test(original.text)) {
      // The model may not invent numbers: the quantity must literally appear in the user's message.
      result = escalate(`quantity ${qty} does not appear in the message`, { intent: data.intent });
    }
  }

  if (!result) {
    result = {
      status: 'ok',
      needs_human: false,
      message_id: original.message_id,
      action: {
        intent: data.intent,
        sku: data.sku,
        ...(data.intent === 'stock_movement' ? { type: data.type, quantity: data.quantity } : {}),
        confidence,
      },
    };
  }
}

// Remember the outcome only after processing, so a failed run can be retried safely.
const store = $getWorkflowStaticData('global');
store.processed = store.processed || {};
store.processed[original.message_id] = { status: result.status, at: new Date().toISOString() };
const keys = Object.keys(store.processed);
if (keys.length > 500) for (const k of keys.slice(0, keys.length - 500)) delete store.processed[k];

return [{ json: result }];
