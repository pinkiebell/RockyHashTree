
global.fs = require('fs');
global.RockyHashTree = require('./RockyHashTree.js').RockyHashTree;

//const CHARS = '0123456789abcdefghijklmnopqrstuvwxyz';
const CHARS = '0123456789abcdef';
const DEPTH = 192;
const tree = new RockyHashTree(CHARS, DEPTH);
const len = 24 << 8;
const expected = [];
const k = 'b2f178e652767fc1175f908439948625c99fd37516ab8a2f32f527ff2e4875f9';

let now = Date.now();

for (let i = 0; i < len; i++) {
  const v = 'cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce47d0d13c5d85f2b0ff8318d2877eec2f63b931bd47417a81a538327af927da3e' + i;

  expected.push(v);
  if (!tree.commit(k, v)) {
    console.log('commit error', i);
  }
}

console.log('tree buffer length', tree.buffer.length);
console.log('commit time', Date.now() - now);

let results = [];

function onLookup(res, isDone) {
  if (res.length !== 0) {
    results = results.concat(res);

    var len = res.length;
    for (var i = 0; i < len; i++) {
      if (expected.indexOf(res[i]) === -1) {
        console.log('fail:', res[i]);
      }
    }
  }
  if (!isDone) {
    return;
  }
  res = results;
  console.log('lookup time', Date.now() - now);
  var fail = res.length !== expected.length;
  var failCount = 0;
  var len = res.length;
  for (var i = 0; i < len; i++) {
    if (expected.indexOf(res[i]) === -1) {
      fail = true;
      failCount++;
      console.log('fail:', res[i]);
    }
  }
  console.log(`failed=${fail} failCount=${failCount} recoverd=${res.length} expected=${expected.length}`);
}

now = Date.now();
tree.lookup(k, onLookup, this);
