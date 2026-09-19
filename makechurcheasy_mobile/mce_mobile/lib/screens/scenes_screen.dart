import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../models/scene_preview_mode.dart';
import '../services/mobile_preferences.dart';
import '../services/mce_provider.dart';
import '../services/websocket_service.dart';
import '../theme/mce_theme.dart';
import 'app_settings_screen.dart';
import 'automation_screen.dart';

class _ScenesColors {
  _ScenesColors._();

  // Scene controls use the same MCE tokens as the other tabs. The preview
  // cards remain intentionally dark because they represent the OBS canvas.
  static Color get background => MCEColors.background;
  static Color get surface => MCEColors.surface;
  static Color get border => MCEColors.border;
  static Color get text => MCEColors.textPrimary;
  static Color get muted => MCEColors.textTertiary;
  static Color get cyan => MCEColors.primaryBlue;
  static Color get cyanSoft => MCEColors.primaryBg;
  static Color get green => MCEColors.success;
  static Color get orange => MCEColors.accentOrange;
  static Color get slate => MCEColors.textSecondary;
  static Color get cardTop => MCEColors.darkSurface;
  static Color get cardBottom => MCEColors.darkElevated;
}

enum _SceneToolbarAction { refresh, macros, settings }

class ScenesScreen extends StatefulWidget {
  const ScenesScreen({super.key});

  @override
  State<ScenesScreen> createState() => _ScenesScreenState();
}

class _SceneItem {
  final String id;
  final String name;

  const _SceneItem({required this.id, required this.name});
}

class _QuickAction {
  final String id;
  final String title;
  final String label;
  final String subtitle;
  final IconData icon;
  final Color color;
  final VoidCallback onTap;

  const _QuickAction({
    required this.id,
    required this.title,
    required this.label,
    required this.subtitle,
    required this.icon,
    required this.color,
    required this.onTap,
  });
}

