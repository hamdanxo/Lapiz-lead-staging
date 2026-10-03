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
