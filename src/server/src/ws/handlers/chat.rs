use super::super::constants::{MAX_CHAT_HISTORY, MAX_CHAT_MESSAGE_LENGTH};
use super::super::dispatch::send_error;
use super::super::validation::sanitize_name;
use crate::types::{ChatHistoryEntry, ChatReply, Clients, IncomingMessage, Rooms, WsMessage};
use crate::utils::now_ms;
use tokio::sync::mpsc;

fn validate_chat(text: &str) -> Result<(), &'static str> {
    if text.is_empty() {
        return Err("Chat message cannot be empty");
    }
    if text.encode_utf16().count() > MAX_CHAT_MESSAGE_LENGTH {
        return Err("Chat message too long");
    }
    Ok(())
}

type BroadcastData = (
    Vec<mpsc::Sender<Result<warp::ws::Message, warp::Error>>>,
    String,
);

fn collect_chat_senders(
    room_id: &str,
    client_id: &str,
    username: &str,
    chat_text: &str,
    payload: Option<&serde_json::Value>,
    rooms: &mut std::collections::HashMap<String, crate::types::Room>,
    clients: &std::collections::HashMap<String, crate::types::Client>,
) -> Option<BroadcastData> {
    let room = rooms.get_mut(room_id)?;
    if !room.clients.contains(&client_id.to_string()) {
        return None;
    }
    let server_ts = now_ms();
    let message_id = uuid::Uuid::new_v4().to_string();
    // Never accept a supplied author or quote. Only this room's history can
    // resolve a reference; missing/expired references reveal no other content.
    let reply_to = payload
        .and_then(|p| p.get("reply_to_id"))
        .and_then(|id| id.as_str())
        .filter(|id| !id.is_empty() && id.len() <= 100)
        .map(|id| {
            let parent = room
                .chat_history
                .iter()
                .find(|entry| entry.message_id == id);
            ChatReply {
                message_id: id.to_string(),
                username: parent
                    .map(|entry| entry.username.clone())
                    .unwrap_or_default(),
                text: parent.map(|entry| entry.text.clone()).unwrap_or_default(),
                unavailable: parent.is_none(),
            }
        });
    let transport_id = payload
        .and_then(|p| p.get("_jwp_message_id"))
        .and_then(|id| id.as_str())
        .filter(|id| !id.is_empty() && id.len() <= 100);

    room.chat_history.push_back(ChatHistoryEntry {
        message_id: message_id.clone(),
        transport_id: transport_id.map(str::to_string),
        client_id: client_id.to_string(),
        username: username.to_string(),
        text: chat_text.to_string(),
        server_ts,
        reply_to: reply_to.clone(),
    });
    if room.chat_history.len() > MAX_CHAT_HISTORY {
        room.chat_history.pop_front();
    }

    let mut payload = serde_json::json!({
        "message_id": message_id,
        "username": username,
        "text": chat_text
    });
    if let Some(reply) = reply_to {
        payload["reply_to"] = serde_json::json!(reply);
    }
    if let Some(id) = transport_id {
        payload["_jwp_message_id"] = serde_json::json!(id);
    }
    let msg = WsMessage {
        msg_type: "chat_message".to_string(),
        room: Some(room_id.to_string()),
        client: Some(client_id.to_string()),
        payload: Some(payload),
        ts: server_ts,
        server_ts: Some(server_ts),
    };
    let senders: Vec<_> = room
        .clients
        .iter()
        .filter_map(|id| clients.get(id).map(|c| c.sender.clone()))
        .collect();
    let json = serde_json::to_string(&msg).ok()?;
    Some((senders, json))
}