class _ScenesScreenState extends State<ScenesScreen> {
  late final WebSocketService _webSocketService;
  late final MobilePreferences _mobilePreferences;
  StreamSubscription<WebSocketEvent>? _webSocketSub;
  Timer? _thumbnailTimer;
  List<_SceneItem> _scenes = const [];
  Map<String, Uint8List> _sceneThumbnails = <String, Uint8List>{};
  String? _liveSceneId;
  String? _previewSceneId;
  String? _busySceneId;
  String? _busyControl;
  ScenePreviewMode? _configuredPreviewMode;
  bool _studioModeEnabled = false;
  bool _streamActive = false;
  bool _micMuted = false;
  bool _quickActionsExpanded = true;
  double _activeFps = 0;
  bool _refreshingThumbnails = false;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _webSocketService = context.webSocketService;
    _mobilePreferences = context.mobilePreferences;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _webSocketSub = _webSocketService.events.listen(_onWebSocketEvent);
      _webSocketService.addListener(_onWebSocketChanged);
      _mobilePreferences.addListener(_onPreferencesChanged);
      _configuredPreviewMode = _mobilePreferences.scenePreviewMode;
      _configureThumbnailRefresh();
      unawaited(_loadScenes());
    });
  }

  @override
  void dispose() {
    _thumbnailTimer?.cancel();
    _webSocketSub?.cancel();
    _webSocketService.removeListener(_onWebSocketChanged);
    _mobilePreferences.removeListener(_onPreferencesChanged);
    super.dispose();
  }

  void _onWebSocketEvent(WebSocketEvent event) {
    if (!mounted) return;
    if (event.type == WebSocketEventType.authenticated) {
      unawaited(_loadScenes());
    } else if (event.type == WebSocketEventType.stateUpdate) {
      _syncCurrentScenes(event.data);
    }
  }

  void _onWebSocketChanged() {
    if (!mounted) return;
    _syncCurrentScenes();
    if (!_webSocketService.isAuthenticated && !_loading) {
      _thumbnailTimer?.cancel();
      setState(() {
        _scenes = const [];
        _sceneThumbnails = <String, Uint8List>{};
        _liveSceneId = null;
        _previewSceneId = null;
        _error = 'Connect to the desktop to load OBS scenes.';
      });
    }
  }

  void _onPreferencesChanged() {
    if (!mounted) return;
    final nextMode = context.mobilePreferences.scenePreviewMode;
    final modeChanged = nextMode != _configuredPreviewMode;
    _configuredPreviewMode = nextMode;
    if (modeChanged) {
      setState(() => _sceneThumbnails = <String, Uint8List>{});
    } else {
      setState(() {});
    }
    _configureThumbnailRefresh();
    if (modeChanged) unawaited(_refreshSceneThumbnails());
  }

  Future<void> _loadScenes({bool showLoading = true}) async {
    final webSocket = context.webSocketService;
    if (!webSocket.isAuthenticated) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _scenes = const [];
        _sceneThumbnails = <String, Uint8List>{};
        _error = 'Connect to the desktop to load OBS scenes.';
      });
      return;
    }

    if (mounted && showLoading) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }

    try {
      final responses = await Future.wait<Map<String, dynamic>>([
        webSocket.getScenes(),
        webSocket.getCurrentState(),
      ]);
      final rawScenes = responses[0]['payload'];
      final statePayload = responses[1]['payload'];
      final state = statePayload is Map
          ? Map<String, dynamic>.from(statePayload)
          : const <String, dynamic>{};
      final scenes = rawScenes is List
          ? rawScenes
                .whereType<Map>()
                .map((item) {
                  final name = item['name']?.toString().trim() ?? '';
                  if (name.isEmpty) return null;
                  return _SceneItem(
                    id: item['id']?.toString() ?? name,
                    name: name,
                  );
                })
                .whereType<_SceneItem>()
                .toList()
          : const <_SceneItem>[];
      final liveName = _firstNonEmpty(
        state['currentProgramScene']?.toString(),
        webSocket.desktopState.currentProgramScene,
      );
      final previewName = _firstNonEmpty(
        state['currentPreviewScene']?.toString(),
        webSocket.desktopState.currentPreviewScene,
      );

      if (!mounted) return;
      setState(() {
        _scenes = scenes;
        _sceneThumbnails = <String, Uint8List>{};
        _liveSceneId = _sceneIdForName(scenes, liveName);
        _previewSceneId = _sceneIdForName(scenes, previewName);
        _studioModeEnabled = _readBool(
          state['studioModeEnabled'],
          webSocket.desktopState.studioModeEnabled,
        );
        _streamActive = _readBool(
          state['streamActive'],
          webSocket.desktopState.streamActive,
        );
        _micMuted = _readBool(
          state['micMuted'],
          webSocket.desktopState.micMuted,
        );
        _activeFps = _readDouble(
          state['activeFps'],
          webSocket.desktopState.activeFps,
        );
        _loading = false;
        _error = scenes.isEmpty ? 'No scenes are available in OBS.' : null;
      });
      _configureThumbnailRefresh();
      unawaited(_refreshSceneThumbnails());
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'Could not load scenes from the desktop.';
      });
    }
  }

  void _syncCurrentScenes([Map<String, dynamic>? rawState]) {
    if (_scenes.isEmpty) return;
    final state = context.webSocketService.desktopState;
    final liveId = _sceneIdForName(_scenes, state.currentProgramScene);
    final previewId = _sceneIdForName(_scenes, state.currentPreviewScene);
    final hasControlState =
        rawState != null &&
        (rawState.containsKey('studioModeEnabled') ||
            rawState.containsKey('studio_mode_enabled') ||
            rawState.containsKey('streamActive') ||
            rawState.containsKey('stream_active') ||
            rawState.containsKey('recordingActive') ||
            rawState.containsKey('recording_active'));
    final nextStudio = hasControlState
        ? state.studioModeEnabled
        : _studioModeEnabled;
    final nextStream = hasControlState ? state.streamActive : _streamActive;
    final hasLiveStats =
        rawState != null &&
        (rawState.containsKey('activeFps') ||
            rawState.containsKey('active_fps') ||
            rawState.containsKey('micMuted') ||
            rawState.containsKey('mic_muted'));
    final nextMicMuted = hasLiveStats ? state.micMuted : _micMuted;
    final nextFps = hasLiveStats ? state.activeFps : _activeFps;
    if (liveId == _liveSceneId &&
        previewId == _previewSceneId &&
        nextStudio == _studioModeEnabled &&
        nextStream == _streamActive &&
        nextMicMuted == _micMuted &&
        nextFps == _activeFps) {
      return;
    }
    setState(() {
      _liveSceneId = liveId ?? _liveSceneId;
      _previewSceneId = previewId;
      _studioModeEnabled = nextStudio;
      _streamActive = nextStream;
      _micMuted = nextMicMuted;
      _activeFps = nextFps;
    });
  }

  void _configureThumbnailRefresh() {
    _thumbnailTimer?.cancel();
    _thumbnailTimer = null;
    final mode = _mobilePreferences.scenePreviewMode;
    final interval = switch (mode) {
      ScenePreviewMode.autoRefresh5s => Duration(seconds: 5),
      ScenePreviewMode.autoRefresh10s => Duration(seconds: 10),
      _ => null,
    };
    if (interval == null) return;
    _thumbnailTimer = Timer.periodic(
      interval,
      (_) => unawaited(_refreshSceneThumbnails()),
    );
  }

  Future<void> _refreshSceneThumbnails() async {
    if (!mounted) return;
    final mode = _mobilePreferences.scenePreviewMode;
    if (!_webSocketService.isAuthenticated ||
        mode == ScenePreviewMode.off ||
        _scenes.isEmpty ||
        _refreshingThumbnails) {
      return;
    }
    _refreshingThumbnails = true;
    final screenshots = <String, Uint8List?>{};
    try {
      // Capture one scene at a time. OBS can be slow to render a scene
      // screenshot, and parallel captures otherwise starve the same desktop
      // websocket used by live scene controls. A single failed capture must
      // not surface as an unhandled exception or cancel the other cards.
      for (final scene in List<_SceneItem>.of(_scenes)) {
        try {
          final imageData = await _webSocketService.getSceneScreenshot(
            sceneName: scene.name,
          );
          screenshots[scene.name] = _decodeImageData(imageData);
        } catch (_) {
          // Keep the scene card usable without a preview image.
        }
      }
      if (!mounted) return;
      setState(() {
        for (final entry in screenshots.entries) {
          final bytes = entry.value;
          if (bytes != null) {
            _sceneThumbnails[entry.key] = bytes;
          }
        }
      });
    } finally {
      _refreshingThumbnails = false;
    }
  }

  Uint8List? _decodeImageData(String? imageData) {
    if (imageData == null || imageData.isEmpty) return null;
    final comma = imageData.indexOf(',');
    final encoded = comma >= 0 ? imageData.substring(comma + 1) : imageData;
    try {
      return base64Decode(encoded);
    } catch (_) {
      return null;
    }
  }

  Future<void> _handleSceneTap(_SceneItem scene) async {
    if (_studioModeEnabled && _previewSceneId != scene.id) {
      await _previewScene(scene);
      return;
    }
    if (_studioModeEnabled && _previewSceneId == scene.id) {
      await _switchToScene(scene);
      return;
    }
    await _switchToScene(scene);
  }

  Future<void> _switchToScene(_SceneItem scene) async {
    if (_busySceneId != null || _liveSceneId == scene.id) return;
    setState(() => _busySceneId = scene.id);
    try {
      await context.webSocketService.switchScene(scene.name);
      if (!mounted) return;
      setState(() {
        _liveSceneId = scene.id;
        if (!_studioModeEnabled) _previewSceneId = null;
      });
    } catch (error) {
      if (!mounted) return;
      _showCommandError(error);
    } finally {
      if (mounted) setState(() => _busySceneId = null);
    }
  }

  Future<void> _previewScene(_SceneItem scene) async {
    if (_busySceneId != null || !_studioModeEnabled) return;
    setState(() => _busySceneId = scene.id);
    try {
      await context.webSocketService.setPreviewScene(scene.name);
      if (!mounted) return;
      setState(() => _previewSceneId = scene.id);
    } catch (error) {
      if (!mounted) return;
      _showCommandError(error);
    } finally {
      if (mounted) setState(() => _busySceneId = null);
    }
  }

  Future<void> _runControl(String id, Future<void> Function() action) async {
    if (_busyControl != null) return;
    setState(() => _busyControl = id);
    try {
      await action();
    } catch (error) {
      if (mounted) _showCommandError(error);
    } finally {
      if (mounted) setState(() => _busyControl = null);
    }
  }

  Future<void> _toggleStreaming() async {
    await _runControl('stream', () async {
      await context.webSocketService.toggleStreaming();
      if (mounted) setState(() => _streamActive = !_streamActive);
    });
  }

  Future<void> _toggleMic() async {
    await _runControl('mic', () async {
      await context.webSocketService.toggleMic();
      if (mounted) {
        setState(() {
          _micMuted = context.webSocketService.desktopState.micMuted;
        });
      }
    });
  }

  Future<void> _triggerFallback({required bool brb}) async {
    final preference = context.mobilePreferences;
    final configuredName = brb
        ? preference.brbSceneName
        : preference.safeSceneName;
    final configuredScene = configuredName == null
        ? null
        : _sceneForName(configuredName);
    if (configuredScene != null) {
      await _switchToScene(configuredScene);
      return;
    }
    await _chooseFallbackScene(brb: brb);
  }

  Future<void> _chooseFallbackScene({required bool brb}) async {
    final selected = await showModalBottomSheet<_SceneItem>(
      context: context,
      backgroundColor: MCEColors.surface,
      showDragHandle: true,
      builder: (sheetContext) {
        return SafeArea(
          child: ListView(
            shrinkWrap: true,
            padding: const EdgeInsets.fromLTRB(
              MCESpacing.lg,
              0,
              MCESpacing.lg,
              MCESpacing.lg,
            ),
            children: [
              Text(
                brb ? 'Choose BRB scene' : 'Choose Safe scene',
                style: MCETypography.sectionTitle,
              ),
              SizedBox(height: MCESpacing.xs),
              Text(
                'This scene will be used by the quick control on this phone.',
                style: MCETypography.sectionSubtitle,
              ),
              SizedBox(height: MCESpacing.sm),
              for (final scene in _scenes)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(
                    brb ? Icons.event_busy_outlined : Icons.shield_outlined,
                    color: brb ? MCEColors.warning : MCEColors.success,
                  ),
                  title: Text(scene.name),
                  trailing: Icon(Icons.chevron_right),
                  onTap: () => Navigator.of(sheetContext).pop(scene),
                ),
            ],
          ),
        );
      },
    );
    if (selected == null || !mounted) return;
    if (brb) {
      await context.mobilePreferences.setBrbSceneName(selected.name);
    } else {
      await context.mobilePreferences.setSafeSceneName(selected.name);
    }
    await _switchToScene(selected);
  }

  Future<void> _showSceneOptions(_SceneItem scene) async {
    final preferences = context.mobilePreferences;
    final action = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: _ScenesColors.surface,
      showDragHandle: true,
      builder: (sheetContext) {
        final saved = preferences.isSceneSaved(scene.name);
        final isBrb = preferences.brbSceneName == scene.name;
        final isSafe = preferences.safeSceneName == scene.name;
        return SafeArea(
          child: ListView(
            shrinkWrap: true,
            padding: const EdgeInsets.fromLTRB(
              MCESpacing.lg,
              0,
              MCESpacing.lg,
              MCESpacing.lg,
            ),
            children: [
              Text(
                'Scene Options',
                style: TextStyle(
                  fontFamily: 'Inter',
                  fontSize: 20,
                  fontWeight: FontWeight.w700,
                  color: _ScenesColors.text,
                ),
              ),
              SizedBox(height: 3),
              Text(
                scene.name,
                style: TextStyle(
                  fontFamily: 'Inter',
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                  color: _ScenesColors.muted,
                ),
              ),
              SizedBox(height: 8),
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Icon(
                  saved ? Icons.bookmark : Icons.bookmark_border,
                  color: _ScenesColors.slate,
                ),
                title: Text(
                  saved ? 'Remove from saved scenes' : 'Save scene',
                  style: TextStyle(color: _ScenesColors.text),
                ),
                onTap: () => Navigator.of(sheetContext).pop('save'),
              ),
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Icon(
                  Icons.event_busy_outlined,
                  color: isBrb ? _ScenesColors.orange : _ScenesColors.muted,
                ),
                title: Text(
                  isBrb ? 'BRB scene selected' : 'Set as BRB scene',
                  style: TextStyle(color: _ScenesColors.text),
                ),
                onTap: () => Navigator.of(sheetContext).pop('brb'),
              ),
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Icon(
                  Icons.shield_outlined,
                  color: isSafe ? _ScenesColors.green : _ScenesColors.muted,
                ),
                title: Text(
                  isSafe ? 'Safe scene selected' : 'Set as Safe scene',
                  style: TextStyle(color: _ScenesColors.text),
                ),
                onTap: () => Navigator.of(sheetContext).pop('safe'),
              ),
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Icon(
                  Icons.play_arrow_outlined,
                  color: _ScenesColors.slate,
                ),
                title: Text(
                  'Switch to Scene',
                  style: TextStyle(color: _ScenesColors.text),
                ),
                onTap: () => Navigator.of(sheetContext).pop('live'),
              ),
              if (_studioModeEnabled)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(
                    Icons.preview_outlined,
                    color: _ScenesColors.slate,
                  ),
                  title: Text(
                    'Send to Preview',
                    style: TextStyle(color: _ScenesColors.text),
                  ),
                  onTap: () => Navigator.of(sheetContext).pop('preview'),
                ),
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Icon(Icons.refresh, color: _ScenesColors.slate),
                title: Text(
                  'Refresh screenshot',
                  style: TextStyle(color: _ScenesColors.text),
                ),
                onTap: () => Navigator.of(sheetContext).pop('refresh'),
              ),
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Icon(
                  Icons.playlist_play_outlined,
                  color: _ScenesColors.slate,
                ),
                title: Text(
                  'Add macro for this scene',
                  style: TextStyle(color: _ScenesColors.text),
                ),
                onTap: () => Navigator.of(sheetContext).pop('macro'),
              ),
            ],
          ),
        );
      },
    );
    if (!mounted || action == null) return;
    switch (action) {
      case 'save':
        await preferences.toggleSavedScene(scene.name);
      case 'brb':
        await preferences.setBrbSceneName(scene.name);
      case 'safe':
        await preferences.setSafeSceneName(scene.name);
      case 'live':
        await _switchToScene(scene);
      case 'preview':
        await _previewScene(scene);
      case 'refresh':
        await _refreshSceneThumbnails();
      case 'macro':
        await Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => AutomationScreen(initialSceneName: scene.name),
          ),
        );
    }
  }

  void _showCommandError(Object error) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('Desktop scene command failed: $error'),
        backgroundColor: MCEColors.danger,
      ),
    );
  }

  String? _sceneIdForName(List<_SceneItem> scenes, String? name) {
    final trimmed = name?.trim();
    if (trimmed == null || trimmed.isEmpty) return null;
    for (final scene in scenes) {
      if (scene.name == trimmed) return scene.id;
    }
    return null;
  }

  _SceneItem? _sceneForName(String name) {
    for (final scene in _scenes) {
      if (scene.name == name) return scene;
    }
    return null;
  }

  _SceneItem? _sceneForId(String? id) {
    if (id == null) return null;
    for (final scene in _scenes) {
      if (scene.id == id) return scene;
    }
    return null;
  }

  String? _firstNonEmpty(String? first, String? second) {
    final firstValue = first?.trim();
    if (firstValue != null && firstValue.isNotEmpty) return firstValue;
    final secondValue = second?.trim();
    return secondValue == null || secondValue.isEmpty ? null : secondValue;
  }

  bool _readBool(Object? value, bool fallback) =>
      value is bool ? value : fallback;

  double _readDouble(Object? value, double fallback) =>
      value is num ? value.toDouble() : fallback;

  @override
  Widget build(BuildContext context) {
    final isDark = MCEColors.isDarkMode;
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle(
        statusBarColor: _ScenesColors.background,
        statusBarIconBrightness: isDark ? Brightness.light : Brightness.dark,
        statusBarBrightness: isDark ? Brightness.dark : Brightness.light,
        systemNavigationBarColor: _ScenesColors.surface,
        systemNavigationBarIconBrightness: isDark
            ? Brightness.light
            : Brightness.dark,
      ),
      child: Theme(
        data: Theme.of(context).copyWith(
          scaffoldBackgroundColor: _ScenesColors.background,
          colorScheme: Theme.of(context).colorScheme.copyWith(
            primary: _ScenesColors.cyan,
            surface: _ScenesColors.surface,
            onSurface: _ScenesColors.text,
          ),
        ),
        child: Container(
          color: _ScenesColors.background,
          child: SafeArea(
            top: false,
            bottom: false,
            child: RefreshIndicator(
              color: _ScenesColors.cyan,
              backgroundColor: _ScenesColors.surface,
              onRefresh: () => _loadScenes(showLoading: false),
              child: ListView(
                physics: AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                children: [
                  _buildDeckPilotHeader(),
                  SizedBox(height: 20),
                  _buildQuickControls(),
                  if (context.mobilePreferences.showSceneProgramMonitor ||
                      context.mobilePreferences.showScenePreviewMonitor) ...[
                    SizedBox(height: 22),
                    _buildProgramStatus(),
                  ],
                  SizedBox(height: 22),
                  if (_loading)
                    Padding(
                      padding: EdgeInsets.symmetric(vertical: 48),
                      child: Center(
                        child: CircularProgressIndicator(
                          color: _ScenesColors.cyan,
                        ),
                      ),
                    )
                  else if (_scenes.isEmpty)
                    _buildEmptyState()
                  else ...[
                    _buildSceneSwitcherHeader(),
                    SizedBox(height: 10),
                    _buildSceneGrid(_scenes),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildDeckPilotHeader() {
    final isConnected =
        context.desktopService.isConnected &&
        context.webSocketService.isAuthenticated;
    return Row(
      children: [
        Text(
          'Scenes',
          style: TextStyle(
            fontFamily: 'Inter',
            fontSize: 24,
            fontWeight: FontWeight.w700,
            color: _ScenesColors.text,
          ),
        ),
        SizedBox(width: 8),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
          decoration: BoxDecoration(
            color: _ScenesColors.cyanSoft,
            borderRadius: BorderRadius.circular(6),
          ),
          child: Text(
            'BETA',
            style: TextStyle(
              fontFamily: 'Inter',
              fontSize: 9,
              fontWeight: FontWeight.w800,
              letterSpacing: 0.7,
              color: _ScenesColors.slate,
            ),
          ),
        ),
        Spacer(),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 6),
          decoration: BoxDecoration(
            color: isConnected
                ? _ScenesColors.green.withValues(alpha: 0.12)
                : MCEColors.danger.withValues(alpha: 0.10),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 6,
                height: 6,
                decoration: BoxDecoration(
                  color: isConnected ? _ScenesColors.green : MCEColors.danger,
                  shape: BoxShape.circle,
                ),
              ),
              SizedBox(width: 5),
              Text(
                isConnected ? 'OBS Connected' : 'OBS Offline',
                style: TextStyle(
                  fontFamily: 'Inter',
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                  color: isConnected ? _ScenesColors.green : MCEColors.danger,
                ),
              ),
            ],
          ),
        ),
        SizedBox(width: 4),
        PopupMenuButton<_SceneToolbarAction>(
          tooltip: 'Scene options',
          padding: EdgeInsets.zero,
          icon: Icon(
            Icons.more_vert_rounded,
            color: _ScenesColors.slate,
            size: 22,
          ),
          onSelected: (action) {
            switch (action) {
              case _SceneToolbarAction.refresh:
                if (!_loading) unawaited(_loadScenes());
              case _SceneToolbarAction.macros:
                Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => AutomationScreen(
                      initialSceneName: _sceneName(_liveSceneId),
                    ),
                  ),
                );
              case _SceneToolbarAction.settings:
                Navigator.of(
                  context,
                ).push(MaterialPageRoute(builder: (_) => AppSettingsScreen()));
            }
          },
          itemBuilder: (context) => const [
            PopupMenuItem(
              value: _SceneToolbarAction.refresh,
              child: ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Icon(Icons.refresh_rounded),
                title: Text('Refresh scenes'),
              ),
            ),
            PopupMenuItem(
              value: _SceneToolbarAction.macros,
              child: ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Icon(Icons.playlist_play_outlined),
                title: Text('Add macro to scene'),
              ),
            ),
            PopupMenuItem(
              value: _SceneToolbarAction.settings,
              child: ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Icon(Icons.settings_outlined),
                title: Text('Settings'),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildSceneSwitcherHeader() {
    final count = _scenes.length;
    return Row(
      children: [
        Expanded(
          child: Text(
            'Scene Switcher',
            style: TextStyle(
              fontFamily: 'Inter',
              fontSize: 20,
              fontWeight: FontWeight.w700,
              color: _ScenesColors.text,
            ),
          ),
        ),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
          decoration: BoxDecoration(
            color: _ScenesColors.surface,
            borderRadius: BorderRadius.circular(999),
          ),
          child: Text(
            '$count ${count == 1 ? 'scene' : 'scenes'}',
            style: TextStyle(
              fontFamily: 'Inter',
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: _ScenesColors.muted,
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildQuickControls() {
    final actions = <_QuickAction>[
      _QuickAction(
        id: 'mic',
        title: _micMuted ? 'Unmute microphone' : 'Mute microphone',
        label: _micMuted ? 'Unmute Mic' : 'Mute Mic',
        subtitle:
            context.webSocketService.desktopState.micInputName ??
            'Primary OBS mic',
        icon: _micMuted ? Icons.mic_off_rounded : Icons.mic_off_rounded,
        color: _ScenesColors.orange,
        onTap: _toggleMic,
      ),
      _QuickAction(
        id: 'stream',
        title: _streamActive ? 'Stop stream' : 'Start stream',
        label: _streamActive ? 'Stop Stream' : 'Start Stream',
        subtitle: _streamActive ? 'Live now' : 'OBS stream',
        icon: _streamActive ? Icons.stop_rounded : Icons.play_arrow_rounded,
        color: _ScenesColors.green,
        onTap: _toggleStreaming,
      ),
      _QuickAction(
        id: 'brb',
        title: 'BRB screen',
        label: 'BRB Screen',
        subtitle: context.mobilePreferences.brbSceneName ?? 'Choose scene',
        icon: Icons.schedule_rounded,
        color: _ScenesColors.muted,
        onTap: () => unawaited(_triggerFallback(brb: true)),
      ),
      _QuickAction(
        id: 'safe',
        title: 'Safe screen',
        label: 'Safe Screen',
        subtitle: context.mobilePreferences.safeSceneName ?? 'Choose scene',
        icon: Icons.shield_outlined,
        color: _ScenesColors.slate,
        onTap: () => unawaited(_triggerFallback(brb: false)),
      ),
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(Icons.bolt_rounded, color: _ScenesColors.cyan, size: 18),
            SizedBox(width: 6),
            Text(
              'Quick Actions',
              style: TextStyle(
                fontFamily: 'Inter',
                fontSize: 15,
                fontWeight: FontWeight.w700,
                color: _ScenesColors.text,
              ),
            ),
            Spacer(),
            IconButton(
              tooltip: _quickActionsExpanded
                  ? 'Collapse quick actions'
                  : 'Expand quick actions',
              onPressed: () => setState(
                () => _quickActionsExpanded = !_quickActionsExpanded,
              ),
              visualDensity: VisualDensity.compact,
              icon: Icon(
                _quickActionsExpanded
                    ? Icons.keyboard_arrow_up_rounded
                    : Icons.keyboard_arrow_down_rounded,
                color: _ScenesColors.muted,
                size: 22,
              ),
            ),
          ],
        ),
        AnimatedSize(
          duration: Duration(milliseconds: 180),
          curve: Curves.easeOut,
          child: _quickActionsExpanded
              ? Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: GridView.builder(
                    shrinkWrap: true,
                    physics: NeverScrollableScrollPhysics(),
                    itemCount: actions.length,
                    gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 4,
                      crossAxisSpacing: 6,
                      mainAxisSpacing: 0,
                      mainAxisExtent: 92,
                    ),
                    itemBuilder: (context, index) => _QuickControlCard(
                      action: actions[index],
                      enabled: _busyControl == null,
                      busy: _busyControl == actions[index].id,
                    ),
                  ),
                )
              : const SizedBox.shrink(),
        ),
      ],
    );
  }

  Widget _buildProgramStatus() {
    final preferences = context.mobilePreferences;
    final showPreview =
        _studioModeEnabled && preferences.showScenePreviewMonitor;
    final showProgram = preferences.showSceneProgramMonitor;
    if (!showPreview && !showProgram) return const SizedBox.shrink();
    final fps = (_activeFps > 0 ? _activeFps : 30).round();
    final previewCard = _ScenesMonitorCard(
      label: 'Preview',
      status: 'PREVIEW',
      sceneName: _sceneName(_previewSceneId) ?? 'Not set',
      thumbnail: _sceneThumbnails[_sceneName(_previewSceneId)],
      accent: Color(0xFF2FAFFF),
      icon: Icons.preview_outlined,
      onTap: _previewSceneId == null
          ? null
          : () {
              final scene = _sceneForId(_previewSceneId);
              if (scene != null) unawaited(_switchToScene(scene));
            },
    );
    final programCard = _ScenesMonitorCard(
      label: 'Program',
      status: 'LIVE',
      sceneName: _sceneName(_liveSceneId) ?? 'Not available',
      thumbnail: _sceneThumbnails[_sceneName(_liveSceneId)],
      accent: MCEColors.danger,
      icon: Icons.live_tv_outlined,
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text(
              _studioModeEnabled ? 'Studio Mode' : 'Monitors',
              style: TextStyle(
                fontFamily: 'Inter',
                fontSize: 12,
                fontWeight: FontWeight.w700,
                letterSpacing: 1.2,
                color: _ScenesColors.muted,
              ),
            ),
            Spacer(),
            Text(
              '$fps fps',
              style: TextStyle(
                fontFamily: 'Inter',
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: MCEColors.textTertiary,
              ),
            ),
          ],
        ),
        SizedBox(height: 8),
        if (showPreview && showProgram)
          Row(
            children: [
              Expanded(child: previewCard),
              SizedBox(width: 8),
              Expanded(child: programCard),
            ],
          )
        else if (showPreview)
          previewCard
        else
          programCard,
      ],
    );
  }

  Widget _buildEmptyState() {
    final message = _error ?? 'Connect to the desktop to load OBS scenes.';
    return Container(
      padding: const EdgeInsets.all(MCESpacing.xl),
      decoration: BoxDecoration(
        color: _ScenesColors.surface,
        borderRadius: BorderRadius.circular(MCERadius.md),
        border: Border.all(color: _ScenesColors.border),
      ),
      child: Column(
        children: [
          Icon(
            Icons.video_library_outlined,
            color: _ScenesColors.muted,
            size: 36,
          ),
          SizedBox(height: MCESpacing.md),
          Text(
            message,
            style: TextStyle(
              fontFamily: 'Inter',
              fontSize: 14,
              fontWeight: FontWeight.w700,
              color: _ScenesColors.text,
            ),
            textAlign: TextAlign.center,
          ),
          SizedBox(height: MCESpacing.xs),
          Text(
            'Keep OBS and the desktop app running, then refresh this tab.',
            style: TextStyle(
              fontFamily: 'Inter',
              fontSize: 12,
              color: _ScenesColors.muted,
            ),
            textAlign: TextAlign.center,
          ),
          SizedBox(height: MCESpacing.lg),
          _ActionButton(
            label: 'Refresh scenes',
            icon: Icons.refresh,
            onTap: () => unawaited(_loadScenes()),
          ),
        ],
      ),
    );
  }

  Widget _buildSceneGrid(List<_SceneItem> scenes) {
    final preferences = context.mobilePreferences;
    return LayoutBuilder(
      builder: (context, constraints) {
        const columns = 2;
        const gap = 10.0;
        final itemWidth = (constraints.maxWidth - gap) / columns;
        return GridView.builder(
          shrinkWrap: true,
          physics: NeverScrollableScrollPhysics(),
          itemCount: scenes.length,
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: columns,
            crossAxisSpacing: gap,
            mainAxisSpacing: gap,
            mainAxisExtent: itemWidth * 4 / 5,
          ),
          itemBuilder: (context, index) {
            final scene = scenes[index];
            return _SceneCard(
              scene: scene,
              thumbnail: _sceneThumbnails[scene.name],
              isLive: _liveSceneId == scene.id,
              isPreview: _previewSceneId == scene.id,
              isSaved: preferences.isSceneSaved(scene.name),
              isBrb: preferences.brbSceneName == scene.name,
              isSafe: preferences.safeSceneName == scene.name,
              isBusy: _busySceneId == scene.id,
              studioModeEnabled: _studioModeEnabled,
              onTap: () => _handleSceneTap(scene),
              onDoubleTap: () => _switchToScene(scene),
              onLongPress: () => _showSceneOptions(scene),
            );
          },
        );
      },
    );
  }

  String? _sceneName(String? id) => _sceneForId(id)?.name;
}

