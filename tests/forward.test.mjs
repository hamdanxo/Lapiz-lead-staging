import test from 'node:test';
import assert from 'node:assert/strict';
import { baseSubject, isForward, emailsIn, forwardedSalesman } from '../lib/text.js';

const users = [
  { id: '1', name: 'Rafi Mohammad', email: 'rafi@lapizblue.com' },
  { id: '2', name: 'Hareesh', email: 'hareesh@lapizblue.com' },
  { id: '3', name: 'Tarun Shukla', email: 'tarun.s@lapizblue.com' },
];
const subj = 'Inquiry for Decoration and Finishing Materials – Khazna 1.5GW Solar PV Project';

test('subject helpers', () => {
  assert.equal(baseSubject('RE: Fwd:  Quote  for villa'), 'quote for villa');
  assert.ok(isForward('Fwd: x')); assert.ok(isForward('FW: x')); assert.ok(isForward('RE: FW: x'));
  assert.ok(!isForward('RE: x')); assert.ok(!isForward('x'));
  assert.deepEqual(emailsIn('&lt;Rafi@LapizBlue.com&gt;, Bob <b@x.ae>'), ['rafi@lapizblue.com', 'b@x.ae']);
});

test('finds the salesman a lead was forwarded to', () => {
  const sent = [{ subject: `Fwd: ${subj}`, fromAddress: 'tarun.s@lapizblue.com', toAddress: '&lt;rafi@lapizblue.com&gt;', sentDateInGMT: '100' }];
  assert.equal(forwardedSalesman(subj, sent, users).name, 'Rafi Mohammad');
});

test('ignores replies, unrelated mail and the sender himself', () => {
  const sent = [
    { subject: `RE: ${subj}`, fromAddress: 'tarun.s@lapizblue.com', toAddress: 'hareesh@lapizblue.com' },
    { subject: 'Fwd: something else', fromAddress: 'tarun.s@lapizblue.com', toAddress: 'hareesh@lapizblue.com' },
    { subject: `Fwd: ${subj}`, fromAddress: 'tarun.s@lapizblue.com', toAddress: 'customer@gmail.com', ccAddress: 'tarun.s@lapizblue.com' },
  ];
  assert.equal(forwardedSalesman(subj, sent, users), null);
});

test('latest forward wins', () => {
  const sent = [
    { subject: `Fwd: ${subj}`, fromAddress: 'tarun.s@lapizblue.com', toAddress: 'hareesh@lapizblue.com', sentDateInGMT: '100' },
    { subject: `FW: ${subj}`, fromAddress: 'tarun.s@lapizblue.com', toAddress: 'rafi@lapizblue.com', sentDateInGMT: '200' },
  ];
  assert.equal(forwardedSalesman(subj, sent, users).id, '1');
});

import { normalizeUaePhone } from '../lib/text.js';
test('phone typed as +971 050 keeps working', () => {
  assert.equal(normalizeUaePhone('9710504369028'), '+971504369028');
  assert.equal(normalizeUaePhone('+971 050 436 9028'), '+971504369028');
  assert.equal(normalizeUaePhone('050 436 9028'), '+971504369028');
});

import { findTrn } from '../lib/text.js';
test('finds a TRN in document text', () => {
  assert.equal(findTrn('Tax Registration Number (TRN): 100 2345 6789 0003'), '100234567890003');
  assert.equal(findTrn('TRN 100234567890003.'), '100234567890003');
  assert.equal(findTrn('Phone 0501234567, licence 1234567'), null);
  assert.equal(findTrn('account 2100234567890003999'), null);
  assert.equal(findTrn('Licence 0001918990 TRN 105293774300003 Mobile 971505113196'), '105293774300003');
  assert.equal(findTrn('Tax Registration Number. Date of Issue 15/05/2026 ... 105293774300003'), '105293774300003');
});
