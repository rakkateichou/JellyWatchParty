const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const JWP = require('./setup.js');

// playback/tracks.js needs utils.getPlaybackManager/getVideo (utils/video.js)
// and utils.startSyncing (already loaded by setup.js via utils/time.js).
require('../utils/video.js');
require('../playback/tracks.js');

const { TRACK_SWITCH_SUPPRESS_MS } = JWP.constants;

const makePlaybackManager = () => ({
  audioIndex: 0,
  subtitleIndex: -1,
  getAudioStreamIndex() { return this.audioIndex; },
  getSubtitleStreamIndex() { return this.subtitleIndex; },
  setAudioStreamIndex(index) { this.audioIndex = index; this.lastAudioIndex = index; this.audioCalls = (this.audioCalls || 0) + 1; },
  setSubtitleStreamIndex(index) { this.subtitleIndex = index; this.lastSubtitleIndex = index; this.subtitleCalls = (this.subtitleCalls || 0) + 1; }
});

describe('playback/tracks patchTrackSwitching', () => {
  beforeEach(() => {
    document.querySelector = () => null; // no <video> element in these tests
    window.playbackManager = makePlaybackManager();
    JWP.state.isHost = false;
    JWP.state.inRoom = false;
    JWP.state.isSyncing = false;
    JWP.state.roomId = 'room-1';
    JWP.state.roomMediaId = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    JWP.state.initialTrackSyncKey = '';
    JWP.actions = { send() {} };
  });

  it('wraps setAudioStreamIndex/setSubtitleStreamIndex and still calls the original', () => {
    JWP.playback.patchTrackSwitching();
    window.playbackManager.setAudioStreamIndex(2);
    window.playbackManager.setSubtitleStreamIndex(3);
    assert.equal(window.playbackManager.lastAudioIndex, 2);
    assert.equal(window.playbackManager.lastSubtitleIndex, 3);
    assert.equal(window.playbackManager.audioCalls, 1);
    assert.equal(window.playbackManager.subtitleCalls, 1);
  });

  it('suppresses sync broadcasting when the host switches tracks while in a room', () => {
    JWP.playback.patchTrackSwitching();
    JWP.state.isHost = true;
    JWP.state.inRoom = true;
    window.playbackManager.setAudioStreamIndex(1);
    assert.equal(JWP.state.isSyncing, true);
  });

  it('does not touch isSyncing when not host', () => {
    JWP.playback.patchTrackSwitching();
    JWP.state.isHost = false;
    JWP.state.inRoom = true;
    window.playbackManager.setSubtitleStreamIndex(0);
    assert.equal(JWP.state.isSyncing, false);
  });

  it('does not touch isSyncing when host but not in a room', () => {
    JWP.playback.patchTrackSwitching();
    JWP.state.isHost = true;
    JWP.state.inRoom = false;
    window.playbackManager.setAudioStreamIndex(1);
    assert.equal(JWP.state.isSyncing, false);
  });

  it('does not double-wrap when patched twice', () => {
    JWP.playback.patchTrackSwitching();
    JWP.playback.patchTrackSwitching();
    window.playbackManager.setAudioStreamIndex(5);
    assert.equal(window.playbackManager.audioCalls, 1);
  });

  it('captures the host audio and subtitle stream indices', () => {
    window.playbackManager.audioIndex = 2;
    window.playbackManager.subtitleIndex = -1;

    assert.deepEqual(JWP.playback.getTrackSnapshot(), {
      audio_stream_index: 2,
      subtitle_stream_index: -1
    });
  });

  it('applies the host tracks once and preserves later guest choices', async () => {
    JWP.state.inRoom = true;
    const mediaId = JWP.state.roomMediaId;

    await JWP.playback.applyInitialTracks({
      state: {
        audio_stream_index: 2,
        subtitle_stream_index: 4
      }
    }, mediaId);

    assert.equal(window.playbackManager.audioIndex, 2);
    assert.equal(window.playbackManager.subtitleIndex, 4);
    window.playbackManager.setAudioStreamIndex(5);

    await JWP.playback.applyInitialTracks({
      audio_stream_index: 2,
      subtitle_stream_index: 4
    }, mediaId);

    assert.equal(window.playbackManager.audioIndex, 5);
    assert.equal(window.playbackManager.audioCalls, 2);
    assert.equal(window.playbackManager.subtitleCalls, 1);
  });

  it('preserves the guest selection across later episodes in the room', async () => {
    JWP.state.inRoom = true;
    await JWP.playback.applyInitialTracks({
      audio_stream_index: 1,
      subtitle_stream_index: -1
    }, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    window.playbackManager.setAudioStreamIndex(5);
    window.playbackManager.setSubtitleStreamIndex(8);
    await JWP.playback.applyInitialTracks({
      audio_stream_index: 3,
      subtitle_stream_index: 6
    }, 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');

    assert.equal(window.playbackManager.audioIndex, 5);
    assert.equal(window.playbackManager.subtitleIndex, 8);
  });

  it('publishes a host track change for future joiners', async () => {
    const sent = [];
    JWP.state.isHost = true;
    JWP.state.inRoom = true;
    JWP.actions = { send(type, payload) { sent.push({ type, payload }); } };
    JWP.utils.getCurrentItemId = () => JWP.state.roomMediaId;
    JWP.playback.patchTrackSwitching();

    window.playbackManager.setAudioStreamIndex(7);
    await new Promise(resolve => setTimeout(resolve, 10));

    assert.equal(sent.length, 1);
    assert.equal(sent[0].type, 'state_update');
    assert.equal(sent[0].payload.audio_stream_index, 7);
    assert.equal(sent[0].payload.subtitle_stream_index, -1);
  });
});

describe('utils.startSyncing custom duration', () => {
  it('respects a custom ms argument', () => {
    JWP.state.isSyncing = false;
    JWP.utils.startSyncing(TRACK_SWITCH_SUPPRESS_MS);
    assert.equal(JWP.state.isSyncing, true);
  });
});
