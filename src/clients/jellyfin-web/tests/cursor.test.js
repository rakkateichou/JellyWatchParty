const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const JWP = require('./setup.js');

require('../presence/cursor.js');

const video = {
  getBoundingClientRect: () => ({
    left: 100,
    top: 50,
    right: 900,
    bottom: 500,
    width: 800,
    height: 450
  })
};

describe('shared cursor video coordinates', () => {
  it('normalizes a pointer position against the video rectangle', () => {
    const point = JWP.cursor.pointFromEvent({ clientX: 300, clientY: 275 }, video);
    assert.deepEqual(point, { x: 0.25, y: 0.5 });
  });

  it('ignores pointer positions outside the video', () => {
    assert.equal(JWP.cursor.pointFromEvent({ clientX: 99, clientY: 275 }, video), null);
    assert.equal(JWP.cursor.pointFromEvent({ clientX: 300, clientY: 501 }, video), null);
  });
});
