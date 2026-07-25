import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import 'desktop_service.dart';

/// Desktop state pushed via StateUpdate messages.
class DesktopState {
  final bool obsConnected;
  final String? currentSong;
  final int? currentSlide;
  final String? currentScripture;
  final String? currentLowerThird;

  const DesktopState({
    this.obsConnected = false,
    this.currentSong,
    this.currentSlide,
    this.currentScripture,
    this.currentLowerThird,
  });

  factory DesktopState.fromJson(Map<String, dynamic> json) {
    return DesktopState(
      obsConnected: json['obs_connected'] as bool? ?? false,
      currentSong: json['current_song'] as String?,
      currentSlide: json['current_slide'] as int?,
      currentScripture: json['current_scripture'] as String?,
      currentLowerThird: json['current_lower_third'] as String?,
    );
  }
}

enum WebSocketEventType {
  authenticated,
  authFailed,
  stateUpdate,
  pong,
  error,
  disconnected,
  unknown,
}

class WebSocketEvent {
  final WebSocketEventType type;
  final Map<String, dynamic> data;

  const WebSocketEvent({required this.type, this.data = const {}});
}

class WebSocketService extends ChangeNotifier {
  final DesktopService _desktopService;
  WebSocketChannel? _channel;
  Timer? _heartbeatTimer;
  Timer? _reconnectTimer;
  bool _isConnected = false;
  bool _isAuthenticated = false;
  int _reconnectAttempts = 0;
  static const _maxReconnectAttempts = 5;

  DesktopState _desktopState = const DesktopState();
  DesktopState get desktopState => _desktopState;

  final StreamController<WebSocketEvent> _eventController =
      StreamController<WebSocketEvent>.broadcast();

  WebSocketService({required DesktopService desktopService})
      : _desktopService = desktopService;

  Stream<WebSocketEvent> get events => _eventController.stream;
  bool get isConnected => _isConnected;
  bool get isAuthenticated => _isAuthenticated;

  // ── Connect ─────────────────────────────────────────────────────────────

  /// Connect to desktop WebSocket and authenticate.
  void connect() {
    final info = _desktopService.currentDesktop;
    final token = _desktopService.pairingToken;
    if (info == null || token == null || info.ip == null) return;

    final wsPort = info.wsPort ?? 8765;
    final wsUrl = 'ws://${info.ip}:$wsPort';

    disconnect();

    try {
      _channel = WebSocketChannel.connect(Uri.parse(wsUrl));
      _isConnected = true;
      _reconnectAttempts = 0;
      notifyListeners();

      // Send auth immediately after connecting
      _channel!.sink.add(jsonEncode({
        'type': 'auth',
        'token': token,
      }));

      _channel!.stream.listen(
        _onMessage,
        onDone: _onDisconnected,
        onError: _onError,
      );

      _startHeartbeat();
    } catch (e) {
      _isConnected = false;
      notifyListeners();
      _scheduleReconnect();
    }
  }

  // ── Message handling ────────────────────────────────────────────────────

  void _onMessage(dynamic message) {
    try {
      final json = jsonDecode(message as String) as Map<String, dynamic>;
      final type = json['type'] as String? ?? '';

      switch (type) {
        case 'auth_ok':
          _isAuthenticated = true;
          _desktopService.markConnected();
          _eventController.add(const WebSocketEvent(
            type: WebSocketEventType.authenticated,
          ));
          notifyListeners();

        case 'auth_failed':
          final reason = json['reason'] as String? ?? 'Authentication failed';
          _isAuthenticated = false;
          _desktopService.markFailed(reason: reason);
          _eventController.add(WebSocketEvent(
            type: WebSocketEventType.authFailed,
            data: {'reason': reason},
          ));
          // Desktop closes connection after auth_failed
          break;

        case 'state_update':
          _desktopState = DesktopState.fromJson(json);
          _eventController.add(WebSocketEvent(
            type: WebSocketEventType.stateUpdate,
            data: json,
          ));
          notifyListeners();

        case 'pong':
          _eventController.add(const WebSocketEvent(
            type: WebSocketEventType.pong,
          ));

        case 'error':
          final msg = json['message'] as String? ?? 'Unknown error';
          _eventController.add(WebSocketEvent(
            type: WebSocketEventType.error,
            data: {'message': msg},
          ));

        default:
          _eventController.add(WebSocketEvent(
            type: WebSocketEventType.unknown,
            data: json,
          ));
      }
    } catch (_) {
      // Ignore malformed messages
    }
  }

  void _onDisconnected() {
    _isConnected = false;
    _isAuthenticated = false;
    _stopHeartbeat();
    notifyListeners();
    _eventController.add(const WebSocketEvent(
      type: WebSocketEventType.disconnected,
    ));
    if (_desktopService.isConnected) {
      _scheduleReconnect();
    }
  }

  void _onError(Object error) {
    _isConnected = false;
    _isAuthenticated = false;
    _stopHeartbeat();
    notifyListeners();
    _scheduleReconnect();
  }

  // ── Heartbeat ───────────────────────────────────────────────────────────

  void _startHeartbeat() {
    _heartbeatTimer?.cancel();
    _heartbeatTimer = Timer.periodic(const Duration(seconds: 30), (_) {
      if (_isConnected && _channel != null) {
        try {
          _channel!.sink.add(jsonEncode({'type': 'ping'}));
        } catch (e) {
          _onDisconnected();
        }
      }
    });
  }

  void _stopHeartbeat() {
    _heartbeatTimer?.cancel();
    _heartbeatTimer = null;
  }

  // ── Reconnect ───────────────────────────────────────────────────────────

  void _scheduleReconnect() {
    if (_reconnectAttempts >= _maxReconnectAttempts) return;
    _reconnectTimer?.cancel();

    final delay = Duration(seconds: 2 * (_reconnectAttempts + 1));
    _reconnectAttempts++;

    _reconnectTimer = Timer(delay, () {
      if (!_isConnected && _desktopService.isConnected) {
        connect();
      }
    });
  }

  // ── Commands ────────────────────────────────────────────────────────────

  /// Send a command to the desktop.
  void sendCommand(Map<String, dynamic> command) {
    if (!_isConnected || !_isAuthenticated || _channel == null) return;
    _channel!.sink.add(jsonEncode(command));
  }

  void showScripture(String reference, {String? translation, String? verseText}) {
    sendCommand({
      'type': 'show_scripture',
      'reference': reference,
      if (translation != null) 'translation': translation,
      if (verseText != null) 'verse_text': verseText,
    });
  }

  void clearScripture() {
    sendCommand({'type': 'clear_scripture'});
  }

  void showSlide(String songId, int slideIndex) {
    sendCommand({
      'type': 'show_slide',
      'song_id': songId,
      'slide_index': slideIndex,
    });
  }

  void nextSlide() => sendCommand({'type': 'next_slide'});
  void prevSlide() => sendCommand({'type': 'prev_slide'});
  void clearWorship() => sendCommand({'type': 'clear_worship'});

  void showLowerThird(String name, String title) {
    sendCommand({
      'type': 'show_lower_third',
      'name': name,
      'title': title,
    });
  }

  void clearLowerThird() => sendCommand({'type': 'clear_lower_third'});

  // ── Disconnect / Dispose ────────────────────────────────────────────────

  void disconnect() {
    _stopHeartbeat();
    _reconnectTimer?.cancel();
    _channel?.sink.close();
    _channel = null;
    _isConnected = false;
    _isAuthenticated = false;
    notifyListeners();
  }

  @override
  void dispose() {
    disconnect();
    _eventController.close();
    super.dispose();
  }
}
