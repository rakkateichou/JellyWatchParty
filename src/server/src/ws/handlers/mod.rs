mod auth;
mod chat;
mod create;
mod cursor;
mod delete;
mod invite;
mod join;
mod misc;
mod playback;
mod rtc;

pub(in crate::ws) use auth::handle_auth;
pub(in crate::ws) use chat::handle_chat_message;
pub(in crate::ws) use create::handle_create_room;
pub(in crate::ws) use cursor::handle_cursor_update;
pub(in crate::ws) use delete::handle_delete_room;
pub(in crate::ws) use invite::handle_invite_update;
pub(in crate::ws) use join::handle_join_room;
pub(in crate::ws) use misc::{
    handle_client_log, handle_leave_room, handle_ping, handle_ready, handle_unknown,
};
pub(in crate::ws) use playback::handle_playback;
pub(in crate::ws) use rtc::handle_rtc_signal;