pub(in crate::ws) async fn handle_chat_message(
    client_id: &str,
    parsed: &IncomingMessage,
    clients: &Clients,
    rooms: &Rooms,
) {
    let Some(ref room_id) = parsed.room else {
        send_error(client_id, clients, "Room ID required for chat").await;
        return;
    };

    let chat_text = parsed
        .payload
        .as_ref()
        .and_then(|p| p.get("text"))
        .and_then(|v| v.as_str())
        .unwrap_or("");

    if let Err(msg) = validate_chat(chat_text) {
        let detail = if chat_text.encode_utf16().count() > MAX_CHAT_MESSAGE_LENGTH {
            format!("{} (max {} characters)", msg, MAX_CHAT_MESSAGE_LENGTH)
        } else {
            msg.to_string()
        };
        send_error(client_id, clients, &detail).await;
        return;
    }

    let requested_username = parsed
        .payload
        .as_ref()
        .and_then(|p| p.get("username"))
        .and_then(|v| v.as_str())
        .and_then(sanitize_name);

    let username = if let Some(nickname) = requested_username {
        nickname
    } else {
        let locked_clients = clients.read().await;
        locked_clients
            .get(client_id)
            .map(|c| c.user_name.clone())
            .unwrap_or_else(|| "Anonymous".to_string())
    };
    let broadcast_data = {
        let mut locked_rooms = rooms.write().await;
        let locked_clients = clients.read().await;
        collect_chat_senders(
            room_id,
            client_id,
            &username,
            chat_text,
            parsed.payload.as_ref(),
            &mut locked_rooms,
            &locked_clients,
        )
    };

    if let Some((senders, json)) = broadcast_data {
        let warp_msg = warp::ws::Message::text(json);
        for sender in senders {
            if let Err(e) = sender.try_send(Ok(warp_msg.clone())) {
                log::warn!("Failed to send chat_message (buffer full or closed): {}", e);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn post(
        rooms: &mut std::collections::HashMap<String, crate::types::Room>,
        room_id: &str,
        payload: serde_json::Value,
    ) -> serde_json::Value {
        let (_, json) = collect_chat_senders(
            room_id,
            "host",
            "Movie Fan",
            payload["text"].as_str().unwrap(),
            Some(&payload),
            rooms,
            &std::collections::HashMap::new(),
        )
        .unwrap();
        serde_json::from_str::<serde_json::Value>(&json).unwrap()["payload"].clone()
    }

    #[test]
    fn replies_use_server_ids_and_quotes_and_survive_history_eviction() {
        let mut rooms = std::collections::HashMap::from([
            (
                "r1".to_string(),
                crate::test_helpers::create_room("r1", "host"),
            ),
            (
                "r2".to_string(),
                crate::test_helpers::create_room("r2", "host"),
            ),
        ]);
        let original = post(
            &mut rooms,
            "r1",
            serde_json::json!({
                "text": "Great scene", "message_id": "spoofed", "_jwp_message_id": "transport-1"
            }),
        );
        let id = original["message_id"].as_str().unwrap();
        assert!(uuid::Uuid::parse_str(id).is_ok());
        let reply = post(
            &mut rooms,
            "r1",
            serde_json::json!({
                "text": "Agreed", "reply_to_id": id,
                "reply_to": { "username": "Spoofed", "text": "Fake quote" }
            }),
        );
        assert_eq!(reply["reply_to"]["text"], "Great scene");
        assert_eq!(reply["reply_to"]["username"], "Movie Fan");
        assert_eq!(reply["reply_to"]["unavailable"], false);
        assert_ne!(reply["message_id"], original["message_id"]);
        let nested = post(
            &mut rooms,
            "r1",
            serde_json::json!({
                "text": "Me too", "reply_to_id": reply["message_id"]
            }),
        );
        assert_eq!(nested["reply_to"]["text"], "Agreed");
        assert!(nested["reply_to"].get("reply_to").is_none());
        let cross_room = post(
            &mut rooms,
            "r2",
            serde_json::json!({ "text": "Hi", "reply_to_id": id }),
        );
        assert_eq!(cross_room["reply_to"]["unavailable"], true);
        assert_eq!(cross_room["reply_to"]["text"], "");
        for _ in 0..MAX_CHAT_HISTORY - 2 {
            post(&mut rooms, "r1", serde_json::json!({ "text": "More chat" }));
        }
        let room = rooms.get("r1").unwrap();
        assert!(!room.chat_history.iter().any(|entry| entry.message_id == id));
        let replay = crate::messaging::build_room_state_payload(room, 1, true);
        assert_eq!(replay["chat_history"][0]["reply_to"], reply["reply_to"]);
        let expired = post(
            &mut rooms,
            "r1",
            serde_json::json!({ "text": "Late reply", "reply_to_id": id }),
        );
        assert_eq!(expired["reply_to"]["unavailable"], true);
    }

    #[test]
    fn chat_length_matches_browser_utf16_limit() {
        assert!(validate_chat(&"é".repeat(500)).is_ok());
        assert!(validate_chat(&"🎬".repeat(250)).is_ok());
        assert!(validate_chat(&"🎬".repeat(251)).is_err());
    }

    #[test]
    fn validate_chat_valid() {
        assert!(validate_chat("Hello world").is_ok());
    }

    #[test]
    fn validate_chat_empty() {
        assert!(validate_chat("").is_err());
    }

    #[test]
    fn validate_chat_too_long() {
        let long = "a".repeat(MAX_CHAT_MESSAGE_LENGTH + 1);
        assert!(validate_chat(&long).is_err());
    }

    #[test]
    fn validate_chat_at_limit() {
        let exact = "a".repeat(MAX_CHAT_MESSAGE_LENGTH);
        assert!(validate_chat(&exact).is_ok());
    }

    #[tokio::test]
    async fn handle_chat_message_appends_to_history() {
        let clients = crate::test_helpers::create_clients();
        let rooms = crate::test_helpers::create_rooms();
        let (host, mut rx_h) = crate::test_helpers::create_client_with_rx("uh", "Host", true);
        clients.write().await.insert("host".to_string(), host);
        rooms.write().await.insert(
            "room-1".to_string(),
            crate::test_helpers::create_room("room-1", "host"),
        );

        let parsed = IncomingMessage {
            msg_type: crate::types::ClientMessageType::ChatMessage,
            room: Some("room-1".to_string()),
            client: Some("host".to_string()),
            payload: Some(serde_json::json!({
                "text": "hello",
                "_jwp_message_id": "message-1"
            })),
            ts: 0,
            server_ts: None,
        };
        handle_chat_message("host", &parsed, &clients, &rooms).await;

        let live = crate::test_helpers::recv_msg(&mut rx_h).unwrap();
        assert_eq!(
            live.payload.unwrap().get("_jwp_message_id").unwrap(),
            "message-1"
        );
        let rooms_locked = rooms.read().await;
        let history = &rooms_locked.get("room-1").unwrap().chat_history;
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].text, "hello");
        assert_eq!(history[0].username, "Host");
    }

    #[tokio::test]
    async fn handle_chat_message_uses_sanitized_nickname() {
        let clients = crate::test_helpers::create_clients();
        let rooms = crate::test_helpers::create_rooms();
        let (host, mut rx_h) = crate::test_helpers::create_client_with_rx("uh", "Host", true);
        clients.write().await.insert("host".to_string(), host);
        rooms.write().await.insert(
            "room-1".to_string(),
            crate::test_helpers::create_room("room-1", "host"),
        );

        let parsed = IncomingMessage {
            msg_type: crate::types::ClientMessageType::ChatMessage,
            room: Some("room-1".to_string()),
            client: Some("host".to_string()),
            payload: Some(serde_json::json!({
                "text": "hello",
                "username": "  Movie Fan  "
            })),
            ts: 0,
            server_ts: None,
        };
        handle_chat_message("host", &parsed, &clients, &rooms).await;

        let _ = crate::test_helpers::recv_msg(&mut rx_h);
        let rooms_locked = rooms.read().await;
        let history = &rooms_locked.get("room-1").unwrap().chat_history;
        assert_eq!(history[0].username, "Movie Fan");
    }

    #[tokio::test]
    async fn handle_chat_message_caps_history_at_max() {
        let clients = crate::test_helpers::create_clients();
        let rooms = crate::test_helpers::create_rooms();
        let (host, _rx_h) = crate::test_helpers::create_client_with_rx("uh", "Host", true);
        clients.write().await.insert("host".to_string(), host);
        rooms.write().await.insert(
            "room-1".to_string(),
            crate::test_helpers::create_room("room-1", "host"),
        );

        for i in 0..(MAX_CHAT_HISTORY + 5) {
            let parsed = IncomingMessage {
                msg_type: crate::types::ClientMessageType::ChatMessage,
                room: Some("room-1".to_string()),
                client: Some("host".to_string()),
                payload: Some(serde_json::json!({ "text": format!("msg {}", i) })),
                ts: 0,
                server_ts: None,
            };
            handle_chat_message("host", &parsed, &clients, &rooms).await;
        }

        let rooms_locked = rooms.read().await;
        let history = &rooms_locked.get("room-1").unwrap().chat_history;
        assert_eq!(history.len(), MAX_CHAT_HISTORY);
        // Oldest messages should have been evicted — the front should no
        // longer be "msg 0".
        assert_ne!(history.front().unwrap().text, "msg 0");
    }
}
