import test from 'node:test';
import assert from 'node:assert/strict';
import { findFocus, frameComposition } from '../public/composition.js';

test('контрастная деталь у края остаётся внутри кадра, подпись уходит на другую сторону', () => {
  const size = 48, pixels = new Uint8ClampedArray(size * size * 4);
  assert.deepEqual(findFocus(pixels, size, 2), { x:.5, y:.5, ratio:2 });
  for (let y=31; y<43; y++) for (let x=1; x<9; x++) pixels[4*(size*y+x)] = 250;
  const focus = findFocus(pixels, size, 2), layout = frameComposition({focus}, 'calm');
  assert.ok(focus.x < .25 && focus.y > .6);
  const displayedX = (focus.x - layout.x * .6) / .4;
  assert.ok(displayedX >= 0 && displayedX <= 1);
  assert.equal(layout.align, 'right');
  assert.equal(layout.top, true);
  assert.deepEqual(frameComposition({}, 'dream'), {x:.5,y:.5,top:false,align:'left'});
});
