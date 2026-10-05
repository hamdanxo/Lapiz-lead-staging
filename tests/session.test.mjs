import test from 'node:test';
import assert from 'node:assert/strict';

test('login cookie: valid, tampered, expired, code changed', async () => {
  process.env.APP_PIN = '482913'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'x';
  const { makeToken, tokenOk } = await import('../lib/session.js');
  const t = await makeToken();
  assert.equal(await tokenOk(t), true);
  assert.equal(await tokenOk(t.slice(0, -1) + (t.endsWith('0') ? '1' : '0')), false);
  assert.equal(await tokenOk(`${Date.now() - 1000}.${t.split('.')[1]}`), false);
  assert.equal(await tokenOk(''), false);
  process.env.APP_PIN = '591024';
  assert.equal(await tokenOk(t), false); // changing the code logs everyone out
});
