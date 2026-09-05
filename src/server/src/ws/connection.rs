use super::constants::CLIENT_CHANNEL_BUFFER;
use super::dispatch::client_msg;
use crate::auth::JwtConfig;
use crate::messaging::{send_room_list, send_to_client};
use crate::types::{Clients, Rooms, WsMessage};
use crate::utils::now_ms;
use futures::StreamExt;
use log::info;
use std::sync::Arc;
use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;

fn register_client(
    client_sender: mpsc::Sender<Result<warp::ws::Message, warp::Error>>,
    jwt_config: &Arc<JwtConfig>,
) -> crate::types::Client {
    let now = now_ms();
    let authenticated = !jwt_config.enabled;
    let (user_id, user_name) = if authenticated {
        ("anonymous".to_string(), "Anonymous".to_string())
    } else {
        ("".to_string(), "".to_string())
    };

    crate::types::Client {
        sender: client_sender,
        room_id: None,
        user_id,
        user_name,
        authenticated,
        message_count: 0,
        last_reset: now,
        last_seen: now,
    }
}

fn send_client_hello(
    client_id: &str,
    locked_clients: &std::collections::HashMap<String, crate::types::Client>,
) {
    send_to_client(
        client_id,
        locked_clients,
        &WsMessage {
            msg_type: "client_hello".to_string(),
            room: None,
            client: Some(client_id.to_string()),
            payload: Some(serde_json::json!({ "client_id": client_id })),
            ts: now_ms(),
            server_ts: Some(now_ms()),
        },
    );
}

/// IDs identify participants; they are public and never authorize resumption.
fn is_plausible_client_id(id: &str) -> bool {
    id.len() == 36 && id.chars().all(|c| c.is_ascii_hexdigit() || c == '-')
}

