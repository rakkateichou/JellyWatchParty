use super::super::validation::sanitize_name;
use crate::messaging::broadcast_to_room;
use crate::types::{Clients, IncomingMessage, Rooms, WsMessage};
use crate::utils::now_ms;

fn cursor_position(parsed: &IncomingMessage) -> Option<(f64, f64)> {
    let payload = parsed.payload.as_ref()?;
    let x = payload.get("x")?.as_f64()?;
    let y = payload.get("y")?.as_f64()?;
    if (0.0..=1.0).contains(&x) && (0.0..=1.0).contains(&y) {
        Some((x, y))
    } else {
        None
    }
}

pub(in crate::ws) async fn handle_cursor_update(
    client_id: &str,
    parsed: &IncomingMessage,
    clients: &Clients,
    rooms: &Rooms,
) {
    let Some(room_id) = parsed.room.as_deref() else {
        return;
    };
    let visible = parsed
        .payload
        .as_ref()
        .and_then(|payload| payload.get("visible"))
        .and_then(|value| value.as_bool())
        .unwrap_or(true);
    let position = if visible {
        let Some(position) = cursor_position(parsed) else {
            return;
        };
        Some(position)
    } else {
        None
    };

    let fallback_name = {
        let locked_clients = clients.read().await;
        let Some(client) = locked_clients.get(client_id) else {
            return;
        };
        client.user_name.clone()
    };
    let username = parsed
        .payload
        .as_ref()
        .and_then(|payload| payload.get("username"))
        .and_then(|value| value.as_str())
        .and_then(sanitize_name)
        .unwrap_or(fallback_name);

    let payload = if let Some((x, y)) = position {
        serde_json::json!({
            "visible": true,
            "x": x,
            "y": y,
            "username": username,
        })
    } else {
        serde_json::json!({
            "visible": false,
            "username": username,
        })
    };
    let timestamp = now_ms();
    let message = WsMessage {
        msg_type: "cursor_update".to_string(),
        room: Some(room_id.to_string()),
        client: Some(client_id.to_string()),
        payload: Some(payload),
        ts: timestamp,
        server_ts: Some(timestamp),
    };

    let locked_rooms = rooms.read().await;
    let Some(room) = locked_rooms.get(room_id) else {
        return;
    };
    if !room.clients.iter().any(|id| id == client_id) {
        return;
    }
    let locked_clients = clients.read().await;
    broadcast_to_room(room, &locked_clients, &message, Some(client_id));
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::ClientMessageType;

    #[test]
    fn cursor_position_accepts_normalized_coordinates() {
        let parsed = IncomingMessage {
            msg_type: ClientMessageType::CursorUpdate,
            room: Some("room-1".to_string()),
            client: None,
            payload: Some(serde_json::json!({ "x": 0.25, "y": 0.75 })),
            ts: 0,
            server_ts: None,
        };
        assert_eq!(cursor_position(&parsed), Some((0.25, 0.75)));
    }

    #[test]
    fn cursor_position_rejects_out_of_bounds_coordinates() {
        let parsed = IncomingMessage {
            msg_type: ClientMessageType::CursorUpdate,
            room: Some("room-1".to_string()),
            client: None,
            payload: Some(serde_json::json!({ "x": 1.2, "y": 0.5 })),
            ts: 0,
            server_ts: None,
        };
        assert_eq!(cursor_position(&parsed), None);
    }

    #[tokio::test]
    async fn broadcasts_cursor_to_other_room_members() {
        let clients = crate::test_helpers::create_clients();
        let rooms = crate::test_helpers::create_rooms();
        let (host, _host_rx) =
            crate::test_helpers::create_client_with_rx("host-user", "Host", true);
        let (guest, mut guest_rx) =
            crate::test_helpers::create_client_with_rx("guest-user", "Guest", true);
        clients.write().await.insert("host".to_string(), host);
        clients.write().await.insert("guest".to_string(), guest);
        let mut room = crate::test_helpers::create_room("room-1", "host");
        room.clients.push("guest".to_string());
        rooms.write().await.insert("room-1".to_string(), room);

        let parsed = IncomingMessage {
            msg_type: ClientMessageType::CursorUpdate,
            room: Some("room-1".to_string()),
            client: Some("host".to_string()),
            payload: Some(serde_json::json!({
                "visible": true,
                "x": 0.4,
                "y": 0.6,
                "username": "  Movie Fan  "
            })),
            ts: 0,
            server_ts: None,
        };
        handle_cursor_update("host", &parsed, &clients, &rooms).await;

        let message = crate::test_helpers::recv_msg(&mut guest_rx).unwrap();
        assert_eq!(message.msg_type, "cursor_update");
        let payload = message.payload.unwrap();
        assert_eq!(payload.get("username").unwrap(), "Movie Fan");
        assert_eq!(payload.get("x").unwrap(), 0.4);
        assert_eq!(payload.get("y").unwrap(), 0.6);
    }
}
