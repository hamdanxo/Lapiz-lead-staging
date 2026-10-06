import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { webhookAuthorized, messageText } from '../lib/whatsapp.js';

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
