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
  assert.deepEqual(classifyWhatsApp('971564221423', 'hi', cfg), { source: 'Mayur', status: 'draft' });
});

test('Customer with keyword is a draft, without is filtered', () => {
  assert.deepEqual(classifyWhatsApp('971501111111', 'bhai need 40 bags', cfg), { source: 'WhatsApp', status: 'draft' });
  assert.deepEqual(classifyWhatsApp('971501111111', 'good morning', cfg), { source: 'WhatsApp', status: 'filtered' });
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
