import test from 'node:test';
import assert from 'node:assert/strict';
import { createProfile, recordAction } from '../src/utils/feed.mjs';
import { withPendingActions, createProductActionQueue } from '../src/utils/optimistic-actions.mjs';

const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => {resolve=a;reject=b;}); return {promise,resolve,reject}; };
const intent = (id, action, at = '2026-10-18T10:00:00Z') => ({id, productId:'A000000001',action,createdAt:at});
test('hearts update immediately before a slow write completes; rollback removes just the failed intent', () => {
  const base = createProfile();
  const pending = [intent('first','like'), {...intent('other','like'), productId:'A000000002'}];
  assert.deepEqual(withPendingActions(base,pending).likes,['A000000001','A000000002']);
  assert.deepEqual(withPendingActions(base,pending.slice(1)).likes,['A000000002']);
  assert.deepEqual(base.likes,[]);
});
test('rapid like/unlike intent stays authoritative despite a later server timestamp', () => {
  const base = recordAction(createProfile(),'A000000001','like',intent('confirmed','like','2026-10-18T10:00:05Z'));
  assert.deepEqual(withPendingActions(base,[intent('second','unlike')]).likes,[]);
});
test('same-product writes are ordered, different products save concurrently, failed writes release queue', async () => {
  const first = deferred(); const calls=[];
  const enqueue = createProductActionQueue((id,action) => {calls.push([id,action]); return action==='like'?first.promise:Promise.resolve(action);});
  const like = enqueue('a','like'); const unlike=enqueue('a','unlike'); const other=enqueue('b','skip');
  await other;
  assert.deepEqual(calls,[['a','like'],['b','skip']]);
  first.reject(new Error('offline')); await assert.rejects(like,/offline/);
  assert.equal(await unlike,'unlike');
  assert.deepEqual(calls.at(-1),['a','unlike']);
});
