"""Check cursor fanout in a disposable room without selecting or playing media.

Run beside validate_waiting_room_live.py and validate_jwp_series_sync.py on the
Jellyfin host. Credentials stay in memory; only the verification room is changed.
"""
import validate_waiting_room_live as check
from validate_jwp_series_sync import connect_and_auth, message


def main():
    admin, _ = check.admin_session()
    token = check.request('/JellyWatchParty/Token', admin)['token']
    clients = []
    room = None
    try:
        for _ in range(3):
            clients.append(connect_and_auth(check.container_ip('jwp-session'), 3000, token))
        host, guest1, guest2 = clients
        host.send(message('create_room', payload={
            'media_id': '', 'start_pos': 0, 'user_name': 'Cursor delivery verification'}))
        room = host.receive_type('room_state')['room']
        for guest in [guest1, guest2]:
            guest.send(message('join_room', room, {'user_name': 'Cursor verification guest'}))
            guest.receive_type('room_state')
        for sender, receivers in [(host, [guest1, guest2]), (guest1, [host, guest2])]:
            for visible in [True, False]:
                payload = {'visible': visible, 'username': 'Drawing check',
                           '_jwp_message_id': sender.client_id + str(visible)}
                if visible:
                    payload.update(x=.25, y=.65)
                sender.send(message('cursor_update', room, payload))
                for receiver in receivers:
                    received = receiver.receive_type('cursor_update')
                    assert received['client'] == sender.client_id
                    assert received['payload'] == payload
        print('PASS: host and guest cursor updates and release events reach other clients intact')
    finally:
        try:
            if room:
                clients[0].send(message('delete_room', room))
                clients[0].receive_type('room_closed')
        finally:
            for client in clients:
                client.close()


if __name__ == '__main__':
    main()
