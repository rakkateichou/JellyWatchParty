use crate::messaging::send_to_client;
use crate::types::{Clients, IncomingMessage, Rooms, WsMessage};
use crate::utils::now_ms;

/// Relays WebRTC negotiation data only between authenticated members of the
/// same watch-party room. Media and application messages never pass through
/// this handler; they use the resulting data channel with WebSocket fallback.
pub(in crate::ws) async fn handle_rtc_signal(
    client_id: &str,
    parsed: &IncomingMessage,
    clients: &Clients,
    rooms: &Rooms,
) {
    let Some(room_id) = parsed.room.as_deref() else {
        return;
    };
    let Some(payload) = parsed.payload.as_ref() else {
        return;
    };
    let Some(target) = payload.get("target").and_then(|value| value.as_str()) else {
        return;
    };
    let Some(signal) = payload.get("signal") else {
        return;
    };
    let signal_type = signal.get("type").and_then(|value| value.as_str());
    if target == client_id || !matches!(signal_type, Some("offer" | "answer" | "candidate")) {
        return;
    }

    let allowed = {
        let locked_rooms = rooms.read().await;
        locked_rooms.get(room_id).is_some_and(|room| {
            room.clients.iter().any(|id| id == client_id)
                && room.clients.iter().any(|id| id == target)
        })
    };
    if !allowed {
        return;
    }

    let timestamp = now_ms();
    let message = WsMessage {
        msg_type: "rtc_signal".to_string(),
        room: Some(room_id.to_string()),
        client: Some(client_id.to_string()),
        payload: Some(serde_json::json!({ "signal": signal })),
        ts: timestamp,
        server_ts: Some(timestamp),
    };
    let locked_clients = clients.read().await;
    send_to_client(target, &locked_clients, &message);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_helpers;
    use crate::types::ClientMessageType;

    fn signal(target: &str) -> IncomingMessage {
        IncomingMessage {
            msg_type: ClientMessageType::RtcSignal,
            room: Some("room-1".to_string()),
            client: Some("host".to_string()),
            payload: Some(serde_json::json!({
                "target": target,
                "signal": { "type": "offer", "sdp": { "type": "offer", "sdp": "v=0" } }
            })),
            ts: 0,
            server_ts: None,
        }
    }

    #[tokio::test]
    async fn relays_signal_between_room_members() {
        let clients = test_helpers::create_clients();
        let rooms = test_helpers::create_rooms();
        let (host, _host_rx) = test_helpers::create_client_with_rx("uh", "Host", true);
        let (guest, mut guest_rx) = test_helpers::create_client_with_rx("ug", "Guest", true);
        clients.write().await.insert("host".to_string(), host);
        clients.write().await.insert("guest".to_string(), guest);
        let mut room = test_helpers::create_room("room-1", "host");
        room.clients.push("guest".to_string());
        rooms.write().await.insert("room-1".to_string(), room);

        handle_rtc_signal("host", &signal("guest"), &clients, &rooms).await;

        let message = test_helpers::recv_msg(&mut guest_rx).unwrap();
        assert_eq!(message.msg_type, "rtc_signal");
        assert_eq!(message.client.as_deref(), Some("host"));
        assert_eq!(
            message.payload.unwrap()["signal"]["type"],
            serde_json::json!("offer")
        );
    }

    #[tokio::test]
    async fn rejects_signal_to_non_member() {
        let clients = test_helpers::create_clients();
        let rooms = test_helpers::create_rooms();
        let (host, _host_rx) = test_helpers::create_client_with_rx("uh", "Host", true);
        let (outsider, mut outsider_rx) =
            test_helpers::create_client_with_rx("uo", "Outsider", true);
        clients.write().await.insert("host".to_string(), host);
        clients
            .write()
            .await
            .insert("outsider".to_string(), outsider);
        rooms.write().await.insert(
            "room-1".to_string(),
            test_helpers::create_room("room-1", "host"),
        );

        handle_rtc_signal("host", &signal("outsider"), &clients, &rooms).await;

        assert!(outsider_rx.try_recv().is_err());
    }
}
