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

  it('curves through sampled trail points instead of drawing sharp segments', () => {
    assert.equal(
      JWP.cursor.trailPath([{ x: 0, y: 0 }, { x: 12, y: 12 }, { x: 24, y: 0 }]),
      'M 0.0,0.0 C 1.6,1.6 8.8,12.0 12.0,12.0 C 15.2,12.0 22.4,1.6 24.0,0.0'
    );
  });

  it('draws a colored trail and removes it with the cursor on release', () => {
    const appended = [];
    const makeStyle = () => ({ setProperty() {} });
    const makeSvgNode = (tag) => ({
      tag,
      removed: false,
      attributes: {},
      style: makeStyle(),
      classList: { add() {} },
      setAttribute(name, value) { this.attributes[name] = value; },
      appendChild(child) { this.child = child; },
      remove() { this.removed = true; }
    });
    const cursorName = { textContent: '' };
    const cursorElement = {
      removed: false,
      style: { left: '', top: '', setProperty() {} },
      classList: { add() {} },
      setAttribute() {},
      querySelector: () => cursorName,
      remove() { this.removed = true; }
    };
    globalThis.window.innerWidth = 1000;
    globalThis.window.innerHeight = 600;
    globalThis.document = {
      createElement: () => cursorElement,
      createElementNS: (_namespace, tag) => makeSvgNode(tag),
      body: { appendChild(element) { appended.push(element); } }
    };
    JWP.state.clientId = 'local-client';
    JWP.utils.getVideo = () => video;
    JWP.utils.userColor = () => '#ff55aa';

    JWP.cursor.receive({
      client: 'remote-client',
      payload: { visible: true, x: 0.25, y: 0.5, username: 'Polina' }
    });
    JWP.cursor.receive({
      client: 'remote-client',
      payload: { visible: true, x: 0.5, y: 0.5, username: 'Polina' }
    });

    const trail = appended.find(element => element.tag === 'svg');
    assert.ok(trail);
    assert.equal(trail.child.tag, 'path');
    assert.equal(trail.child.attributes.d, 'M 300.0,275.0 L 500.0,275.0');

    JWP.cursor.receive({
      client: 'remote-client',
      payload: { visible: false, username: 'Polina' }
    });
    assert.equal(trail.removed, true);
    assert.equal(cursorElement.removed, true);
  });
});
