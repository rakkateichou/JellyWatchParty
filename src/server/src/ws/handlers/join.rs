use super::super::constants::MAX_CLIENTS_PER_ROOM;
use super::super::dispatch::{is_authenticated, send_error};
use super::super::validation::sanitize_name;
use crate::messaging::{broadcast_to_room, build_room_state_payload, send_to_client};
use crate::types::{Client, Clients, IncomingMessage, Room, Rooms, WsMessage};
use crate::utils::now_ms;
use log::info;
use std::collections::HashMap;

fn add_client_to_room(
    client_id: &str,
    room: &mut Room,
    locked_clients: &mut HashMap<String, Client>,
    payload_name: &Option<String>,
) {
    if !room.clients.contains(&client_id.to_string()) {
        room.clients.push(client_id.to_string());
    }
    room.ready_clients.remove(client_id);
    room.dormant_since = None;
    if let Some(client) = locked_clients.get_mut(client_id) {
        client.room_id = Some(room.room_id.clone());
        if let Some(ref name) = payload_name {
            client.user_name = name.clone();
        }
    }
}

fn notify_join(
    client_id: &str,
    room: &Room,
    locked_clients: &HashMap<String, Client>,
    is_owner: bool,
) {
    send_to_client(
        client_id,
        locked_clients,
        &WsMessage {
            msg_type: "room_state".to_string(),
            room: Some(room.room_id.clone()),
            client: Some(client_id.to_string()),
            payload: Some(build_room_state_payload(room, room.clients.len(), is_owner)),
            ts: now_ms(),
            server_ts: Some(now_ms()),
        },
    );
    broadcast_to_room(
        room,
        locked_clients,
        &WsMessage {
            msg_type: "participants_update".to_string(),
            room: Some(room.room_id.clone()),
            client: None,
            payload: Some(serde_json::json!({
                "participant_count": room.clients.len(),
                "host_id": room.host_id,
                "peer_ids": room.clients,
            })),
            ts: now_ms(),
            server_ts: Some(now_ms()),
        },
        Some(client_id),
    );
}

