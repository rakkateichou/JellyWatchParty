(() => {
  const JWP = window.JellyWatchParty = window.JellyWatchParty || {};
  const h = JWP._wsHandlers = JWP._wsHandlers || {};
  const state = JWP.state;
  const utils = JWP.utils;
  const ui = JWP.ui;
  const { SEEK_THRESHOLD } = JWP.constants;

  const positionServerTs = (msg) => {
    const payloadTs = Number(msg.payload?.sample_server_ts ?? msg.payload?.state_server_ts);
    const envelopeTs = Number(msg.server_ts);
    if (Number.isFinite(payloadTs)
        && (!Number.isFinite(envelopeTs) || Math.abs(payloadTs - envelopeTs) < 5000)) {
      return payloadTs;
    }
    return Number.isFinite(envelopeTs) ? envelopeTs : utils.getServerNow();
  };

  const applyRoomState = (msg) => {
    const previousRoomId = state.roomId;
    if (previousRoomId !== msg.room) state.panelCollapsed = false;
    if (previousRoomId !== msg.room && ui.resetPreparedInvite) {
      ui.resetPreparedInvite();
    }
    state.inRoom = true;
    state.roomId = msg.room;
    state.roomName = msg.payload.name;
    state.roomHostId = msg.payload.host_id || '';
    state.isRoomOwner = msg.payload.is_owner === true;
    state.roomMediaId = msg.payload.media_id || '';
    if (msg.payload.invite_url) {
      state.inviteRoomId = msg.room;
      state.inviteBaseUrl = msg.payload.invite_url;
      state.invitePromise = null;
    }
    state.participantCount = msg.payload.participant_count;
    if (!state.clientId && msg.client) {
      state.clientId = msg.client;
    }
    state.isHost = (msg.payload.host_id === state.clientId);
    state.waitingForTitle = !state.roomMediaId && (!state.isHost || state.guestMode);
    const joiningAsFollower = !state.isHost
      && !!msg.payload.media_id
      && (state.roomJoinPending || state.roomJoinActive || state.inviteJoinActive);
    state.roomJoinPending = false;
    if (joiningAsFollower) {
      state.roomJoinActive = true;
      JWP.playback?.holdJoinPlayback?.();
      JWP.app?.setJoinLaunchScreen?.(true);
    } else if (state.isHost || state.waitingForTitle) {
      if (state.waitingForTitle) {
        state.roomJoinActive = true;
        JWP.playback?.holdJoinPlayback?.();
      }
      state.roomJoinActive = false;
      JWP.playback?.releaseJoinPlayback?.();
      JWP.app?.setJoinLaunchScreen?.(false);
    }
    if (JWP.chat && Array.isArray(msg.payload.chat_history)) {
      JWP.chat.hydrate(msg.payload.chat_history);
    }
    if (!state.hasTimeSync && typeof msg.server_ts === 'number') {
      state.serverOffsetMs = msg.server_ts - utils.nowMs();
      state.hasTimeSync = true;
    }
    if (msg.payload && msg.payload.state) {
      state.lastSyncServerTs = positionServerTs(msg);
      state.lastSyncPosition = typeof msg.payload.state.position === 'number'
        ? msg.payload.state.position
        : 0;
      state.lastSyncPlayState = msg.payload.state.play_state || 'paused';
    }
    if (JWP.p2p?.syncPeers) {
      JWP.p2p.syncPeers(msg.payload.peer_ids || []);
    }

    // Accountless invitations and signed-in follower joins both reveal the
    // right-side chat. A room creator/host retains their existing panel view.
    if (state.inviteJoinActive || state.guestMode || state.roomJoinActive || state.waitingForTitle) {
      const panel = document.getElementById(JWP.constants.PANEL_ID);
      if (panel && !state.panelCollapsed) panel.classList.remove('hide');
      if (state.inviteJoinActive) state.inviteJoinActive = false;
    }
    if (JWP.guestLockdown?.enforceSoon) JWP.guestLockdown.enforceSoon(100);
  };

  const rememberRemoteState = (msg) => {
    const payload = msg.payload || {};
    const playbackState = payload.state || payload;
    state.lastSyncServerTs = positionServerTs(msg);
    state.lastSyncPosition = typeof playbackState.position === 'number'
      ? playbackState.position
      : 0;
    state.lastSyncPlayState = playbackState.play_state || 'paused';
  };

  const applyInitialTracks = (payload, mediaId) => {
    if (!JWP.playback?.applyInitialTracks) return Promise.resolve(false);
    return Promise.resolve(JWP.playback.applyInitialTracks(payload, mediaId));
  };

  const finishRoomJoin = () => {
    if (!state.roomJoinActive) return;
    state.roomJoinActive = false;
    state.inviteJoinActive = false;
    JWP.playback?.releaseJoinPlayback?.();
    JWP.app?.setJoinLaunchScreen?.(false);
  };

  const applyAuthoritativePlayback = (video, targetPos, hostPlaying) => {
    const joining = state.roomJoinActive;
    utils.startSyncing();

    // During entry, stop first and seek second. This prevents a guest from
    // consuming the beginning of the episode while the seek is loading, and
    // makes a paused host land on the same still frame immediately.
    if (joining && !video.paused) video.pause();
    // Seeking outside the buffered range synchronously drops readyState to 1.
    // Open the prepared native route first, or a paused room stays on details
    // and the navigation guard incorrectly launches the title again.
    JWP.playback?.openReadyPlayer?.(video);
    if (Math.abs(video.currentTime - targetPos) > 0.35) video.currentTime = targetPos;

    // Release the bootstrap pause gate only after both the seek and the host's
    // play/pause decision have been written to the native player.
    if (joining) finishRoomJoin();
    if (hostPlaying) {
      video.play().catch(() => ui.showToast?.('Tap Play to continue the watch party.'));
    } else if (!video.paused) {
      video.pause();
    }
  };

  const switchToMedia = (msg) => {
    if (state.isHost || !msg.payload?.media_id) return false;
    const mediaId = msg.payload.media_id;
    if (!/^[a-f0-9]{32}$/i.test(mediaId)) return false;

    const localId = utils.getCurrentItemId();
    const isActiveVideo = JWP.playback?.isVideoPage
      ? JWP.playback.isVideoPage()
      : /^#\/(?:video|playback)(?:[/?]|$)/i.test(window.location.hash || '') && !!utils.getVideo();
    if (state.roomMediaId === mediaId && localId === mediaId && isActiveVideo) return false;

    state.roomMediaId = mediaId;
    if (state.waitingForTitle) {
      state.waitingForTitle = false;
      state.roomJoinActive = true;
      JWP.playback?.holdJoinPlayback?.();
      JWP.app?.setJoinLaunchScreen?.(true);
      ui.updateWaitingRoom?.();
    }
    state.readyRoomId = '';
    state.isInitialSync = true;
    state.initialSyncUntil = utils.nowMs() + JWP.constants.INITIAL_SYNC_MAX_MS;
    rememberRemoteState(msg);
    const changeToken = ++state.mediaChangeToken;

    if (JWP.playback?.ensurePlayback) JWP.playback.ensurePlayback(mediaId);

    let attempts = 0;
    let tracksSettled = false;
    let tracksPending = false;
    const settle = () => {
      if (changeToken !== state.mediaChangeToken || !state.inRoom) return;
      attempts += 1;
      const video = utils.getVideo();
      if (utils.getCurrentItemId() !== mediaId || !video || video.readyState < 2) {
        if (attempts < 800) setTimeout(settle, 150);
        else ui.showToast('Open the next episode to continue the watch party.');
        return;
      }

      if (!tracksSettled) {
        if (tracksPending) return;
        tracksPending = true;
        applyInitialTracks(msg.payload, mediaId).finally(() => {
          tracksPending = false;
          tracksSettled = true;
          setTimeout(settle, 50);
        });
        return;
      }

      const target = state.lastSyncPlayState === 'playing'
        ? utils.adjustedPosition(state.lastSyncPosition, state.lastSyncServerTs)
        : state.lastSyncPosition;
      applyAuthoritativePlayback(video, target, state.lastSyncPlayState === 'playing');
      if (JWP.playback?.watchReady) JWP.playback.watchReady();
    };
    setTimeout(settle, 150);
    return true;
  };

  const syncToRoom = (msg, video) => {
    if (state.waitingForTitle) return;
    if (!video || state.isHost || !msg.payload?.state) return;
    const basePos = msg.payload.state.position || 0;
    const hostPlaying = msg.payload.state.play_state === 'playing';
    const targetPos = hostPlaying
      ? utils.adjustedPosition(basePos, positionServerTs(msg))
      : basePos;
    utils.log('CLIENT', {
      type: 'room_state',
      msg_pos: basePos,
      target_pos: targetPos,
      video_pos: video.currentTime,
      gap: targetPos - video.currentTime,
      play_state: msg.payload.state.play_state
    });
    if (hostPlaying) {
      const { INITIAL_SYNC_COOLDOWN_MS, INITIAL_SYNC_MAX_MS } = JWP.constants;
      const now = utils.nowMs();
      state.isInitialSync = true;
      state.initialSyncUntil = now + INITIAL_SYNC_MAX_MS;
      state.syncCooldownUntil = now + INITIAL_SYNC_COOLDOWN_MS;
      state.initialSyncTargetPos = targetPos;
      utils.log('CLIENT', { type: 'initial_sync_started', cooldown: INITIAL_SYNC_COOLDOWN_MS, max: INITIAL_SYNC_MAX_MS, targetPos });
    }
    if (Math.abs(video.currentTime - targetPos) <= SEEK_THRESHOLD && !state.roomJoinActive) {
      // Preserve steady-state playback when the room snapshot is already close;
      // entry uses the tighter threshold in applyAuthoritativePlayback.
      utils.startSyncing();
      if (hostPlaying && video.paused) video.play().catch(() => {});
      else if (!hostPlaying && !video.paused) video.pause();
      return;
    }
    applyAuthoritativePlayback(video, targetPos, hostPlaying);
  };

  h.handleRoomState = (msg, video) => {
    if (state.guestClosedMessage) return;
    state.reconnecting = false;
    applyRoomState(msg);
    ui.render();
    if (state.isHost && !state.guestMode && ui.prepareInviteLink) {
      ui.prepareInviteLink().catch(err => {
        console.warn('[JellyWatchParty] Invite pre-generation failed:', err);
      });
    }
    if (!state.isHost && msg.payload?.media_id) {
      if (switchToMedia(msg)) return;
      if (JWP.playback?.applyInitialTracks) {
        applyInitialTracks(msg.payload, msg.payload.media_id).finally(() => {
          syncToRoom(msg, utils.getVideo() || video);
        });
        return;
      }
    }
    syncToRoom(msg, video);
  };

  h.handleStateUpdate = (msg, video) => {
    if (state.isHost) return;
    if (msg.payload?.media_id && switchToMedia(msg)) return;
    if (state.waitingForTitle) return;
    if (msg.payload?.media_id) {
      applyInitialTracks(msg.payload, msg.payload.media_id);
    }
    if (!video) return;
    if (msg.payload?.play_state === 'paused' && state.pendingPlayUntil) {
      if (state.pendingActionTimer) clearTimeout(state.pendingActionTimer);
      state.pendingActionTimer = null;
      state.pendingPlayUntil = 0;
      state.syncStatus = 'synced';
      ui.updateSyncIndicator?.();
    }
    if (msg.payload?.play_state === 'playing' && state.pendingPlayUntil > utils.getServerNow()) return;
    if (msg.payload) {
      state.lastSyncPlayState = msg.payload.play_state || state.lastSyncPlayState;
    }
    if (msg.payload.play_state === 'playing' && video.paused) {
      utils.startSyncing();
      video.play().catch(() => {});
      state.lastSyncServerTs = utils.getServerNow();
      state.lastSyncPosition = video.currentTime;
      state.syncCooldownUntil = utils.nowMs() + 2000;
      return;
    } else if (msg.payload.play_state === 'paused' && !video.paused) {
      utils.startSyncing();
      state.syncCooldownUntil = 0;
      state.isInitialSync = false;
      state.initialSyncUntil = 0;
      state.initialSyncTargetPos = 0;
      video.pause();
    }
    if (state.isBuffering || !utils.isVideoReady()) return;
    if (state.syncCooldownUntil && utils.nowMs() < state.syncCooldownUntil) {
      return;
    }
    if (msg.payload) {
      state.lastSyncServerTs = positionServerTs(msg);
      state.lastSyncPosition = typeof msg.payload.position === 'number'
        ? msg.payload.position
        : state.lastSyncPosition;
    }
  };
})();
