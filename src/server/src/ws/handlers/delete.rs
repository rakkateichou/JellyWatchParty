use crate::messaging::{broadcast_room_list, broadcast_to_room, send_to_client};
use crate::types::{Clients, IncomingMessage, Rooms, WsMessage};
use crate::utils::now_ms;
use log::{info, warn};

fn error_message(
    client_id: &str,
    room_id: Option<String>,
    message: &str,
    reason: &str,
) -> WsMessage {
    WsMessage {
        msg_type: "error".to_string(),
        room: room_id,
        client: Some(client_id.to_string()),
        payload: Some(serde_json::json!({
            "message": message,
            "reason": reason,
        })),
        ts: now_ms(),
        server_ts: Some(now_ms()),
    }
}

pub(in crate::ws) async fn handle_delete_room(
    client_id: &str,
    parsed: &IncomingMessage,
    clients: &Clients,
    rooms: &Rooms,
) {
    let requested_room_id = parsed.room.clone();
    let (client_room_id, user_id) = {
        let locked_clients = clients.read().await;
        let Some(client) = locked_clients.get(client_id) else {
            return;
        };
        (client.room_id.clone(), client.user_id.clone())
    };

    let Some(room_id) = client_room_id else {
        let locked_clients = clients.read().await;
        send_to_client(
            client_id,
            &locked_clients,
            &error_message(
                client_id,
                requested_room_id,
                "You are not in a room",
                "not_in_room",
            ),
        );
        return;
    };

    if requested_room_id.as_deref() != Some(room_id.as_str()) {
        let locked_clients = clients.read().await;
        send_to_client(
            client_id,
            &locked_clients,
            &error_message(
                client_id,
                requested_room_id,
                "Room deletion request did not match your current room",
                "room_mismatch",
            ),
        );
        return;
    }

    let room_for_broadcast = {
        let mut locked_rooms = rooms.write().await;
        let Some(room) = locked_rooms.get_mut(&room_id) else {
            drop(locked_rooms);
            let locked_clients = clients.read().await;
            send_to_client(
                client_id,
                &locked_clients,
                &error_message(
                    client_id,
                    Some(room_id),
                    "The room no longer exists",
                    "room_not_found",
                ),
            );
            return;
        };

        if user_id.is_empty() || user_id != room.owner_user_id {
            warn!(
                "Client {} attempted to delete room {} without owner permission",
                client_id, room_id
            );
            drop(locked_rooms);
            let locked_clients = clients.read().await;
            send_to_client(
                client_id,
                &locked_clients,
                &error_message(
                    client_id,
                    Some(room_id),
                    "Only the room owner can delete this room",
                    "owner_required",
                ),
            );
            return;
        }

        info!("Owner {} deleting room {}", client_id, room_id);
        let room_for_broadcast = room.clone();

        // Explicit deletion ends the active session but retains an invitation-
        // scoped dormant shell. This preserves the existing behavior where the
        // same link can revive the room later under its original owner.
        room.clients.clear();
        room.ready_clients.clear();
        room.pending_play = None;
        room.state.play_state = "paused".to_string();
        room.chat_history.clear();
        room.dormant_since = Some(now_ms());
        room_for_broadcast
    };

    let closed = WsMessage {
        msg_type: "room_closed".to_string(),
        room: Some(room_id.clone()),
        client: Some(client_id.to_string()),
        payload: Some(serde_json::json!({
            "reason": "The room owner ended the room",
            "deleted_by_owner": true,
        })),
        ts: now_ms(),
        server_ts: Some(now_ms()),
    };

    let member_ids = room_for_broadcast.clients.clone();
    {
        let mut locked_clients = clients.write().await;
        broadcast_to_room(&room_for_broadcast, &locked_clients, &closed, None);
        for member_id in &member_ids {
            if let Some(member) = locked_clients.get_mut(member_id) {
                if member.room_id.as_deref() == Some(room_id.as_str()) {
                    member.room_id = None;
                }
            }
        }
    }

    broadcast_room_list(clients, rooms).await;
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_helpers;
    use crate::types::ClientMessageType;

    fn delete_message(client_id: &str) -> IncomingMessage {
        IncomingMessage {
            msg_type: ClientMessageType::DeleteRoom,
            room: Some("room-1".to_string()),
            client: Some(client_id.to_string()),
            payload: None,
            ts: 0,
            server_ts: None,
        }
    }

    #[tokio::test]
    async fn owner_deletes_room_and_kicks_every_member() {
        let clients = test_helpers::create_clients();
        let rooms = test_helpers::create_rooms();
        let (mut owner, mut owner_rx) =
            test_helpers::create_client_with_rx("owner-user", "Owner", true);
        let (mut guest, mut guest_rx) =
            test_helpers::create_client_with_rx("guest-user", "Guest", true);
        owner.room_id = Some("room-1".to_string());
        guest.room_id = Some("room-1".to_string());
        {
            let mut locked = clients.write().await;
            locked.insert("owner-client".to_string(), owner);
            locked.insert("guest-client".to_string(), guest);
        }
        {
            let mut room = test_helpers::create_room("room-1", "owner-client");
            room.owner_user_id = "owner-user".to_string();
            room.clients = vec!["owner-client".to_string(), "guest-client".to_string()];
            room.chat_history.push_back(crate::types::ChatHistoryEntry {
                client_id: "owner-client".to_string(),
                username: "Owner".to_string(),
                text: "old chat".to_string(),
                server_ts: 1,
            });
            rooms.write().await.insert("room-1".to_string(), room);
        }

        handle_delete_room(
            "owner-client",
            &delete_message("owner-client"),
            &clients,
            &rooms,
        )
        .await;

        assert_eq!(
            test_helpers::recv_msg(&mut owner_rx).unwrap().msg_type,
            "room_closed"
        );
        assert_eq!(
            test_helpers::recv_msg(&mut guest_rx).unwrap().msg_type,
            "room_closed"
        );
        let locked_clients = clients.read().await;
        assert!(locked_clients["owner-client"].room_id.is_none());
        assert!(locked_clients["guest-client"].room_id.is_none());
        drop(locked_clients);
        let locked_rooms = rooms.read().await;
        let room = &locked_rooms["room-1"];
        assert!(room.clients.is_empty());
        assert!(room.chat_history.is_empty());
        assert!(room.dormant_since.is_some());
        assert_eq!(room.owner_user_id, "owner-user");
    }

    #[tokio::test]
    async fn promoted_host_cannot_delete_the_owners_room() {
        let clients = test_helpers::create_clients();
        let rooms = test_helpers::create_rooms();
        let (mut guest, mut guest_rx) =
            test_helpers::create_client_with_rx("guest-user", "Guest", true);
        guest.room_id = Some("room-1".to_string());
        clients
            .write()
            .await
            .insert("guest-client".to_string(), guest);
        {
            let mut room = test_helpers::create_room("room-1", "guest-client");
            room.owner_user_id = "owner-user".to_string();
            room.clients = vec!["guest-client".to_string()];
            rooms.write().await.insert("room-1".to_string(), room);
        }

        handle_delete_room(
            "guest-client",
            &delete_message("guest-client"),
            &clients,
            &rooms,
        )
        .await;

        let response = test_helpers::recv_msg(&mut guest_rx).unwrap();
        assert_eq!(response.msg_type, "error");
        assert_eq!(response.payload.unwrap()["reason"], "owner_required");
        assert_eq!(rooms.read().await["room-1"].clients.len(), 1);
    }
}
