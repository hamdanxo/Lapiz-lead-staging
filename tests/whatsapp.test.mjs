import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { webhookAuthorized, messageText, planMessage, parseStateSync } from '../lib/whatsapp.js';

const cfg = { mayurNumbers: ['971564221423'], keywords: ['need', 'quotation', 'epoxy'], ignoreNumbers: ['971501111111', '0502222222'] };
const filtered = { id: 'f1', status: 'filtered' };
const draft = { id: 'd1', status: 'draft' };

test('Mayur keeps working as before, even if his number is on the ignore list', () => {
  const c = { ...cfg, ignoreNumbers: [...cfg.ignoreNumbers, '971564221423'] };
  assert.deepEqual(planMessage({ sender: '971564221423', text: '/lead ABC needs grout', known: true }, c),
    { kind: 'insert', source: 'Mayur', status: 'draft', text: 'ABC needs grout' });
  assert.deepEqual(planMessage({ sender: '971564221423', text: 'call Ahmed' }, c), { kind: 'followup', text: 'call Ahmed' });
});

test('known people are not saved', () => {
  assert.equal(planMessage({ sender: '971509999999', text: 'need 40 bags', known: true }, cfg).kind, 'ignore');
  assert.equal(planMessage({ sender: '971501111111', text: 'need 40 bags' }, cfg).kind, 'ignore');
  assert.equal(planMessage({ sender: '971502222222', text: 'need 40 bags' }, cfg).kind, 'ignore'); // 050 form in the list
  // even if they already have an open entry
  assert.equal(planMessage({ sender: '971501111111', text: 'need 40 bags', existing: filtered }, cfg).kind, 'ignore');
});

test('a new number is a potential lead: Filtered out, or Drafts with a keyword', () => {
  assert.deepEqual(planMessage({ sender: '971503333333', text: 'hello' }, cfg),
    { kind: 'insert', source: 'WhatsApp', status: 'filtered', text: 'hello' });
  assert.deepEqual(planMessage({ sender: '971503333333', text: 'need quotation' }, cfg),
    { kind: 'insert', source: 'WhatsApp', status: 'draft', text: 'need quotation' });
});

test('one entry per number: later messages are appended, a keyword promotes it', () => {
  assert.deepEqual(planMessage({ sender: '971503333333', text: 'are you open', existing: filtered }, cfg),
    { kind: 'append', id: 'f1', text: 'are you open', promote: false });
  assert.deepEqual(planMessage({ sender: '971503333333', text: 'need epoxy for 200 sqm', existing: filtered }, cfg),
    { kind: 'append', id: 'f1', text: 'need epoxy for 200 sqm', promote: true });
  // already in Drafts: nothing to promote
  assert.deepEqual(planMessage({ sender: '971503333333', text: 'need more', existing: draft }, cfg),
    { kind: 'append', id: 'd1', text: 'need more', promote: false });
});

test('contacts sync payload is parsed into add/remove lists', () => {
  const value = { state_sync: [
    { type: 'contact', action: 'add', contact: { full_name: 'Ali Supplier', first_name: 'Ali', phone_number: '+971 50 123 4567' } },
    { type: 'contact', action: 'remove', contact: { phone_number: '971509876543' } },
    { type: 'contact', action: 'add', contact: { first_name: 'Short', phone_number: '123' } },  // junk, skipped
    { type: 'something_else', action: 'add' },
  ] };
  assert.deepEqual(parseStateSync(value), {
    add: [{ phone: '971501234567', name: 'Ali Supplier' }],
    remove: [{ phone: '971509876543' }],
  });
  assert.deepEqual(parseStateSync({}), { add: [], remove: [] });
});

const body = '{"object":"whatsapp_business_account","entry":[]}';
const sign = (secret, text) => 'sha256=' + crypto.createHmac('sha256', secret).update(text).digest('hex');

test('signature check when an app secret is set', () => {
  const env = { WHATSAPP_APP_SECRET: 's3cret' };
  assert.equal(webhookAuthorized({ rawBody: body, signature: sign('s3cret', body) }, env), true);
  assert.equal(webhookAuthorized({ rawBody: body, signature: sign('wrong', body) }, env), false);
  assert.equal(webhookAuthorized({ rawBody: body + ' ', signature: sign('s3cret', body) }, env), false);
  assert.equal(webhookAuthorized({ rawBody: body, signature: '' }, env), false);
  // A URL key does not bypass the signature when a secret is configured.
  assert.equal(webhookAuthorized({ rawBody: body, signature: '', key: 'k' }, { ...env, WHATSAPP_WEBHOOK_KEY: 'k' }), false);
});

test('URL key check when only a key is set', () => {
  const env = { WHATSAPP_WEBHOOK_KEY: 'a-long-random-key' };
  assert.equal(webhookAuthorized({ rawBody: body, key: 'a-long-random-key' }, env), true);
  assert.equal(webhookAuthorized({ rawBody: body, key: 'a-long-random-kez' }, env), false);
  assert.equal(webhookAuthorized({ rawBody: body, key: '' }, env), false);
  assert.equal(webhookAuthorized({ rawBody: body }, env), false);
});

test('nothing configured = nothing accepted', () => {
  assert.equal(webhookAuthorized({ rawBody: body, signature: 'sha256=abc', key: 'anything' }, {}), false);
  assert.equal(webhookAuthorized({ rawBody: body }, { WHATSAPP_APP_SECRET: '', WHATSAPP_WEBHOOK_KEY: '' }), false);
});

test('message text from each kind of message', () => {
  assert.equal(messageText({ type: 'text', text: { body: 'need 40 bags' } }), 'need 40 bags');
  assert.equal(messageText({ type: 'image', image: { caption: 'site photo' } }), 'site photo');
  assert.equal(messageText({ type: 'document', document: { filename: 'BOQ.pdf' } }), 'BOQ.pdf');
  assert.equal(messageText({ type: 'document', document: { caption: 'quote please', filename: 'x.pdf' } }), 'quote please');
  assert.equal(messageText({ type: 'button', button: { text: 'Yes' } }), 'Yes');
  assert.equal(messageText({ type: 'audio' }), '[audio message]');
  assert.equal(messageText({}), '[unknown message]');
});
