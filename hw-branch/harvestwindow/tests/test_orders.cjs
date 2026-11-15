const assert = require('node:assert/strict');
const { allocateOrder } = require('../dashboard/orders.js');
const dates = ['2024-11-05', '2024-11-06', '2024-11-07', '2024-11-08'];
function roomsFor(supplies) {
  return Object.fromEntries(supplies.map((values, i) => {
    const points = [0, ...values].map((value, day) => ({ date: dates[day], sellable: value, sellableLow: value / 2 }));
    return ['Room' + i, { prior: { points }, after: { points }, forecastInputs: { density: 100 } }];
  }));
}
function brute(supplies, capacity, quantity) {
  let best = 0;
  function visit(room, total) {
    if (room === supplies.length) { best = Math.max(best, Math.min(quantity, total.reduce((s,x) => s + Math.min(x,capacity),0))); return; }
    visit(room + 1, total);
    for (let day = 0; day < 3; day++) { const next = [...total]; next[day] += supplies[room][day]; visit(room + 1, next); }
  }
  visit(0, [0,0,0]); return best;
}
let seed = 42;
const random = n => { seed = (1664525 * seed + 1013904223) >>> 0; return seed % n; };
for (let iteration = 0; iteration < 100; iteration++) {
  const supplies = Array.from({length: 4}, () => Array.from({length: 3}, () => random(90)));
  const capacity = random(100) + 1, quantity = random(250) + 1;
  const result = allocateOrder(roomsFor(supplies), quantity, dates[3], capacity, 1, false, false);
  assert.equal(result.fulfilled, brute(supplies, capacity, quantity));
  assert.equal(new Set(result.allocation.map(row => row.room)).size, result.allocation.length);
  for (const day of dates) assert(result.allocation.filter(row => row.day === day).reduce((s,row) => s + row.quantity,0) <= capacity);
  for (const row of result.allocation) assert(row.quantity <= row.forecastSupply && row.quantity > 0);
  assert.equal(result.remaining + result.fulfilled, quantity);
  const conservative = allocateOrder(roomsFor(supplies), quantity, dates[3], capacity, 1, true, false);
  assert(conservative.fulfilled <= result.fulfilled);
}
assert.equal(allocateOrder(roomsFor([[1,99,99]]), 99, dates[3],100,1,false,false).fulfilled,99);
console.log('Order optimizer: 100 randomized exhaustive comparisons and constraints passed.');
