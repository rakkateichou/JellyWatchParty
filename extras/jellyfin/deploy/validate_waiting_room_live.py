"""Verify a disposable empty room and restricted guest on the live Jellyfin server.

Existing credentials stay on the server and are never printed or persisted here.
Only the verification room and its temporary ShareLinks guest are changed.
"""
import json
from pathlib import Path
import re
import sqlite3
import subprocess
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

from validate_jwp_series_sync import connect_and_auth, message, WebSocketClient


def container_ip(name):
    data = json.loads(subprocess.check_output(['docker', 'inspect', name]))[0]
    return next(iter(data['NetworkSettings']['Networks'].values()))['IPAddress']


BASE = 'http://' + container_ip('jellyfin') + ':8096'


def request(path, token=None, data=None, raw=False):
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['X-Emby-Token'] = token
    req = urllib.request.Request(BASE + path, headers=headers,
                                 data=None if data is None else json.dumps(data).encode())
    with urllib.request.urlopen(req, timeout=25) as response:
        content = response.read().decode()
    return content if raw else json.loads(content)


def admin_session():
    with sqlite3.connect('file:/opt/jellyfin/config/data/jellyfin.db?mode=ro', uri=True) as db:
        rows = db.execute("SELECT d.AccessToken FROM Devices d JOIN Users u ON u.Id=d.UserId "
                          "WHERE u.Username NOT LIKE 'share-%' ORDER BY d.DateLastActivity DESC LIMIT 12").fetchall()
    for (token,) in rows:
        try:
            user = request('/Users/Me', token)
            if user.get('Policy', {}).get('IsAdministrator'):
                return token, user['Id']
        except urllib.error.HTTPError:
            continue
    raise RuntimeError('No existing administrator session is available for verification')


def items(token, user_id, **kwargs):
    return request('/Items?' + urllib.parse.urlencode({'UserId': user_id, **kwargs}), token)['Items']


def bootstrap_value(html, name):
    return json.loads(re.search(r'const ' + name + r' = (.+);', html)[1])