pub async fn client_connection(
    ws: warp::ws::WebSocket,
    clients: Clients,
    rooms: Rooms,
    jwt_config: Arc<JwtConfig>,
    requested_client_id: Option<String>,
) {
    let (client_ws_sender, mut client_ws_rcv) = ws.split();
    let (client_sender, client_rcv) = mpsc::channel(CLIENT_CHANNEL_BUFFER);
    let client_rcv = ReceiverStream::new(client_rcv);

    let forward_task = tokio::task::spawn(async move {
        let _ = client_rcv.forward(client_ws_sender).await;
    });

    let requested_id = requested_client_id
        .filter(|id| is_plausible_client_id(id))
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

    // A colliding ID starts unauthenticated under a provisional identity. Only
    // a verified JWT for the same user can resume a disconnected transport.
    let mut client_id = {
        let mut locked_clients = clients.write().await;
        let id = if locked_clients.contains_key(&requested_id) {
            uuid::Uuid::new_v4().to_string()
        } else {
            requested_id.clone()
        };
        locked_clients.insert(
            id.clone(),
            register_client(client_sender.clone(), &jwt_config),
        );
        id
    };

    {
        let locked_clients = clients.read().await;
        send_client_hello(&client_id, &locked_clients);
    }

    send_room_list(&client_id, &clients, &rooms).await;

    while let Some(result) = client_ws_rcv.next().await {
        if let Ok(msg) = result {
            let mut resumed_room = None;
            if client_id != requested_id && jwt_config.enabled {
                let claims = msg
                    .to_str()
                    .ok()
                    .filter(|text| text.len() <= super::constants::MAX_MESSAGE_SIZE)
                    .and_then(|text| serde_json::from_str::<serde_json::Value>(text).ok())
                    .filter(|value| value["type"] == "auth")
                    .and_then(|value| value["payload"]["token"].as_str().map(str::to_owned))
                    .and_then(|token| jwt_config.validate_token(&token).ok());
                if let Some(claims) = claims {
                    let mut locked = clients.write().await;
                    if locked.get(&requested_id).is_some_and(|existing| {
                        existing.authenticated
                            && existing.user_id == claims.sub
                            && existing.sender.is_closed()
                    }) {
                        locked.remove(&client_id);
                        let existing = locked.get_mut(&requested_id).unwrap();
                        existing.sender = client_sender.clone();
                        existing.last_seen = now_ms();
                        resumed_room = existing.room_id.clone();
                        client_id = requested_id.clone();
                        info!("Authenticated client {} resumed", client_id);
                        send_client_hello(&client_id, &locked);
                    }
                }
            }
            if !clients
                .read()
                .await
                .get(&client_id)
                .is_some_and(|client| client.sender.same_channel(&client_sender))
            {
                break;
            }
            client_msg(&client_id, msg, &clients, &rooms, &jwt_config).await;
            if let Some(room_id) = resumed_room {
                crate::room::resend_room_state(&client_id, &room_id, &clients, &rooms).await;
            }
        }
    }

    forward_task.abort();
    crate::room::schedule_transport_disconnect(client_id, client_sender, clients, rooms);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn register_client_jwt_disabled() {
        let (tx, _rx) = mpsc::channel(10);
        let jwt_config = Arc::new(JwtConfig {
            secret: String::new(),
            audience: "test".to_string(),
            issuer: "test".to_string(),
            enabled: false,
        });
        let client = register_client(tx, &jwt_config);
        assert!(client.authenticated);
        assert_eq!(client.user_id, "anonymous");
        assert_eq!(client.user_name, "Anonymous");
    }

    #[test]
    fn register_client_jwt_enabled() {
        let (tx, _rx) = mpsc::channel(10);
        let jwt_config = Arc::new(JwtConfig {
            secret: "some-secret".to_string(),
            audience: "test".to_string(),
            issuer: "test".to_string(),
            enabled: true,
        });
        let client = register_client(tx, &jwt_config);
        assert!(!client.authenticated);
        assert_eq!(client.user_id, "");
        assert_eq!(client.user_name, "");
    }

    #[test]
    fn plausible_client_id_accepts_uuid() {
        assert!(is_plausible_client_id(
            "550e8400-e29b-41d4-a716-446655440000"
        ));
    }

    #[test]
    fn plausible_client_id_rejects_garbage() {
        assert!(!is_plausible_client_id("not-a-uuid"));
        assert!(!is_plausible_client_id(""));
        assert!(!is_plausible_client_id(&"a".repeat(500)));
    }

    async fn receive_json(socket: &mut warp::test::WsClient) -> serde_json::Value {
        let message = tokio::time::timeout(std::time::Duration::from_secs(3), socket.recv())
            .await
            .unwrap()
            .unwrap();
        serde_json::from_str(message.to_str().unwrap()).unwrap()
    }

    async fn check_resume(user: &str, old_transport_open: bool) {
        use warp::Filter;
        let clients = crate::test_helpers::create_clients();
        let rooms = crate::test_helpers::create_rooms();
        let original_id = "550e8400-e29b-41d4-a716-446655440000";
        let (mut existing, rx) = crate::test_helpers::create_client_with_rx("owner", "Owner", true);
        existing.room_id = Some("room-1".into());
        clients.write().await.insert(original_id.into(), existing);
        rooms.write().await.insert(
            "room-1".into(),
            crate::test_helpers::create_room("room-1", original_id),
        );
        let held_receiver = if old_transport_open {
            Some(rx)
        } else {
            drop(rx);
            None
        };
        let config = Arc::new(JwtConfig {
            secret: "test-secret-for-resumption-tests-only".into(),
            audience: "test".into(),
            issuer: "test".into(),
            enabled: true,
        });
        let claims = crate::auth::Claims {
            sub: user.into(),
            name: user.into(),
            aud: "test".into(),
            iss: "test".into(),
            exp: (now_ms() / 1000 + 300) as usize,
            iat: (now_ms() / 1000) as usize,
        };
        let token = jsonwebtoken::encode(
            &jsonwebtoken::Header::default(),
            &claims,
            &jsonwebtoken::EncodingKey::from_secret(config.secret.as_bytes()),
        )
        .unwrap();
        let test_clients = clients.clone();
        let filter = warp::ws().map(move |ws: warp::ws::Ws| {
            let clients = test_clients.clone();
            let rooms = rooms.clone();
            let config = config.clone();
            ws.on_upgrade(move |socket| {
                client_connection(socket, clients, rooms, config, Some(original_id.into()))
            })
        });
        let mut socket = warp::test::ws().handshake(filter).await.unwrap();
        let hello = receive_json(&mut socket).await;
        let provisional = hello["payload"]["client_id"].as_str().unwrap().to_string();
        assert_ne!(provisional, original_id);
        // Before authentication, even a requested owner's public ID cannot read rooms.
        socket
            .send(warp::ws::Message::text(r#"{"type":"list_rooms","ts":1}"#))
            .await;
        assert_eq!(receive_json(&mut socket).await["type"], "error");
        socket
            .send(warp::ws::Message::text(
                serde_json::json!({"type":"auth","payload":{"token":token},"ts":1}).to_string(),
            ))
            .await;
        if user == "owner" && !old_transport_open {
            assert_eq!(
                receive_json(&mut socket).await["payload"]["client_id"],
                original_id
            );
            assert_eq!(receive_json(&mut socket).await["type"], "auth_success");
            assert_eq!(receive_json(&mut socket).await["type"], "room_list");
            assert_eq!(receive_json(&mut socket).await["room"], "room-1");
            assert!(!clients.read().await.contains_key(&provisional));
        } else {
            assert_eq!(receive_json(&mut socket).await["type"], "auth_success");
            assert_eq!(receive_json(&mut socket).await["type"], "room_list");
            let locked = clients.read().await;
            assert_eq!(locked.get(original_id).unwrap().user_id, "owner");
            assert!(locked.get(&provisional).unwrap().room_id.is_none());
        }
        drop(held_receiver);
    }

    #[tokio::test]
    async fn same_user_can_resume_a_disconnected_transport() {
        check_resume("owner", false).await;
    }
    #[tokio::test]
    async fn another_user_cannot_resume_a_public_participant_id() {
        check_resume("guest", false).await;
    }
    #[tokio::test]
    async fn a_second_tab_cannot_replace_an_active_transport() {
        check_resume("owner", true).await;
    }
}
