"""Temporary room for browser QA. Run on the server; never prints credentials.

Write select, play, pause, seek, close, or finish to <stage>/browser-command.
The invite starts empty. select grants the first movie and pauses at 42 seconds.
The room and temporary guest are removed on exit or after 15 minutes.
"""
import argparse
import json
from pathlib import Path
import select
import time
import validate_waiting_room_live as check
from validate_jwp_series_sync import connect_and_auth, message


def main(stage):
    admin, user = check.admin_session()
    host = None
    room = share_id = None
    command_file = stage / 'browser-command'
    try:
        title = check.items(admin, user, Recursive='true', IncludeItemTypes='Movie', IsVirtualItem='false', Limit=1)[0]
        media = title['Id'].replace('-', '').lower()
        host = connect_and_auth(check.container_ip('jwp-session'), 3000, check.request('/JellyWatchParty/Token', admin)['token'])
        host.send(message('create_room', payload={'media_id': '', 'start_pos': 0, 'user_name': 'Browser verification owner'}))
        room = host.receive_type('room_state')['room']
        invitation = check.request('/ShareLinks/Admin/Create', admin, {'partyId': room, 'itemId': None, 'mediaId': None, 'expiryHours': 1, 'oneUse': False})
        share_id = invitation['Record']['Id']
        host.send(message('invite_update', room, {'invite_url': invitation['ShareUrl']}))
        print(json.dumps({'browser_invite': invitation['ShareUrl']}), flush=True)
        deadline, ping_at = time.monotonic() + 900, 0
        while time.monotonic() < deadline:
            if time.monotonic() >= ping_at:
                host.send(message('ping', payload={'client_ts': int(time.time() * 1000)}))
                ping_at = time.monotonic() + 15
            if command_file.exists():
                command = command_file.read_text().strip()
                command_file.unlink()
                if command == 'finish':
                    break
                if command == 'select':
                    updated = check.request('/ShareLinks/Admin/Create', admin, {'partyId': room, 'itemId': media, 'mediaId': media, 'expiryHours': 1, 'oneUse': False})
                    assert updated['ShareUrl'] == invitation['ShareUrl']
                    host.send(message('state_update', room, {'media_id': media, 'position': 42, 'play_state': 'paused'}))
                elif command == 'close':
                    host.send(message('delete_room', room))
                elif command in ('play', 'pause', 'seek'):
                    host.send(message('player_event', room, {'action': command, 'media_id': media, 'position': 72 if command == 'seek' else 42, 'play_state': 'playing' if command == 'play' else 'paused'}))
                print('Applied browser command: ' + command, flush=True)
            if host.buffer or select.select([host.socket], [], [], .2)[0]:
                received = host.receive()
                if received.get('type') == 'error':
                    raise RuntimeError(received['payload']['message'])
    finally:
        if host and room:
            try:
                host.send(message('delete_room', room))
                host.receive_type('room_closed')
            except Exception:
                pass
        if host:
            host.close()
        if share_id:
            result = check.request('/ShareLinks/Admin/Revoke/' + share_id, admin, {})
            assert not result.get('CleanupError')
        print('Browser verification room and guest cleaned up', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('stage', type=Path)
    main(parser.parse_args().stage.resolve())
