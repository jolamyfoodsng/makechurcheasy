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
  final String? currentProgramScene;
  final String? currentPreviewScene;
  final bool studioModeEnabled;
  final bool streamActive;
  final bool recordingActive;
  final double activeFps;
  final String? micInputName;
  final bool micMuted;

  const DesktopState({
    this.obsConnected = false,
    this.currentSong,
    this.currentSlide,
    this.currentScripture,
    this.currentLowerThird,
    this.currentProgramScene,
    this.currentPreviewScene,
    this.studioModeEnabled = false,
    this.streamActive = false,
    this.recordingActive = false,
    this.activeFps = 0,
    this.micInputName,
    this.micMuted = false,
  });

  factory DesktopState.fromJson(Map<String, dynamic> json) {
    return DesktopState(
      obsConnected: json['obs_connected'] as bool? ?? false,
      currentSong: json['current_song'] as String?,
      currentSlide: json['current_slide'] as int?,
      currentScripture: json['current_scripture'] as String?,
      currentLowerThird: json['current_lower_third'] as String?,
      currentProgramScene:
          json['currentProgramScene'] as String? ??
          json['current_program_scene'] as String?,
      currentPreviewScene:
          json['currentPreviewScene'] as String? ??
          json['current_preview_scene'] as String?,
      studioModeEnabled:
          json['studioModeEnabled'] as bool? ??
          json['studio_mode_enabled'] as bool? ??
          false,
      streamActive:
          json['streamActive'] as bool? ??
          json['stream_active'] as bool? ??
          false,
      recordingActive:
          json['recordingActive'] as bool? ??
          json['recording_active'] as bool? ??
          false,
      activeFps:
          (json['activeFps'] as num?)?.toDouble() ??
          (json['active_fps'] as num?)?.toDouble() ??
          0,
      micInputName:
          json['micInputName'] as String? ?? json['mic_input_name'] as String?,
      micMuted:
          json['micMuted'] as bool? ?? json['mic_muted'] as bool? ?? false,
    );
  }

  DesktopState copyWith({
    bool? obsConnected,
    String? currentSong,
    int? currentSlide,
    String? currentScripture,
    String? currentLowerThird,
    String? currentProgramScene,
    String? currentPreviewScene,
    bool? studioModeEnabled,
    bool? streamActive,
    bool? recordingActive,
    double? activeFps,
    String? micInputName,
    bool? micMuted,
  }) {
    return DesktopState(
      obsConnected: obsConnected ?? this.obsConnected,
      currentSong: currentSong ?? this.currentSong,
      currentSlide: currentSlide ?? this.currentSlide,
      currentScripture: currentScripture ?? this.currentScripture,
      currentLowerThird: currentLowerThird ?? this.currentLowerThird,
      currentProgramScene: currentProgramScene ?? this.currentProgramScene,
      currentPreviewScene: currentPreviewScene ?? this.currentPreviewScene,
      studioModeEnabled: studioModeEnabled ?? this.studioModeEnabled,
      streamActive: streamActive ?? this.streamActive,
      recordingActive: recordingActive ?? this.recordingActive,
      activeFps: activeFps ?? this.activeFps,
      micInputName: micInputName ?? this.micInputName,
      micMuted: micMuted ?? this.micMuted,
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
  String? _lastAuthFailureReason;
  int _reconnectAttempts = 0;
  static const _maxReconnectAttempts = 5;
  int _commandSequence = 0;
  final Map<String, Completer<Map<String, dynamic>>> _pendingCommands = {};

  DesktopState _desktopState = const DesktopState();
  DesktopState get desktopState => _desktopState;

  final StreamController<WebSocketEvent> _eventController =
      StreamController<WebSocketEvent>.broadcast();

  WebSocketService({required DesktopService desktopService})
    : _desktopService = desktopService;

  Stream<WebSocketEvent> get events => _eventController.stream;
  bool get isConnected => _isConnected;
  bool get isAuthenticated => _isAuthenticated;
  String? get lastAuthFailureReason => _lastAuthFailureReason;

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
      _channel!.sink.add(jsonEncode({'type': 'auth', 'token': token}));

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
          _lastAuthFailureReason = null;
          _desktopService.markConnected();
          _eventController.add(
            const WebSocketEvent(type: WebSocketEventType.authenticated),
          );
          notifyListeners();

        case 'auth_failed':
          final reason = json['reason'] as String? ?? 'Authentication failed';
          _isAuthenticated = false;
          _lastAuthFailureReason = reason;
          _desktopService.markFailed(reason: reason);
          _eventController.add(
            WebSocketEvent(
              type: WebSocketEventType.authFailed,
              data: {'reason': reason},
            ),
          );
          // Desktop closes connection after auth_failed
          break;

        case 'state_update':
          _desktopState = DesktopState.fromJson(json);
          _eventController.add(
            WebSocketEvent(type: WebSocketEventType.stateUpdate, data: json),
          );
          notifyListeners();

        case 'pong':
          _eventController.add(
            const WebSocketEvent(type: WebSocketEventType.pong),
          );

        case 'error':
          final msg = json['message'] as String? ?? 'Unknown error';
          _eventController.add(
            WebSocketEvent(
              type: WebSocketEventType.error,
              data: {'message': msg},
            ),
          );

        case 'command_result':
          final commandId = json['command_id'] as String?;
          final payload = json['payload'];
          if (payload is Map) {
            final payloadMap = Map<String, dynamic>.from(payload);
            final currentProgramScene = payloadMap['currentProgramScene']
                ?.toString();
            final currentPreviewScene = payloadMap['currentPreviewScene']
                ?.toString();
            final hasDesktopState =
                currentProgramScene != null ||
                currentPreviewScene != null ||
                payloadMap.containsKey('obsConnected') ||
                payloadMap.containsKey('studioModeEnabled') ||
                payloadMap.containsKey('streamActive') ||
                payloadMap.containsKey('recordingActive') ||
                payloadMap.containsKey('activeFps') ||
                payloadMap.containsKey('micMuted');
            if (hasDesktopState) {
              _desktopState = _desktopState.copyWith(
                obsConnected: payloadMap['obsConnected'] as bool?,
                currentProgramScene: currentProgramScene,
                currentPreviewScene: currentPreviewScene,
                studioModeEnabled: payloadMap['studioModeEnabled'] as bool?,
                streamActive: payloadMap['streamActive'] as bool?,
                recordingActive: payloadMap['recordingActive'] as bool?,
                activeFps: (payloadMap['activeFps'] as num?)?.toDouble(),
                micInputName: payloadMap['micInputName'] as String?,
                micMuted: payloadMap['micMuted'] as bool?,
              );
              notifyListeners();
            }
          }
          if (commandId != null) {
            final completer = _pendingCommands.remove(commandId);
            if (completer != null && !completer.isCompleted) {
              completer.complete(json);
            }
          }

        default:
          _eventController.add(
            WebSocketEvent(type: WebSocketEventType.unknown, data: json),
          );
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
    _eventController.add(
      const WebSocketEvent(type: WebSocketEventType.disconnected),
    );
    if (_desktopService.pairingToken != null) {
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
      if (!_isConnected && _desktopService.pairingToken != null) {
        connect();
      }
    });
  }

  // ── Commands ────────────────────────────────────────────────────────────

  /// Send a command to the desktop.
  Future<Map<String, dynamic>> sendCommand(Map<String, dynamic> command) async {
    if (!_isConnected || !_isAuthenticated || _channel == null) {
      throw Exception('Desktop is not connected');
    }

    final commandId =
        'm${DateTime.now().millisecondsSinceEpoch}_${_commandSequence++}';
    final completer = Completer<Map<String, dynamic>>();
    _pendingCommands[commandId] = completer;

    _channel!.sink.add(jsonEncode({...command, 'command_id': commandId}));

    final result = await completer.future.timeout(
      const Duration(seconds: 15),
      onTimeout: () {
        _pendingCommands.remove(commandId);
        throw TimeoutException('Desktop command timed out');
      },
    );

    if (result['ok'] != true) {
      throw Exception(result['error'] as String? ?? 'Desktop command failed');
    }

    return result;
  }

  Future<void> showScripture(
    String reference, {
    String? translation,
    String? verseText,
    String? displayReferenceLabel,
    String? overlayMode,
    bool? compareEnabled,
    String? compareLayout,
    String? compareMode,
    String? translationA,
    String? translationB,
    String? compareVerseTextA,
    String? compareVerseTextB,
    List<Map<String, dynamic>>? comparePassages,
  }) async {
    final command = <String, dynamic>{
      'type': 'show_scripture',
      'reference': reference,
    };
    if (translation != null) command['translation'] = translation;
    if (verseText != null) command['verse_text'] = verseText;
    if (displayReferenceLabel != null) {
      command['display_reference_label'] = displayReferenceLabel;
    }
    if (overlayMode != null) command['overlay_mode'] = overlayMode;
    if (compareEnabled != null) command['compare_enabled'] = compareEnabled;
    if (compareLayout != null) command['compare_layout'] = compareLayout;
    if (compareMode != null) command['compare_mode'] = compareMode;
    if (translationA != null) command['translation_a'] = translationA;
    if (translationB != null) command['translation_b'] = translationB;
    if (compareVerseTextA != null) {
      command['compare_verse_text_a'] = compareVerseTextA;
    }
    if (compareVerseTextB != null) {
      command['compare_verse_text_b'] = compareVerseTextB;
    }
    if (comparePassages != null) command['compare_passages'] = comparePassages;
    await sendCommand(command);
  }

  Future<void> clearScripture() async {
    await sendCommand({'type': 'clear_scripture'});
  }

  Future<List<Map<String, dynamic>>> getBibleTranslations() async {
    final result = await sendCommand({'type': 'get_bible_translations'});
    final payload = result['payload'];
    if (payload is List) {
      return payload
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList();
    }
    return const [];
  }

  Future<Map<String, dynamic>> getBibleChapter({
    required String book,
    required int chapter,
    required String translation,
  }) async {
    final result = await sendCommand({
      'type': 'get_bible_chapter',
      'book': book,
      'chapter': chapter,
      'translation': translation,
    });
    final payload = result['payload'];
    return payload is Map ? Map<String, dynamic>.from(payload) : {};
  }

  Future<Map<String, dynamic>> getBiblePresentationStyle() async {
    final result = await sendCommand({'type': 'get_bible_presentation_style'});
    final payload = result['payload'];
    return payload is Map ? Map<String, dynamic>.from(payload) : {};
  }

  Future<Map<String, dynamic>> getTextPresentationStyle(String surface) async {
    final result = await sendCommand({
      'type': 'get_text_presentation_style',
      'surface': surface,
    });
    final payload = result['payload'];
    return payload is Map ? Map<String, dynamic>.from(payload) : {};
  }

  Future<Map<String, dynamic>> saveTextPresentationControls({
    required String surface,
    Map<String, dynamic>? patch,
    int? lineCount,
    String? lineMode,
    String? quickAlignment,
  }) async {
    final command = <String, dynamic>{
      'type': 'save_text_presentation_controls',
      'surface': surface,
    };
    if (patch != null && patch.isNotEmpty) command['patch'] = patch;
    if (lineCount != null) command['line_count'] = lineCount;
    if (lineMode != null) command['line_mode'] = lineMode;
    if (quickAlignment != null) command['quick_alignment'] = quickAlignment;
    final result = await sendCommand(command);
    final payload = result['payload'];
    return payload is Map ? Map<String, dynamic>.from(payload) : {};
  }

  Future<Map<String, dynamic>> getBibleSearchSuggestions({
    String query = '',
    String? translation,
  }) async {
    final command = <String, dynamic>{
      'type': 'get_bible_search_suggestions',
      'query': query,
    };
    if (translation != null) command['translation'] = translation;
    final result = await sendCommand(command);
    final payload = result['payload'];
    return payload is Map ? Map<String, dynamic>.from(payload) : {};
  }

  Future<void> recordBibleSearch(String label) async {
    await sendCommand({'type': 'record_bible_search', 'label': label});
  }

  Future<void> showSlide(
    String songId,
    int slideIndex, {
    String? songTitle,
    String? artist,
    String? slideText,
    String? sectionLabel,
    String? overlayMode,
  }) async {
    final command = <String, dynamic>{
      'type': 'show_slide',
      'song_id': songId,
      'slide_index': slideIndex,
    };
    if (songTitle != null) command['song_title'] = songTitle;
    if (artist != null) command['artist'] = artist;
    if (slideText != null) command['slide_text'] = slideText;
    if (sectionLabel != null) command['section_label'] = sectionLabel;
    if (overlayMode != null) command['overlay_mode'] = overlayMode;
    await sendCommand(command);
  }

  Future<void> nextSlide({String? songId, int? slideIndex}) async {
    final command = <String, dynamic>{'type': 'next_slide'};
    if (songId != null) command['song_id'] = songId;
    if (slideIndex != null) command['slide_index'] = slideIndex;
    await sendCommand(command);
  }

  Future<void> prevSlide({String? songId, int? slideIndex}) async {
    final command = <String, dynamic>{'type': 'prev_slide'};
    if (songId != null) command['song_id'] = songId;
    if (slideIndex != null) command['slide_index'] = slideIndex;
    await sendCommand(command);
  }

  Future<void> clearWorship() async {
    await sendCommand({'type': 'clear_worship'});
  }

  Future<List<Map<String, dynamic>>> getWorshipLibrary() async {
    final result = await sendCommand({'type': 'get_worship_library'});
    final payload = result['payload'];
    if (payload is List) {
      return payload
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList();
    }
    return const [];
  }

  Future<List<Map<String, dynamic>>> getNotes() async {
    final result = await sendCommand({'type': 'get_notes'});
    final payload = result['payload'];
    if (payload is List) {
      return payload
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList();
    }
    return const [];
  }

  Future<List<Map<String, dynamic>>> saveNotes(
    List<Map<String, dynamic>> notes,
  ) async {
    final result = await sendCommand({'type': 'save_notes', 'notes': notes});
    final payload = result['payload'];
    if (payload is List) {
      return payload
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList();
    }
    return const [];
  }

  Future<void> showNote(Map<String, dynamic> note) async {
    await sendCommand({'type': 'show_note', 'note': note});
  }

  Future<void> clearNotes() async {
    await sendCommand({'type': 'clear_notes'});
  }

  Future<List<Map<String, dynamic>>> getMediaLibrary() async {
    final result = await sendCommand({'type': 'get_media_library'});
    final payload = result['payload'];
    if (payload is List) {
      return payload
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList();
    }
    return const [];
  }

  Future<String?> getMediaThumbnail(String mediaId) async {
    final result = await sendCommand({
      'type': 'get_media_thumbnail',
      'media_id': mediaId,
    });
    final payload = result['payload'];
    if (payload is! Map) return null;
    final value = payload['thumbnailUrl']?.toString().trim();
    return value == null || value.isEmpty ? null : value;
  }

  Future<Map<String, dynamic>> registerUploadedMedia({
    required String mediaId,
    required String name,
    required String mediaType,
    required String diskFileName,
    required int fileSize,
    required String mimeType,
  }) async {
    final result = await sendCommand({
      'type': 'register_uploaded_media',
      'media_id': mediaId,
      'name': name,
      'media_type': mediaType,
      'disk_file_name': diskFileName,
      'file_size': fileSize,
      'mime_type': mimeType,
    });
    final payload = result['payload'];
    return payload is Map ? Map<String, dynamic>.from(payload) : {};
  }

  Future<void> showMedia(
    String mediaId, {
    bool muted = true,
    bool looping = true,
    String fitMode = 'cover',
    String transition = 'cut',
  }) async {
    await sendCommand({
      'type': 'show_media',
      'media_id': mediaId,
      'muted': muted,
      'looping': looping,
      'fit_mode': fitMode,
      'transition': transition,
    });
  }

  Future<void> clearMedia() async {
    await sendCommand({'type': 'clear_media'});
  }

  Future<void> sendMediaToScene({
    required String mediaId,
    required String sceneName,
    required bool muted,
    required bool looping,
    required String fitMode,
  }) async {
    await sendCommand({
      'type': 'send_media_to_scene',
      'media_id': mediaId,
      'scene_name': sceneName,
      'muted': muted,
      'looping': looping,
      'fit_mode': fitMode,
    });
  }

  Future<void> showTicker(String text, {String badge = 'MCE'}) async {
    await sendCommand({
      'type': 'show_ticker',
      'badge': badge,
      'ticker_text': text,
    });
  }

  Future<void> showTickerMessages(
    List<String> messages, {
    Map<String, dynamic>? settings,
    bool paused = false,
  }) async {
    final cleaned = messages
        .map((message) => message.trim())
        .where((message) => message.isNotEmpty)
        .toList();
    if (cleaned.isEmpty) throw Exception('Add at least one ticker message.');
    final command = <String, dynamic>{
      'type': 'show_ticker',
      'ticker_text': cleaned.join('\n'),
      'messages': cleaned,
      'paused': paused,
    };
    if (settings != null) command.addAll(settings);
    await sendCommand(command);
  }

  Future<Map<String, dynamic>> getTickerPresentationStyle() async {
    final result = await sendCommand({'type': 'get_ticker_presentation_style'});
    final payload = result['payload'];
    return payload is Map ? Map<String, dynamic>.from(payload) : {};
  }

  Future<Map<String, dynamic>> saveTickerSettings(
    Map<String, dynamic> settings,
  ) async {
    final result = await sendCommand({
      'type': 'save_ticker_settings',
      ...settings,
    });
    final payload = result['payload'];
    return payload is Map ? Map<String, dynamic>.from(payload) : {};
  }

  Future<void> clearTicker() async {
    await sendCommand({'type': 'clear_ticker'});
  }

  Future<List<Map<String, dynamic>>> getTickerMessages() async {
    final result = await sendCommand({'type': 'get_ticker_messages'});
    final payload = result['payload'];
    if (payload is List) {
      return payload
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList();
    }
    return const [];
  }

  Future<List<Map<String, dynamic>>> saveTickerMessages(
    List<Map<String, dynamic>> messages,
  ) async {
    final result = await sendCommand({
      'type': 'save_ticker_messages',
      'messages': messages,
    });
    final payload = result['payload'];
    if (payload is List) {
      return payload
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList();
    }
    return const [];
  }

  Future<List<Map<String, dynamic>>> getCountdowns() async {
    final result = await sendCommand({'type': 'get_countdowns'});
    final payload = result['payload'];
    if (payload is List) {
      return payload
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList();
    }
    return const [];
  }

  Future<void> showCountdown(
    Map<String, dynamic> config, {
    Map<String, dynamic>? sync,
  }) async {
    await sendCommand({
      'type': 'show_countdown',
      'config': config,
      if (sync != null) 'sync': sync,
    });
  }

  Future<void> clearCountdown() async {
    await sendCommand({'type': 'clear_countdown'});
  }

  Future<List<Map<String, dynamic>>> getMultiviewCards() async {
    final result = await sendCommand({'type': 'get_multiview_cards'});
    final payload = result['payload'];
    if (payload is List) {
      return payload
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList();
    }
    return const [];
  }

  Future<void> clearMultiview({
    required String sceneName,
    String? multiviewId,
  }) async {
    await sendCommand({
      'type': 'clear_multiview',
      'scene_name': sceneName,
      'multiview_id': ?multiviewId,
    });
  }

  Future<List<Map<String, dynamic>>> getLowerThirdThemes() async {
    final result = await sendCommand({'type': 'get_lower_third_themes'});
    final payload = result['payload'];
    if (payload is List) {
      return payload
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList();
    }
    return const [];
  }

  Future<void> showLowerThird(
    String name,
    String title, {
    String? themeId,
    Map<String, String>? values,
    String? size,
  }) async {
    await sendCommand({
      'type': 'show_lower_third',
      'name': name,
      'title': title,
      if (themeId != null) 'theme_id': themeId,
      if (values != null) 'values': values,
      if (size != null) 'size': size,
    });
  }

  Future<void> clearLowerThird() async {
    await sendCommand({'type': 'clear_lower_third'});
  }

  Future<void> blankLowerThird() async {
    await sendCommand({'type': 'blank_lower_third'});
  }

  Future<Map<String, dynamic>> getSceneRoute(String module) async {
    final result = await sendCommand({
      'type': 'get_scene_route',
      'module': module,
    });
    final payload = result['payload'];
    return payload is Map ? Map<String, dynamic>.from(payload) : {};
  }

  Future<Map<String, dynamic>> saveSceneRoute(
    String module,
    Map<String, dynamic> route,
  ) async {
    final result = await sendCommand({
      'type': 'save_scene_route',
      'module': module,
      'route': route,
    });
    final payload = result['payload'];
    return payload is Map ? Map<String, dynamic>.from(payload) : {};
  }

  Future<Map<String, dynamic>> getCurrentState() {
    return sendCommand({'type': 'get_current_state'});
  }

  Future<Map<String, dynamic>> getScenes() {
    return sendCommand({'type': 'get_scenes'});
  }

  Future<void> switchScene(String sceneName) async {
    await sendCommand({'type': 'switch_scene', 'scene_name': sceneName});
  }

  Future<void> setPreviewScene(String sceneName) async {
    await sendCommand({'type': 'set_preview_scene', 'scene_name': sceneName});
  }

  Future<void> setStudioMode(bool enabled) async {
    await sendCommand({'type': 'set_studio_mode', 'enabled': enabled});
  }

  Future<String?> getSceneScreenshot({
    required String sceneName,
    int imageWidth = 360,
  }) async {
    final response = await sendCommand({
      'type': 'get_scene_screenshot',
      'scene_name': sceneName,
      'image_width': imageWidth,
    });
    final payload = response['payload'];
    if (payload is Map) {
      final imageData = payload['imageData'] ?? payload['image_data'];
      return imageData is String && imageData.isNotEmpty ? imageData : null;
    }
    return null;
  }

  Future<void> toggleStreaming() async {
    await sendCommand({'type': 'toggle_streaming'});
  }

  Future<void> toggleRecording() async {
    await sendCommand({'type': 'toggle_recording'});
  }

  Future<void> toggleMic() async {
    await sendCommand({'type': 'toggle_mic'});
  }

  Future<void> executeAutomation(String macroId) async {
    await sendCommand({'type': 'execute_automation', 'macro_id': macroId});
  }

  Future<List<Map<String, dynamic>>> getMacros() async {
    final result = await sendCommand({'type': 'get_macros'});
    return _listPayload(result);
  }

  Future<Map<String, dynamic>> saveMacro(Map<String, dynamic> macro) async {
    final result = await sendCommand({
      'type': 'save_macro',
      'macro_data': macro,
    });
    final payload = result['payload'];
    return payload is Map ? Map<String, dynamic>.from(payload) : {};
  }

  Future<void> deleteMacro(String macroId) async {
    await sendCommand({'type': 'delete_macro', 'macro_id': macroId});
  }

  Future<void> executeMacro(String macroId) async {
    await sendCommand({'type': 'execute_macro', 'macro_id': macroId});
  }

  Future<List<Map<String, dynamic>>> getAutomationRules() async {
    final result = await sendCommand({'type': 'get_automation_rules'});
    return _listPayload(result);
  }

  Future<Map<String, dynamic>> saveAutomationRule(
    Map<String, dynamic> rule,
  ) async {
    final result = await sendCommand({
      'type': 'save_automation_rule',
      'rule_data': rule,
    });
    final payload = result['payload'];
    return payload is Map ? Map<String, dynamic>.from(payload) : {};
  }

  Future<void> deleteAutomationRule(String ruleId) async {
    await sendCommand({'type': 'delete_automation_rule', 'rule_id': ruleId});
  }

  Future<void> toggleAutomationRule(String ruleId, bool enabled) async {
    await sendCommand({
      'type': 'toggle_automation_rule',
      'rule_id': ruleId,
      'enabled': enabled,
    });
  }

  Future<List<Map<String, dynamic>>> getAutomationLogs() async {
    final result = await sendCommand({'type': 'get_automation_logs'});
    return _listPayload(result);
  }

  Future<void> clearAutomationLogs() async {
    await sendCommand({'type': 'clear_automation_logs'});
  }

  List<Map<String, dynamic>> _listPayload(Map<String, dynamic> result) {
    final payload = result['payload'];
    if (payload is List) {
      return payload
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList();
    }
    return const [];
  }

  // ── Disconnect / Dispose ────────────────────────────────────────────────

  void disconnect() {
    _stopHeartbeat();
    _reconnectTimer?.cancel();
    _channel?.sink.close();
    _channel = null;
    _isConnected = false;
    _isAuthenticated = false;
    for (final completer in _pendingCommands.values) {
      if (!completer.isCompleted) {
        completer.completeError(Exception('Disconnected from desktop'));
      }
    }
    _pendingCommands.clear();
    notifyListeners();
  }

  @override
  void dispose() {
    disconnect();
    _eventController.close();
    super.dispose();
  }
}
