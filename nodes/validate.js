// Validate input and reject duplicates (idempotency by message_id).
const body = $input.first().json.body ?? {};
const messageId = String(body.message_id ?? '').trim();
const text = String(body.text ?? '').trim();

if (!messageId || !text) {
  return [{ json: { skip: true, status: 'rejected', reason: 'message_id and text are required' } }];
}
if (text.length > 1000) {
  return [{ json: { skip: true, status: 'rejected', reason: 'message too long (max 1000 chars)', message_id: messageId } }];
}

const store = $getWorkflowStaticData('global');
store.processed = store.processed || {};
if (store.processed[messageId]) {
  return [{ json: { skip: true, status: 'duplicate', message_id: messageId, original_result: store.processed[messageId] } }];
}

return [{ json: { skip: false, message_id: messageId, from: body.from ?? null, text } }];
