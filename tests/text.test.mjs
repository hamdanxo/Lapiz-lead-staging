import test from 'node:test';
import assert from 'node:assert/strict';
import { samePhone, classifyWhatsApp, matchesKeyword, nextInRotation, normCompany, stripHtml } from '../lib/text.js';

const cfg = { mayurNumbers: ['971564221423'], keywords: ['need', 'bags', 'sqm', 'mapei', 'm2'] };

test('Mayur number matches in any format', () => {
  assert.ok(samePhone('971564221423', '+971 56 422 1423'));
  assert.ok(samePhone('0564221423', '971564221423'));
  assert.ok(!samePhone('971502814338', '971564221423'));
});

test('Mayur always a draft, even with no keyword', () => {
  assert.deepEqual(classifyWhatsApp('971564221423', 'hi bro', cfg), { source: 'Mayur', status: 'followup', text: 'hi bro' });
  assert.deepEqual(classifyWhatsApp('971564221423', '/lead ABC Contracting needs 50 bags Mapei', cfg), { source: 'Mayur', status: 'draft', text: 'ABC Contracting needs 50 bags Mapei' });
  assert.equal(classifyWhatsApp('971564221423', 'ABC needs grout /LEAD', cfg).status, 'draft');
  assert.equal(classifyWhatsApp('971564221423', '#lead: site in JVC', cfg).text, 'site in JVC');
  assert.equal(classifyWhatsApp('971564221423', 'call me about the leader board', cfg).status, 'followup');
});

test('Customer with keyword is a draft, without is filtered', () => {
  assert.deepEqual(classifyWhatsApp('971501111111', 'bhai need 40 bags', cfg), { source: 'WhatsApp', status: 'draft', text: 'bhai need 40 bags' });
  assert.deepEqual(classifyWhatsApp('971501111111', 'good morning', cfg), { source: 'WhatsApp', status: 'filtered', text: 'good morning' });
});

test('Keywords match whole words only', () => {
  assert.ok(matchesKeyword('Need MAPEI adhesive', cfg.keywords));
  assert.ok(matchesKeyword('200 m2 area', cfg.keywords));
  assert.ok(!matchesKeyword('needless to say', cfg.keywords));
  assert.ok(!matchesKeyword('handbags', cfg.keywords));
});

test('Round robin cycles', () => {
  let r = { ids: ['a', 'b', 'c'], next: 0 };
  const out = [];
  for (let i = 0; i < 4; i++) { const p = nextInRotation(r); out.push(p.id); r = p.rotation; }
  assert.deepEqual(out, ['a', 'b', 'c', 'a']);
  assert.equal(nextInRotation({ ids: [], next: 0 }).id, null);
});

test('Company names normalise for duplicate check', () => {
  assert.equal(normCompany('Al Habtoor Trading LLC'), normCompany('al habtoor'));
});

test('HTML stripped to text', () => {
  assert.equal(stripHtml('<p>Hi&nbsp;there</p><br>Qty 40'), 'Hi there\nQty 40');
});

import { normalizeUaePhone, validTrn } from '../lib/text.js';

test('UAE phone: accepts common formats, returns +971', () => {
  for (const v of ['0501234567', '050 123 4567', '501234567', '+971 50 123 4567', '971501234567', '00971501234567']) {
    assert.equal(normalizeUaePhone(v), '+971501234567', v);
  }
  assert.equal(normalizeUaePhone('04 123 4567'), '+97141234567');
  assert.equal(normalizeUaePhone('02-1234567'), '+97121234567');
});

test('UAE phone: rejects wrong numbers', () => {
  for (const v of ['12345', '0501234', '05012345678', '+91 98765 43210', '0812345678', 'abc', '']) {
    assert.equal(normalizeUaePhone(v), null, v);
  }
});

test('TRN must be exactly 15 digits', () => {
  assert.ok(validTrn('100123456700003'));
  assert.ok(validTrn('100 1234 5670 0003'));
  assert.ok(!validTrn('10012345670000'));
  assert.ok(!validTrn('1001234567000034'));
  assert.ok(!validTrn('10012345670000A'));
});
