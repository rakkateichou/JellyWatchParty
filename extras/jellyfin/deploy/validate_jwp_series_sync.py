#!/usr/bin/env python3
"""Live protocol smoke test for JellyWatchParty episode transitions."""

import base64
import hashlib
import hmac
import json
import os
import socket
import struct
import sys
import time
import uuid


def b64url(data):
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def load_env(path):
    values = {}
    with open(path, encoding="utf-8") as handle:
        for raw_line in handle:
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def make_jwt(env):
    now = int(time.time())
    header = {"alg": "HS256", "typ": "JWT"}
    claims = {
        "sub": "series-sync-smoke-test",
        "name": "Series Sync Test",
        "aud": env.get("JWT_AUDIENCE", "JellyWatchParty"),
        "iss": env.get("JWT_ISSUER", "Jellyfin"),
        "iat": now,
        "exp": now + 300,
    }
    unsigned = ".".join(
        b64url(json.dumps(part, separators=(",", ":")).encode("utf-8"))
        for part in (header, claims)
    )
    signature = hmac.new(
        env["JWT_SECRET"].encode("utf-8"), unsigned.encode("ascii"), hashlib.sha256
    ).digest()
    return f"{unsigned}.{b64url(signature)}"


class WebSocketClient:
    def __init__(self, host, port, client_id):
        self.socket = socket.create_connection((host, port), timeout=8)
        self.socket.settimeout(8)
        self.buffer = b""
        key = base64.b64encode(os.urandom(16)).decode("ascii")
        request = (
            f"GET /ws?client_id={client_id} HTTP/1.1\r\n"
            f"Host: {host}:{port}\r\n"
            "Origin: https://jellyfin.rkde.su\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {key}\r\n"
            "Sec-WebSocket-Version: 13\r\n\r\n"
        )
        self.socket.sendall(request.encode("ascii"))
        response = b""
        while b"\r\n\r\n" not in response:
            response += self.socket.recv(4096)
        headers, self.buffer = response.split(b"\r\n\r\n", 1)
        if not headers.startswith(b"HTTP/1.1 101"):
            raise RuntimeError(f"WebSocket upgrade failed: {headers.splitlines()[0]!r}")

    def _read_exactly(self, length):
        while len(self.buffer) < length:
            chunk = self.socket.recv(4096)
            if not chunk:
                raise EOFError("WebSocket closed")
            self.buffer += chunk
        value, self.buffer = self.buffer[:length], self.buffer[length:]
        return value

    def _send_frame(self, opcode, payload=b""):
        mask = os.urandom(4)
        length = len(payload)
        frame = bytearray([0x80 | opcode])
        if length < 126:
            frame.append(0x80 | length)
        elif length < 65536:
            frame.append(0x80 | 126)
            frame.extend(struct.pack("!H", length))
        else:
            frame.append(0x80 | 127)
            frame.extend(struct.pack("!Q", length))
        frame.extend(mask)
        frame.extend(byte ^ mask[index % 4] for index, byte in enumerate(payload))
        self.socket.sendall(frame)

    def send(self, message):
        self._send_frame(0x1, json.dumps(message, separators=(",", ":")).encode("utf-8"))

    def receive(self):
        while True:
            first, second = self._read_exactly(2)
            opcode = first & 0x0F
            length = second & 0x7F
            if length == 126:
                length = struct.unpack("!H", self._read_exactly(2))[0]
            elif length == 127:
                length = struct.unpack("!Q", self._read_exactly(8))[0]
            mask = self._read_exactly(4) if second & 0x80 else None
            payload = self._read_exactly(length)
            if mask:
                payload = bytes(byte ^ mask[index % 4] for index, byte in enumerate(payload))
            if opcode == 0x9:
                self._send_frame(0xA, payload)
                continue
            if opcode == 0x8:
                raise EOFError("WebSocket closed by server")
            if opcode == 0x1:
                return json.loads(payload.decode("utf-8"))

    def receive_type(self, message_type):
        deadline = time.time() + 8
        while time.time() < deadline:
            message = self.receive()
            if message.get("type") == "error":
                raise RuntimeError(message.get("payload", {}).get("message", "server error"))
            if message.get("type") == message_type:
                return message
        raise TimeoutError(f"No {message_type} message received")

    def close(self):
        try:
            self._send_frame(0x8)
        finally:
            self.socket.close()


def message(message_type, room=None, payload=None):
    result = {"type": message_type, "ts": int(time.time() * 1000)}
    if room:
        result["room"] = room
    if payload is not None:
        result["payload"] = payload
    return result


def connect_and_auth(host, port, token):
    client = WebSocketClient(host, port, str(uuid.uuid4()))
    client.client_id = client.receive_type("client_hello")["payload"]["client_id"]
    client.send(message("auth", payload={"token": token}))
    client.receive_type("auth_success")
    return client


def main():
    if len(sys.argv) != 4:
        raise SystemExit("usage: validate_jwp_series_sync.py HOST PORT ENV_FILE")
    host, port, env_file = sys.argv[1], int(sys.argv[2]), sys.argv[3]
    token = make_jwt(load_env(env_file))
    first_episode = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    second_episode = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    host_client = guest_client = late_client = None
    room = None
    try:
        host_client = connect_and_auth(host, port, token)
        guest_client = connect_and_auth(host, port, token)
        host_client.send(message("create_room", payload={
            "media_id": first_episode,
            "start_pos": 3.0,
            "user_name": "Series Sync Host",
        }))
        created = host_client.receive_type("room_state")
        room = created["room"]

        guest_client.send(message("join_room", room, {"user_name": "Series Sync Guest"}))
        joined = guest_client.receive_type("room_state")
        assert joined["payload"]["media_id"] == first_episode

        guest_client.send(message("ready", room, {"media_id": first_episode}))
        host_client.send(message("player_event", room, {
            "action": "play",
            "media_id": first_episode,
            "position": 5.0,
            "play_state": "playing",
        }))
        first_play = guest_client.receive_type("player_event")
        assert first_play["payload"]["action"] == "play"

        host_client.send(message("player_event", room, {
            "action": "pause",
            "media_id": first_episode,
            "position": 8.0,
            "play_state": "paused",
        }))
        paused = guest_client.receive_type("player_event")
        assert paused["payload"]["action"] == "pause"

        host_client.send(message("player_event", room, {
            "action": "play",
            "media_id": first_episode,
            "position": 8.0,
            "play_state": "playing",
        }))
        resumed = guest_client.receive_type("player_event")
        assert resumed["payload"]["action"] == "play"

        guest_client.send(message("chat_message", room, {"text": "chat-survives-episode-change"}))
        host_client.receive_type("chat_message")

        host_client.send(message("state_update", room, {
            "media_id": second_episode,
            "position": 17.25,
            "play_state": "playing",
        }))
        changed = guest_client.receive_type("state_update")
        assert changed["payload"]["media_id"] == second_episode
        assert changed["payload"]["position"] == 17.25

        late_client = connect_and_auth(host, port, token)
        late_client.send(message("join_room", room, {"user_name": "Late Series Guest"}))
        late_state = late_client.receive_type("room_state")
        assert late_state["payload"]["media_id"] == second_episode
        history = late_state["payload"].get("chat_history", [])
        assert any(entry.get("text") == "chat-survives-episode-change" for entry in history)
        print("PASS: pause/resume synced; episode, room, late join and chat persisted")
    finally:
        for client in (late_client, guest_client, host_client):
            if client:
                try:
                    if room:
                        client.send(message("leave_room", room))
                    client.close()
                except Exception:
                    pass


if __name__ == "__main__":
    main()
