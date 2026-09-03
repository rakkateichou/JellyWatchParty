use super::super::dispatch::{is_authenticated, send_error};
use crate::messaging::broadcast_to_room;
use crate::types::{Clients, IncomingMessage, Rooms, WsMessage};
use crate::utils::now_ms;

const MAX_INVITE_URL_LEN: usize = 4096;

pub(in crate::ws) async fn handle_invite_update(
    client_id: &str,
    parsed: &IncomingMessage,
    clients: &Clients,
    rooms: &Rooms,
) {
    if !is_authenticated(client_id, clients).await {
        send_error(client_id, clients, "Authentication required").await;
        return;
    }

    let Some(room_id) = parsed.room.as_deref() else {
        return;
    };
    let Some(invite_url) = parsed
        .payload
        .as_ref()
        .and_then(|payload| payload.get("invite_url"))
        .and_then(|value| value.as_str())
        .map(str::trim)
    else {
        send_error(client_id, clients, "Missing invitation URL").await;
        return;
    };
    if invite_url.len() > MAX_INVITE_URL_LEN
        || !(invite_url.starts_with("https://") || invite_url.starts_with("http://"))
    {
        send_error(client_id, clients, "Invalid invitation URL").await;
        return;
    }

    let update_result = {
        let mut locked_rooms = rooms.write().await;
        match locked_rooms.get_mut(room_id) {
            None => Err("Room not found"),
            Some(room)
                if room.host_id != client_id || !room.clients.iter().any(|id| id == client_id) =>
            {
                Err("Only the host can update the invitation")
            }
            Some(room) => {
                room.invite_url = Some(invite_url.to_string());
                Ok(room.clone())
            }
        }
    };
    let room_snapshot = match update_result {
        Ok(room) => room,
        Err(message) => {
            send_error(client_id, clients, message).await;
            return;
        }
    };

    let locked_clients = clients.read().await;
    broadcast_to_room(
        &room_snapshot,
        &locked_clients,
        &WsMessage {
            msg_type: "invite_update".to_string(),
            room: Some(room_id.to_string()),
            client: Some(client_id.to_string()),
            payload: Some(serde_json::json!({ "invite_url": invite_url })),
            ts: now_ms(),
            server_ts: Some(now_ms()),
        },
        None,
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_helpers;
    use crate::types::ClientMessageType;

    fn invite_message(client: &str, room: &str, url: &str) -> IncomingMessage {
        IncomingMessage {
            msg_type: ClientMessageType::InviteUpdate,
            room: Some(room.to_string()),
            client: Some(client.to_string()),
            payload: Some(serde_json::json!({ "invite_url": url })),
            ts: 0,
            server_ts: None,
        }
    }

    #[tokio::test]
    async fn host_can_store_and_broadcast_invite() {
        let clients = test_helpers::create_clients();
        let rooms = test_helpers::create_rooms();
        let mut client_map = std::collections::HashMap::new();
        let mut room_map = std::collections::HashMap::new();
        let mut rx = test_helpers::setup_room_with_host(&mut client_map, &mut room_map, "host-1");
        *clients.write().await = client_map;
        *rooms.write().await = room_map;

        handle_invite_update(
            "host-1",
            &invite_message("host-1", "room-1", "https://example.test/share/abc"),
            &clients,
            &rooms,
        )
        .await;

        assert_eq!(
            rooms
                .read()
                .await
                .get("room-1")
                .unwrap()
                .invite_url
                .as_deref(),
            Some("https://example.test/share/abc")
        );
        let message = test_helpers::recv_msg(&mut rx).expect("invite broadcast");
        assert_eq!(message.msg_type, "invite_update");
    }

    #[tokio::test]
    async fn guest_cannot_replace_invite() {
        let clients = test_helpers::create_clients();
        let rooms = test_helpers::create_rooms();
        let (host, _host_rx) = test_helpers::create_client_with_rx("owner", "Host", true);
        let (guest, mut guest_rx) =
            test_helpers::create_client_with_rx("guest-user", "Guest", true);
        {
            let mut locked = clients.write().await;
            locked.insert("host-1".to_string(), host);
            locked.insert("guest-1".to_string(), guest);
        }
        {
            let mut room = test_helpers::create_room("room-1", "host-1");
            room.clients.push("guest-1".to_string());
            rooms.write().await.insert("room-1".to_string(), room);
        }

        handle_invite_update(
            "guest-1",
            &invite_message("guest-1", "room-1", "https://evil.test/share/x"),
            &clients,
            &rooms,
        )
        .await;

        assert!(rooms
            .read()
            .await
            .get("room-1")
            .unwrap()
            .invite_url
            .is_none());
        assert_eq!(
            test_helpers::recv_msg(&mut guest_rx).unwrap().msg_type,
            "error"
        );
    }
}