class _QuickControlCard extends StatelessWidget {
  final _QuickAction action;
  final bool enabled;
  final bool busy;

  const _QuickControlCard({
    required this.action,
    required this.enabled,
    required this.busy,
  });

  @override
  Widget build(BuildContext context) {
    final tileColor = switch (action.id) {
      'mic' => MCEColors.accentOrange.withValues(alpha: 0.10),
      'stream' => MCEColors.successBg,
      _ => MCEColors.elevated,
    };
    return Semantics(
      button: true,
      label: '${action.title}. ${action.subtitle}',
      child: Tooltip(
        message: action.title,
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: enabled ? action.onTap : null,
            borderRadius: BorderRadius.circular(16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 64,
                  height: 64,
                  decoration: BoxDecoration(
                    color: enabled
                        ? tileColor
                        : MCEColors.elevated.withValues(alpha: 0.55),
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(
                      color: action.color.withValues(
                        alpha: enabled ? 0.22 : 0.12,
                      ),
                    ),
                  ),
                  child: busy
                      ? Padding(
                          padding: const EdgeInsets.all(20),
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: action.color,
                          ),
                        )
                      : Icon(
                          action.icon,
                          color: enabled ? action.color : _ScenesColors.muted,
                          size: 25,
                        ),
                ),
                SizedBox(height: 4),
                Text(
                  action.label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontFamily: 'Inter',
                    fontSize: 9,
                    fontWeight: FontWeight.w600,
                    color: _ScenesColors.slate,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _ScenesMonitorCard extends StatelessWidget {
  final String label;
  final String status;
  final String sceneName;
  final Uint8List? thumbnail;
  final Color accent;
  final IconData icon;
  final VoidCallback? onTap;

  const _ScenesMonitorCard({
    required this.label,
    required this.status,
    required this.sceneName,
    required this.thumbnail,
    required this.accent,
    required this.icon,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: onTap != null,
      label: '$label monitor. $sceneName',
      child: GestureDetector(
        onTap: onTap,
        child: AspectRatio(
          aspectRatio: 16 / 9,
          child: Container(
            clipBehavior: Clip.antiAlias,
            decoration: BoxDecoration(
              color: _ScenesColors.cardTop,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: accent, width: 1.5),
              boxShadow: const [
                BoxShadow(
                  color: Color(0x220B1B35),
                  blurRadius: 12,
                  offset: Offset(0, 5),
                ),
              ],
            ),
            child: Stack(
              fit: StackFit.expand,
              children: [
                if (thumbnail != null)
                  Image.memory(
                    thumbnail!,
                    fit: BoxFit.cover,
                    gaplessPlayback: true,
                  )
                else
                  DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        colors: [
                          _ScenesColors.cardTop,
                          _ScenesColors.cardBottom,
                        ],
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                      ),
                    ),
                    child: Center(
                      child: Icon(
                        Icons.videocam_outlined,
                        color: Color(0xFF98A7BB),
                        size: 30,
                      ),
                    ),
                  ),
                const Positioned.fill(
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        colors: [Colors.transparent, Color(0xDD06101D)],
                        begin: Alignment.center,
                        end: Alignment.bottomCenter,
                      ),
                    ),
                  ),
                ),
                Positioned(
                  top: 9,
                  left: 9,
                  child: _MonitorPill(
                    text: label,
                    color: label == 'Program'
                        ? Color(0xFFB80C27)
                        : _ScenesColors.cyan,
                  ),
                ),
                Positioned(
                  top: 9,
                  right: 9,
                  child: _MonitorPill(
                    text: status,
                    color: label == 'Program'
                        ? Color(0xFFB80C27)
                        : Color(0xFF1683D5),
                  ),
                ),
                Positioned(
                  left: 10,
                  right: 10,
                  bottom: 8,
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              sceneName,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                fontFamily: 'Inter',
                                fontSize: 14,
                                fontWeight: FontWeight.w800,
                                color: Colors.white,
                              ),
                            ),
                            SizedBox(height: 2),
                            Text(
                              label == 'Program'
                                  ? 'This is the scene your audience is currently seeing.'
                                  : 'This scene is ready for transition.',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                fontFamily: 'Inter',
                                fontSize: 9,
                                fontWeight: FontWeight.w600,
                                color: Color(0xFFD6DEE9),
                              ),
                            ),
                          ],
                        ),
                      ),
                      SizedBox(width: 6),
                      Icon(icon, color: Color(0xFFD6DEE9), size: 17),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _MonitorPill extends StatelessWidget {
  final String text;
  final Color color;

  const _MonitorPill({required this.text, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        text,
        style: TextStyle(
          fontFamily: 'Inter',
          fontSize: 10,
          fontWeight: FontWeight.w800,
          color: Colors.white,
        ),
      ),
    );
  }
}

