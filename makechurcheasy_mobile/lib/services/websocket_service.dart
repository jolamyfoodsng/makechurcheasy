/// WebSocket service — manages the connection to the Tauri backend.
///
/// Protocol (JSON lines):
///   Client → Server: { "type": "auth", "token": "..." }
///   Server → Client: { "type": "auth_ok" } | { "type": "auth_failed", "error": "..." }
///   Server → Client: { "type": "state_update", "state": { ... } }
///   Client → Server: { "type": "ping" }
///   Server → Client: { "type": "pong" }
///
/// Command types sent by client:
///   show_scripture, clear_scripture, show_slide, next_slide,
///   prev_slide, clear_worship, show_lower_third, clear_lower_third
library;

import 'dart:async';
import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

import '../models/desktop_state.dart';

enum ConnectionState { disconnected, connecting, connected, authFailed }

class WsService extends AutoDisposeAsyncNotifier<DesktopState> {
  WebSocketChannel? _channel;
  StreamSubscription? _subscription;
  Timer? _pingTimer;
  Timer? _reconnectTimer;
  String? _serverUrl;
  String? _token;
  bool _intentionalDisconnect = false;

  ConnectionState _connectionState = ConnectionState.disconnected;
  ConnectionState get connectionState => _connectionState;

  DesktopState get _current => state.valueOrNull ?? const DesktopState();

  @override
  Future<DesktopState> build() async => const DesktopState();

  /// Connect to the desktop WebSocket server.
  void connect(String url, String token) {
    _intentionalDisconnect = false;
    _serverUrl = url;
    _token = token;
    _doConnect();
  }

  void _doConnect() {
    if (_serverUrl == null || _token == null) return;
    _connectionState = ConnectionState.connecting;
    _updateState(_current.copyWith(obsConnected: false));

    try {
      _channel = WebSocketChannel.connect(Uri.parse(_serverUrl!));
      _subscription = _channel!.stream.listen(
        _onMessage,
        onError: _onError,
        onDone: _onDone,
      );

      // Authenticate immediately after connecting
      _send({'type': 'auth', 'token': _token});

      // Start ping keepalive
      _pingTimer?.cancel();
      _pingTimer = Timer.periodic(const Duration(seconds: 15), (_) => _send({'type': 'ping'}));
    } catch (e) {
      _connectionState = ConnectionState.disconnected;
      _scheduleReconnect();
    }
  }

  void _onMessage(dynamic raw) {
    try {
      final msg = jsonDecode(raw as String) as Map<String, dynamic>;
      final type = msg['type'] as String?;

      switch (type) {
        case 'auth_ok':
          _connectionState = ConnectionState.connected;
          _updateState(_current.copyWith(obsConnected: true));
          break;
        case 'auth_failed':
          _connectionState = ConnectionState.authFailed;
          _updateState(_current.copyWith(obsConnected: false));
          break;
        case 'state_update':
          // Rust sends flat fields: { "type": "state_update", "obs_connected": ..., "current_song": ... }
          _updateState(DesktopState(
            obsConnected: msg['obs_connected'] as bool? ?? false,
            currentSong: msg['current_song'] as String?,
            currentSlide: msg['current_slide'] as int?,
            currentScripture: msg['current_scripture'] as String?,
            currentLowerThird: msg['current_lower_third'] as String?,
          ));
          break;
        case 'pong':
          // Keepalive acknowledged
          break;
      }
    } catch (_) {
      // Ignore malformed messages
    }
  }

  void _onError(Object error) {
    _connectionState = ConnectionState.disconnected;
    _updateState(_current.copyWith(obsConnected: false));
    _scheduleReconnect();
  }

  void _onDone() {
    _connectionState = ConnectionState.disconnected;
    _updateState(_current.copyWith(obsConnected: false));
    if (!_intentionalDisconnect) {
      _scheduleReconnect();
    }
  }

  void _scheduleReconnect() {
    _reconnectTimer?.cancel();
    _reconnectTimer = Timer(const Duration(seconds: 3), () {
      if (!_intentionalDisconnect) _doConnect();
    });
  }

  void _updateState(DesktopState newState) {
    state = AsyncData(newState);
  }

  void _send(Map<String, dynamic> msg) {
    try {
      _channel?.sink.add(jsonEncode(msg));
    } catch (_) {}
  }

  // ── Public commands ──

  void showScripture(String reference, String text) {
    _send({'type': 'show_scripture', 'reference': reference, 'verse_text': text});
  }

  void clearScripture() {
    _send({'type': 'clear_scripture'});
  }

  void showSlide(String songId, int slideIndex) {
    _send({'type': 'show_slide', 'song_id': songId, 'slide_index': slideIndex});
  }

  void nextSlide() {
    _send({'type': 'next_slide'});
  }

  void prevSlide() {
    _send({'type': 'prev_slide'});
  }

  void clearWorship() {
    _send({'type': 'clear_worship'});
  }

  void showLowerThird(String name, String title) {
    _send({'type': 'show_lower_third', 'name': name, 'title': title});
  }

  void clearLowerThird() {
    _send({'type': 'clear_lower_third'});
  }

  void disconnect() {
    _intentionalDisconnect = true;
    _pingTimer?.cancel();
    _reconnectTimer?.cancel();
    _subscription?.cancel();
    _channel?.sink.close();
    _channel = null;
    _connectionState = ConnectionState.disconnected;
    _updateState(const DesktopState());
  }
}

final wsServiceProvider = AsyncNotifierProvider.autoDispose<WsService, DesktopState>(
  WsService.new,
);
