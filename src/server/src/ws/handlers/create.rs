use super::super::dispatch::{is_authenticated, send_error};
use super::super::validation::{is_valid_media_id, is_valid_position, sanitize_name};
use crate::messaging::{broadcast_room_list, build_room_state_payload, send_to_client};
use crate::password::hash_password;
use crate::types::{Clients, IncomingMessage, PlaybackState, Room, Rooms, WsMessage};
use crate::utils::now_ms;
use log::info;
use std::collections::{HashSet, VecDeque};

fn resolve_host_name(
    payload: Option<&serde_json::Value>,
    clients: &std::collections::HashMap<String, crate::types::Client>,
    client_id: &str,
) -> (String, Option<String>) {
    let payload_name = payload
        .and_then(|p| p.get("user_name"))
        .and_then(|v| v.as_str())
        .and_then(sanitize_name);
    let host_name = match &payload_name {
        Some(name) => name.clone(),
        None => clients
            .get(client_id)
            .map(|c| c.user_name.clone())
            .unwrap_or_else(|| "Anonymous".to_string()),
    };
    (host_name, payload_name)
}

fn build_room(
    client_id: &str,
    owner_user_id: &str,
    host_name: &str,
    payload: Option<&serde_json::Value>,
) -> Room {
    let room_id = uuid::Uuid::new_v4().to_string();
    let raw_start_pos = payload
        .and_then(|p| p.get("start_pos"))
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);
    let start_pos = if is_valid_position(raw_start_pos) {
        raw_start_pos
    } else {
        0.0
    };
    let media_id = payload
        .and_then(|p| p.get("media_id"))
        .and_then(|v| v.as_str())
        .filter(|id| is_valid_media_id(id))
        .map(|v| v.to_string());
    let password_hash = payload
        .and_then(|p| p.get("password"))
        .and_then(|v| v.as_str())
        .filter(|pw| !pw.is_empty())
        .map(hash_password);
    let room_name = format!("{}'s room", host_name);

    info!(
        "Creating room '{}' ({}) for {}",
        room_name, room_id, client_id
    );

    Room {
        room_id,
        name: room_name,
        host_id: client_id.to_string(),
        owner_user_id: owner_user_id.to_string(),
        owner_name: host_name.to_string(),
        media_id,
        clients: vec![client_id.to_string()],
        ready_clients: HashSet::from([client_id.to_string()]),
        pending_play: None,
        state: PlaybackState {
            position: start_pos,
            play_state: "paused".to_string(),
        },
        last_state_ts: now_ms(),
        last_command_ts: 0,
        chat_history: VecDeque::new(),
        password_hash,
        invite_url: None,
        dormant_since: None,
    }
}

fn insert_and_notify(
    client_id: &str,
    room: Room,
    payload_name: &Option<String>,
    locked_clients: &mut std::collections::HashMap<String, crate::types::Client>,
    locked_rooms: &mut std::collections::HashMap<String, Room>,
) {
    let room_id = room.room_id.clone();
    locked_rooms.insert(room_id.clone(), room.clone());
    if let Some(client) = locked_clients.get_mut(client_id) {
        client.room_id = Some(room_id.clone());
        if let Some(ref name) = payload_name {
            client.user_name = name.clone();
        }
    }
    send_to_client(
        client_id,
        locked_clients,
        &WsMessage {
            msg_type: "room_state".to_string(),
            room: Some(room_id),
            client: Some(client_id.to_string()),
            payload: Some(build_room_state_payload(&room, 1)),
            ts: now_ms(),
            server_ts: Some(now_ms()),
        },
    );
}