class _SceneCard extends StatefulWidget {
  final _SceneItem scene;
  final Uint8List? thumbnail;
  final bool isLive;
  final bool isPreview;
  final bool isSaved;
  final bool isBrb;
  final bool isSafe;
  final bool isBusy;
  final bool studioModeEnabled;
  final VoidCallback onTap;
  final VoidCallback onDoubleTap;
  final VoidCallback onLongPress;

  const _SceneCard({
    required this.scene,
    required this.thumbnail,
    required this.isLive,
    required this.isPreview,
    required this.isSaved,
    required this.isBrb,
    required this.isSafe,
    required this.isBusy,
    required this.studioModeEnabled,
    required this.onTap,
    required this.onDoubleTap,
    required this.onLongPress,
  });

  @override
  State<_SceneCard> createState() => _SceneCardState();
}

class _SceneCardState extends State<_SceneCard> {
  Timer? _tapTimer;

  @override
  void dispose() {
    _tapTimer?.cancel();
    super.dispose();
  }

  void _handleTap() {
    if (widget.isBusy) return;
    if (_tapTimer != null) {
      _tapTimer!.cancel();
      _tapTimer = null;
      widget.onDoubleTap();
      return;
    }
    _tapTimer = Timer(Duration(milliseconds: 220), () {
      _tapTimer = null;
      if (mounted && !widget.isBusy) widget.onTap();
    });
  }