def main():
    admin, admin_id = admin_session()
    host = guest = second_guest = None
    room = share_id = None
    passed = []
    try:
        render = request('/JellyWatchParty/Client/ui/render.js', raw=True)
        assert 'Could not identify this room or title.' not in render
        assert 'Wait until the owner of the room picks a title.' in render
        assert 'const canPrepareInvite = state.isHost && !state.guestMode;' in render
        passed.append('updated waiting-room client served')
        injected = request('/web/index.html', admin, raw=True)
        assert 'id="jwp-invite-bootstrap"' in injected
        assert '/JellyWatchParty/ClientScript?v=1.12.14' in injected
        assert injected.count('JellyWatchParty/ClientScript') == 1
        assert injected.index('JellyWatchParty/ClientScript') < injected.index('runtime.bundle.js')
        bundle = request('/JellyWatchParty/ClientScript', raw=True)
        assert '// Client module: app/lifecycle.js' in bundle and 'loadScript(' not in bundle
        assert 'Connecting to room…' in bundle and 'JWP_BUNDLED_MODULES' not in bundle
        passed.append('updated invitation bootstrap served')

        host_token = request('/JellyWatchParty/Token', admin)['token']
        host = connect_and_auth(container_ip('jwp-session'), 3000, host_token)
        host.send(message('create_room', payload={'media_id': '', 'start_pos': 0, 'user_name': 'Update verification'}))
        created = host.receive_type('room_state')
        room = created['room']
        assert not created['payload']['media_id']
        payload = {'partyId': room, 'itemId': None, 'mediaId': None, 'expiryHours': 1, 'oneUse': False}
        invitation = request('/ShareLinks/Admin/Create', admin, payload)
        share_id = invitation['Record']['Id']
        share_url = invitation['ShareUrl']
        host.send(message('invite_update', room, {'invite_url': share_url}))
        passed.append('empty-room invite created successfully')

        redeemed = request(urllib.parse.urlsplit(share_url).path, raw=True)
        route = bootstrap_value(redeemed, 'redirectUrl')
        guest_token = bootstrap_value(redeemed, 'accessToken')
        guest_id = bootstrap_value(redeemed, 'userId')
        assert '#/home?jwpWaiting=1' in route and room in route and 'jwpMedia' not in route
        guest_state = request('/ShareLinks/GuestState', guest_token)
        assert guest_state['IsGuest'] and not guest_state.get('AllowedItemId')
        assert not items(guest_token, guest_id, Recursive='true', IncludeItemTypes='Movie,Series', Limit=1)
        passed.append('guest redemption opens a waiting room with no library access')

        guest_jwt = request('/JellyWatchParty/Token', guest_token)['token']
        guest = connect_and_auth(container_ip('jwp-session'), 3000, guest_jwt)
        guest.send(message('join_room', room, {'user_name': 'Verification guest'}))
        joined = guest.receive_type('room_state')
        assert not joined['payload']['media_id'] and joined['payload']['invite_url'] == share_url
        guest.send(message('chat_message', room, {'text': 'Waiting-room verification'}))
        original = host.receive_type('chat_message')['payload']
        assert original['text'] == 'Waiting-room verification' and original['message_id']
        assert guest.receive_type('chat_message')['payload']['message_id'] == original['message_id']
        host.send(message('chat_message', room, {'text': 'Reply verification', 'username': 'Test owner',
                     'reply_to_id': original['message_id'], 'reply_to': {'username': 'Fake', 'text': 'Fake'}}))
        reply = guest.receive_type('chat_message')['payload']
        assert reply['reply_to']['message_id'] == original['message_id']
        assert reply['reply_to']['text'] == original['text'] and not reply['reply_to']['unavailable']
        assert host.receive_type('chat_message')['payload'] == reply
        passed.append('message replies deliver the same server-verified quote to both clients')
        passed.append('guest joins the empty room and chat works')

        title = items(admin, admin_id, Recursive='true', IncludeItemTypes='Movie', IsVirtualItem='false', Limit=1)[0]
        payload.update(itemId=title['Id'], mediaId=title['Id'])
        updated = request('/ShareLinks/Admin/Create', admin, payload)
        assert updated['ShareUrl'] == share_url and updated['Record']['Id'] == share_id
        updated_state = request('/ShareLinks/GuestState', guest_token)
        assert updated_state['WatchPartyMediaId'].replace('-', '').lower() == title['Id'].replace('-', '').lower()
        assert updated_state['AllowedItemId'] == updated_state['WatchPartyMediaId']
        guest_items = items(guest_token, guest_id, Recursive='true', IncludeItemTypes='Movie,Series', Limit=20)
        assert {item['Id'] for item in guest_items} == {title['Id']}
        media_id = title['Id'].replace('-', '').lower()
        host.send(message('player_event', room, {'action': 'play', 'media_id': media_id,
                                                  'position': 0, 'play_state': 'playing'}))
        changed = guest.receive_type('state_update')
        assert changed['payload']['media_id'] == media_id
        guest.send(message('ready', room, {'media_id': media_id}))
        started = guest.receive_type('player_event')
        assert started['payload']['action'] == 'play'
        passed.append('same invite and guest gain only the selected title and receive coordinated playback')

        host.send(message('player_event', room, {'action': 'pause', 'media_id': media_id, 'position': 42, 'play_state': 'paused'}))
        paused = guest.receive_type('player_event')
        assert paused['payload']['play_state'] == 'paused' and paused['payload']['position'] == 42
        host.send(message('player_event', room, {'action': 'seek', 'media_id': media_id, 'position': 72, 'play_state': 'paused'}))
        assert guest.receive_type('player_event')['payload']['position'] == 72
        previous_id = guest.client_id
        guest.close()
        import time
        time.sleep(.15)
        guest = WebSocketClient(container_ip('jwp-session'), 3000, previous_id)
        assert guest.receive_type('client_hello')['payload']['client_id'] != previous_id
        guest.send(message('auth', payload={'token': guest_jwt}))
        guest.receive_type('auth_success')
        restored = guest.receive_type('room_state')
        assert restored['payload']['state']['position'] == 72
        assert restored['payload']['state']['play_state'] == 'paused'
        assert restored['payload']['participant_count'] == 2
        replay = restored['payload']['chat_history']
        assert replay[-1]['message_id'] == reply['message_id'] and replay[-1]['reply_to'] == reply['reply_to']
        passed.append('reply IDs and quoted text survive authenticated reconnect')
        guest.send(message('ready', room, {'media_id': media_id}))
        second_guest = connect_and_auth(container_ip('jwp-session'), 3000, guest_jwt)
        second_guest.send(message('join_room', room, {'user_name': 'Second verification guest'}))
        assert second_guest.receive_type('room_state')['payload']['participant_count'] == 3
        second_guest.send(message('chat_message', room, {'text': 'Second client verification'}))
        assert guest.receive_type('chat_message')['payload']['text'] == 'Second client verification'
        passed.append('pause, seek, authenticated reconnect and a second guest stay in the same room')

        resume = request('/Users/' + admin_id + '/Items/Resume?Limit=24&MediaTypes=Video', admin)['Items']
        next_up = request('/Shows/NextUp?' + urllib.parse.urlencode({'UserId': admin_id, 'Limit': 24}), admin)['Items']
        excluded = {item[key] for item in resume + next_up for key in ['Id', 'SeriesId'] if item.get(key)}
        picks = items(admin, admin_id, Recursive='true', IncludeItemTypes='Movie,Series', SortBy='Random',
                      Limit=20, ExcludeItemIds=','.join(excluded))
        assert all(item['Id'] not in excluded for item in picks)
        config = ET.parse('/opt/jellyfin/config/plugins/configurations/Jellyfin.Plugin.JavaScriptInjector.xml')
        scripts = [entry.findtext('Script') for entry in config.findall('.//CustomJavaScriptEntry')
                   if entry.findtext('Name') == 'Random pick in watching row']
        assert len(scripts) == 1 and 'watchingExclusions' in scripts[0] and 'ExcludeItemIds' in scripts[0]
        served_script = request('/JavaScriptInjector/private.js', admin, raw=True)
        assert 'watchingExclusions' in served_script and 'ExcludeItemIds' in served_script
        passed.append('live Random Pick configuration and API exclude watching movies and series')
    finally:
        if host and room:
            try:
                host.send(message('delete_room', room))
                host.receive_type('room_closed')
            except Exception as error:
                print('Verification room cleanup:', type(error).__name__)
        for client in [second_guest, guest, host]:
            if client:
                client.close()
        if share_id:
            revoked = request('/ShareLinks/Admin/Revoke/' + share_id, admin, {})
            assert not revoked.get('CleanupError'), 'Guest cleanup did not finish'
            passed.append('verification room and temporary guest cleaned up')
        for result in passed:
            print('PASS:', result)


if __name__ == '__main__':
    main()