pub(in crate::ws) async fn handle_join_room(
    client_id: &str,
    parsed: &IncomingMessage,
    clients: &Clients,
    rooms: &Rooms,
) {
    if !is_authenticated(client_id, clients).await {
        send_error(client_id, clients, "Authentication required").await;
        return;
    }
    let Some(ref room_id) = parsed.room else {
        return;
    };

    let payload_name = parsed
        .payload
        .as_ref()
        .and_then(|p| p.get("user_name"))
        .and_then(|v| v.as_str())
        .and_then(sanitize_name);

    let mut locked_rooms = rooms.write().await;
    let mut locked_clients = clients.write().await;

    let joining_user_id = locked_clients
        .get(client_id)
        .map(|client| client.user_id.clone())
        .unwrap_or_default();

    let Some(room) = locked_rooms.get_mut(room_id) else {
        drop(locked_clients);
        drop(locked_rooms);
        send_error(
            client_id,
            clients,
            "This room is no longer available. Ask the owner for a new invitation.",
        )
        .await;
        return;
    };

    let is_existing_member = room.clients.contains(&client_id.to_string());

    if !is_existing_member && room.clients.len() >= MAX_CLIENTS_PER_ROOM {
        send_to_client(
            client_id,
            &locked_clients,
            &WsMessage {
                msg_type: "error".to_string(),
                room: Some(room_id.clone()),
                client: Some(client_id.to_string()),
                payload: Some(serde_json::json!({ "message": "Room is full" })),
                ts: now_ms(),
                server_ts: Some(now_ms()),
            },
        );
        return;
    }

    info!("Client {} joining room {}", client_id, room_id);
    if locked_clients
        .get(client_id)
        .and_then(|client| client.room_id.as_ref())
        .is_some_and(|previous| previous != room_id)
    {
        crate::room::handle_leave(client_id, &mut locked_clients, &mut locked_rooms);
    }
    let room = locked_rooms.get_mut(room_id).unwrap();
    let is_owner = !joining_user_id.is_empty() && joining_user_id == room.owner_user_id;
    if is_owner {
        // The creator always regains host control, even if a guest kept the
        // room alive and was temporarily promoted while the owner was away.
        room.host_id = client_id.to_string();
    }
    add_client_to_room(client_id, room, &mut locked_clients, &payload_name);
    notify_join(client_id, room, &locked_clients, is_owner);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_helpers;

    #[test]
    fn add_client_to_room_updates_state() {
        let mut clients = HashMap::new();
        let (client, _rx) = test_helpers::create_client_with_rx("u2", "Guest", true);
        clients.insert("guest-1".to_string(), client);
        let mut room = test_helpers::create_room("room-1", "host-1");

        add_client_to_room("guest-1", &mut room, &mut clients, &None);

        assert!(room.clients.contains(&"guest-1".to_string()));
        assert_eq!(
            clients.get("guest-1").unwrap().room_id,
            Some("room-1".to_string())
        );
    }

    #[test]
    fn add_client_to_room_clears_ready() {
        let mut clients = HashMap::new();
        let (client, _rx) = test_helpers::create_client_with_rx("u2", "Guest", true);
        clients.insert("guest-1".to_string(), client);
        let mut room = test_helpers::create_room("room-1", "host-1");
        room.ready_clients.insert("guest-1".to_string());

        add_client_to_room("guest-1", &mut room, &mut clients, &None);

        assert!(!room.ready_clients.contains("guest-1"));
    }

    #[test]
    fn add_client_to_room_with_payload_name() {
        let mut clients = HashMap::new();
        let (client, _rx) = test_helpers::create_client_with_rx("u2", "OldName", true);
        clients.insert("guest-1".to_string(), client);
        let mut room = test_helpers::create_room("room-1", "host-1");

        let payload_name = Some("NewName".to_string());
        add_client_to_room("guest-1", &mut room, &mut clients, &payload_name);

        assert_eq!(clients.get("guest-1").unwrap().user_name, "NewName");
    }

    #[tokio::test]
    async fn original_owner_reclaims_host_when_rejoining() {
        let clients = test_helpers::create_clients();
        let rooms = test_helpers::create_rooms();
        let (owner, mut owner_rx) =
            test_helpers::create_client_with_rx("owner-user", "Original Owner", true);
        let (guest, mut guest_rx) =
            test_helpers::create_client_with_rx("guest-user", "Guest", true);
        {
            let mut locked = clients.write().await;
            locked.insert("owner-new-client".to_string(), owner);
            locked.insert("guest-client".to_string(), guest);
        }
        {
            let mut room = test_helpers::create_room("room-1", "old-owner-client");
            room.owner_user_id = "owner-user".to_string();
            room.host_id = "guest-client".to_string();
            room.clients = vec!["guest-client".to_string()];
            rooms.write().await.insert("room-1".to_string(), room);
        }

        let parsed = IncomingMessage {
            msg_type: crate::types::ClientMessageType::JoinRoom,
            room: Some("room-1".to_string()),
            client: Some("owner-new-client".to_string()),
            payload: None,
            ts: 0,
            server_ts: None,
        };
        handle_join_room("owner-new-client", &parsed, &clients, &rooms).await;

        let room = rooms.read().await.get("room-1").unwrap().clone();
        assert_eq!(room.host_id, "owner-new-client");
        assert_eq!(
            test_helpers::recv_msg(&mut owner_rx).unwrap().msg_type,
            "room_state"
        );
        let update = test_helpers::recv_msg(&mut guest_rx).unwrap();
        assert_eq!(update.msg_type, "participants_update");
        assert_eq!(update.payload.unwrap()["host_id"], "owner-new-client");
    }

    #[tokio::test]
    async fn guest_revives_dormant_room_without_becoming_owner() {
        let clients = test_helpers::create_clients();
        let rooms = test_helpers::create_rooms();
        let (guest, mut guest_rx) =
            test_helpers::create_client_with_rx("guest-user", "Guest", true);
        clients
            .write()
            .await
            .insert("guest-client".to_string(), guest);
        {
            let mut room = test_helpers::create_room("room-1", "old-owner-client");
            room.owner_user_id = "owner-user".to_string();
            room.clients.clear();
            room.ready_clients.clear();
            room.dormant_since = Some(now_ms());
            rooms.write().await.insert("room-1".to_string(), room);
        }

        let parsed = IncomingMessage {
            msg_type: crate::types::ClientMessageType::JoinRoom,
            room: Some("room-1".to_string()),
            client: Some("guest-client".to_string()),
            payload: None,
            ts: 0,
            server_ts: None,
        };
        handle_join_room("guest-client", &parsed, &clients, &rooms).await;

        let room = rooms.read().await.get("room-1").unwrap().clone();
        assert_eq!(room.host_id, "old-owner-client");
        assert_eq!(room.owner_user_id, "owner-user");
        assert!(room.dormant_since.is_none());
        let room_state = test_helpers::recv_msg(&mut guest_rx).unwrap();
        assert_eq!(room_state.payload.unwrap()["host_id"], "old-owner-client");
    }
}