  void _handleLongPress() {
    if (widget.isBusy) return;
    _tapTimer?.cancel();
    _tapTimer = null;
    widget.onLongPress();
  }

  void _openOptionsFromMenu() {
    if (widget.isBusy) return;
    _tapTimer?.cancel();
    _tapTimer = null;
    widget.onLongPress();
  }

  @override
  Widget build(BuildContext context) {
    final accent = widget.isLive
        ? _ScenesColors.cyan
        : widget.isPreview
        ? Color(0xFF2FAFFF)
        : _ScenesColors.border;
    final hint = widget.studioModeEnabled
        ? 'Tap for preview, double-tap for live, hold or open the three-dot menu for options.'
        : 'Tap to switch live, hold or open the three-dot menu for options.';

    return Semantics(
      button: true,
      label: widget.scene.name,
      hint: hint,
      child: GestureDetector(
        onTap: _handleTap,
        onLongPress: _handleLongPress,
        child: AnimatedScale(
          scale: widget.isBusy ? 0.98 : 1,
          duration: Duration(milliseconds: 120),
          child: Container(
            clipBehavior: Clip.antiAlias,
            decoration: BoxDecoration(
              color: _ScenesColors.cardTop,
              borderRadius: BorderRadius.circular(15),
              border: Border.all(
                color: accent,
                width: widget.isLive || widget.isPreview ? 2 : 1,
              ),
              boxShadow: const [
                BoxShadow(
                  color: Color(0x220B1B35),
                  blurRadius: 8,
                  offset: Offset(0, 4),
                ),
              ],
            ),
            child: Stack(
              fit: StackFit.expand,
              children: [
                if (widget.thumbnail != null)
                  Image.memory(
                    widget.thumbnail!,
                    fit: BoxFit.cover,
                    gaplessPlayback: true,
                  )
                else
                  DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        colors: [
                          _ScenesColors.cardTop,
                          _ScenesColors.cardBottom,
                        ],
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                      ),
                    ),
                    child: Center(
                      child: Icon(
                        Icons.video_library_outlined,
                        size: 32,
                        color: Color(0xFFA8B5C5),
                      ),
                    ),
                  ),
                const Positioned.fill(
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        colors: [Colors.transparent, Color(0xF0081424)],
                        begin: Alignment.center,
                        end: Alignment.bottomCenter,
                      ),
                    ),
                  ),
                ),
                if (widget.isLive)
                  Positioned(
                    top: 10,
                    left: 10,
                    child: _SceneStateBadge(text: 'LIVE'),
                  ),
                if (widget.isPreview && !widget.isLive)
                  Positioned(
                    top: 10,
                    left: 10,
                    child: _SceneStateBadge(text: 'PREVIEW', preview: true),
                  ),
                Positioned(
                  top: 9,
                  right: 9,
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (widget.isSaved)
                        _SceneMetaBadge(icon: Icons.bookmark_rounded),
                      if (widget.isBrb)
                        _SceneMetaBadge(icon: Icons.schedule_rounded),
                      if (widget.isSafe)
                        _SceneMetaBadge(icon: Icons.shield_rounded),
                      SizedBox(width: 4),
                      Material(
                        color: Color(0xCC172A44),
                        shape: CircleBorder(),
                        child: InkWell(
                          onTap: _openOptionsFromMenu,
                          customBorder: CircleBorder(),
                          child: SizedBox(
                            width: 32,
                            height: 32,
                            child: Icon(
                              Icons.more_horiz_rounded,
                              size: 19,
                              color: Color(0xFFE6EDF5),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                Positioned(
                  left: 11,
                  right: 10,
                  bottom: 10,
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Expanded(
                        child: Text(
                          widget.scene.name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontFamily: 'Inter',
                            fontSize: 15,
                            fontWeight: FontWeight.w800,
                            color: Colors.white,
                          ),
                        ),
                      ),
                      if (widget.isBusy)
                        Padding(
                          padding: EdgeInsets.only(left: 5),
                          child: SizedBox(
                            width: 17,
                            height: 17,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
                if (widget.isBusy)
                  const Positioned.fill(
                    child: ColoredBox(color: Color(0x33000000)),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _SceneStateBadge extends StatelessWidget {
  final String text;
  final bool preview;

  const _SceneStateBadge({required this.text, this.preview = false});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: preview ? Color(0xFF1683D5) : Color(0xFF00AAB6),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        text,
        style: TextStyle(
          fontFamily: 'Inter',
          fontSize: 10,
          fontWeight: FontWeight.w800,
          color: Colors.white,
        ),
      ),
    );
  }
}

class _SceneMetaBadge extends StatelessWidget {
  final IconData icon;

  const _SceneMetaBadge({required this.icon});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(left: 3),
      width: 26,
      height: 26,
      decoration: BoxDecoration(
        color: Color(0xCC172A44),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Icon(icon, size: 13, color: Color(0xFFE6EDF5)),
    );
  }
}

class _ActionButton extends StatelessWidget {
  final String label;
  final IconData icon;
  final VoidCallback onTap;

  const _ActionButton({
    required this.label,
    required this.icon,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 44,
      child: FilledButton.icon(
        onPressed: onTap,
        icon: Icon(icon, size: 18),
        label: Text(label),
        style: FilledButton.styleFrom(
          backgroundColor: MCEColors.primaryBlue,
          foregroundColor: Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(MCERadius.md),
          ),
        ),
      ),
    );
  }
}