pub(in crate::ws) async fn handle_create_room(
    client_id: &str,
    parsed: &IncomingMessage,
    clients: &Clients,
    rooms: &Rooms,
) {
    if !is_authenticated(client_id, clients).await {
        send_error(client_id, clients, "Authentication required").await;
        return;
    }

    let existing_room_id = {
        let locked_clients = clients.read().await;
        locked_clients
            .get(client_id)
            .and_then(|client| client.room_id.clone())
    };
    if existing_room_id.is_some() {
        // Rooms end only after their final participant leaves. Never destroy
        // an occupied room just because one member sends Create again.
        send_error(
            client_id,
            clients,
            "Leave your current room before creating another",
        )
        .await;
        return;
    }

    info!("create_room payload: {:?}", parsed.payload);

    let payload_ref = parsed.payload.as_ref();
    let (host_name, payload_name, owner_user_id) = {
        let locked_clients = clients.read().await;
        let (host_name, payload_name) = resolve_host_name(payload_ref, &locked_clients, client_id);
        let owner_user_id = locked_clients
            .get(client_id)
            .map(|client| client.user_id.clone())
            .unwrap_or_else(|| client_id.to_string());
        (host_name, payload_name, owner_user_id)
    };
    let room = build_room(client_id, &owner_user_id, &host_name, payload_ref);

    {
        let mut locked_rooms = rooms.write().await;
        let mut locked_clients = clients.write().await;
        insert_and_notify(
            client_id,
            room,
            &payload_name,
            &mut locked_clients,
            &mut locked_rooms,
        );
    }

    broadcast_room_list(clients, rooms).await;
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_helpers;

    #[test]
    fn build_room_valid() {
        let room = build_room(
            "host-1",
            "user-1",
            "Alice",
            Some(&serde_json::json!({
                "media_id": "550e8400e29b41d4a716446655440000",
                "start_pos": 42.5
            })),
        );
        assert_eq!(room.host_id, "host-1");
        assert_eq!(room.name, "Alice's room");
        assert_eq!(
            room.media_id,
            Some("550e8400e29b41d4a716446655440000".to_string())
        );
        assert!((room.state.position - 42.5).abs() < f64::EPSILON);
        assert_eq!(room.state.play_state, "paused");
        assert!(room.clients.contains(&"host-1".to_string()));
    }

    #[test]
    fn build_room_no_media_id() {
        let room = build_room("host-1", "user-1", "Bob", Some(&serde_json::json!({})));
        assert_eq!(room.media_id, None);
    }

    #[test]
    fn build_room_invalid_media_id() {
        let room = build_room(
            "host-1",
            "user-1",
            "Bob",
            Some(&serde_json::json!({ "media_id": "not-valid-hex" })),
        );
        assert_eq!(room.media_id, None);
    }

    #[test]
    fn build_room_clamps_position() {
        let room = build_room(
            "host-1",
            "user-1",
            "Bob",
            Some(&serde_json::json!({ "start_pos": -10.0 })),
        );
        assert!((room.state.position - 0.0).abs() < f64::EPSILON);

        let room2 = build_room(
            "host-1",
            "user-1",
            "Bob",
            Some(&serde_json::json!({ "start_pos": 100000.0 })),
        );
        assert!((room2.state.position - 0.0).abs() < f64::EPSILON);
    }

    #[test]
    fn build_room_no_password_by_default() {
        let room = build_room("host-1", "user-1", "Bob", Some(&serde_json::json!({})));
        assert!(room.password_hash.is_none());
    }

    #[test]
    fn build_room_hashes_provided_password() {
        let room = build_room(
            "host-1",
            "user-1",
            "Bob",
            Some(&serde_json::json!({ "password": "hunter2" })),
        );
        assert!(room.password_hash.is_some());
        let (salt, hash) = room.password_hash.unwrap();
        assert!(crate::password::verify_password("hunter2", &salt, &hash));
    }

    #[test]
    fn build_room_ignores_empty_password() {
        let room = build_room(
            "host-1",
            "user-1",
            "Bob",
            Some(&serde_json::json!({ "password": "" })),
        );
        assert!(room.password_hash.is_none());
    }

    #[test]
    fn build_room_starts_with_empty_history() {
        let room = build_room("host-1", "user-1", "Bob", Some(&serde_json::json!({})));
        assert!(room.chat_history.is_empty());
    }

    #[test]
    fn resolve_host_name_from_payload() {
        let mut clients = std::collections::HashMap::new();
        let (client, _rx) = test_helpers::create_client_with_rx("u1", "Default", true);
        clients.insert("c1".to_string(), client);
        let (name, payload_name) = resolve_host_name(
            Some(&serde_json::json!({ "user_name": "Custom" })),
            &clients,
            "c1",
        );
        assert_eq!(name, "Custom");
        assert_eq!(payload_name, Some("Custom".to_string()));
    }

    #[test]
    fn resolve_host_name_from_client() {
        let mut clients = std::collections::HashMap::new();
        let (client, _rx) = test_helpers::create_client_with_rx("u1", "FromClient", true);
        clients.insert("c1".to_string(), client);
        let (name, payload_name) = resolve_host_name(Some(&serde_json::json!({})), &clients, "c1");
        assert_eq!(name, "FromClient");
        assert_eq!(payload_name, None);
    }

    #[tokio::test]
    async fn creating_again_does_not_destroy_an_occupied_room() {
        let clients = test_helpers::create_clients();
        let rooms = test_helpers::create_rooms();
        let mut client_map = std::collections::HashMap::new();
        let mut room_map = std::collections::HashMap::new();
        let mut rx = test_helpers::setup_room_with_host(&mut client_map, &mut room_map, "host-1");
        *clients.write().await = client_map;
        *rooms.write().await = room_map;

        handle_create_room(
            "host-1",
            &IncomingMessage {
                msg_type: crate::types::ClientMessageType::CreateRoom,
                room: None,
                client: Some("host-1".to_string()),
                payload: Some(serde_json::json!({ "user_name": "Host" })),
                ts: 0,
                server_ts: None,
            },
            &clients,
            &rooms,
        )
        .await;

        let locked_rooms = rooms.read().await;
        assert_eq!(locked_rooms.len(), 1);
        assert!(locked_rooms.contains_key("room-1"));
        drop(locked_rooms);

        let response = test_helpers::recv_msg(&mut rx).expect("create rejection");
        assert_eq!(response.msg_type, "error");
        assert!(response.payload.unwrap()["message"]
            .as_str()
            .unwrap()
            .contains("Leave your current room"));
    }
}
