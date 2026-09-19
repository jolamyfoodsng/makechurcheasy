import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../models/scene_preview_mode.dart';
import '../theme/mce_theme.dart';

/// Small device-local preferences that control how the phone mirrors the
/// desktop Dock. Presentation data itself remains desktop-owned.
class MobilePreferences extends ChangeNotifier {
  static const _storageKey = 'mce_mobile_preferences';

  final FlutterSecureStorage _storage = const FlutterSecureStorage();

  bool syncBibleSelectionToDock = true;
  MCEThemePreference themePreference = MCEThemePreference.dark;
  bool showMediaImagePreviews = true;
  ScenePreviewMode scenePreviewMode = ScenePreviewMode.autoRefresh5s;
  bool showSceneProgramMonitor = true;
  bool showScenePreviewMonitor = true;
  String? brbSceneName;
  String? safeSceneName;
  Set<String> savedSceneNames = <String>{};

  Future<void> load() async {
    try {
      final raw = await _storage.read(key: _storageKey);
      if (raw == null || raw.isEmpty) return;
      final decoded = jsonDecode(raw);
      if (decoded is Map) {
        final values = Map<String, dynamic>.from(decoded);
        if (values['syncBibleSelectionToDock'] is bool) {
          syncBibleSelectionToDock = values['syncBibleSelectionToDock'] as bool;
        }
        final storedTheme = values['themePreference'];
        if (storedTheme is String) {
          themePreference = MCEThemePreference.values.firstWhere(
            (value) => value.name == storedTheme,
            orElse: () => MCEThemePreference.dark,
          );
        }
        if (values['showMediaImagePreviews'] is bool) {
          showMediaImagePreviews = values['showMediaImagePreviews'] as bool;
        }
        scenePreviewMode = ScenePreviewModeDetails.fromStorage(
          values['scenePreviewMode'] as String?,
        );
        if (values['showSceneProgramMonitor'] is bool) {
          showSceneProgramMonitor = values['showSceneProgramMonitor'] as bool;
        }
        if (values['showScenePreviewMonitor'] is bool) {
          showScenePreviewMonitor = values['showScenePreviewMonitor'] as bool;
        }
        brbSceneName = _readSceneName(values['brbSceneName']);
        safeSceneName = _readSceneName(values['safeSceneName']);
        final saved = values['savedSceneNames'];
        if (saved is List) {
          savedSceneNames = saved
              .whereType<String>()
              .map((name) => name.trim())
              .where((name) => name.isNotEmpty)
              .toSet();
        }
      }
      notifyListeners();
    } catch (_) {
      // Defaults are intentionally safe: selecting a verse mirrors the Dock.
    }
  }

  Future<void> setSyncBibleSelectionToDock(bool value) async {
    syncBibleSelectionToDock = value;
    notifyListeners();
    await _persist();
  }

  Future<void> setThemePreference(MCEThemePreference value) async {
    themePreference = value;
    notifyListeners();
    await _persist();
  }

  Future<void> setShowMediaImagePreviews(bool value) async {
    showMediaImagePreviews = value;
    notifyListeners();
    await _persist();
  }

  Future<void> setScenePreviewMode(ScenePreviewMode value) async {
    scenePreviewMode = value;
    notifyListeners();
    await _persist();
  }

  Future<void> setShowSceneProgramMonitor(bool value) async {
    showSceneProgramMonitor = value;
    notifyListeners();
    await _persist();
  }

  Future<void> setShowScenePreviewMonitor(bool value) async {
    showScenePreviewMonitor = value;
    notifyListeners();
    await _persist();
  }

  Future<void> setBrbSceneName(String? value) async {
    brbSceneName = _readSceneName(value);
    notifyListeners();
    await _persist();
  }

  Future<void> setSafeSceneName(String? value) async {
    safeSceneName = _readSceneName(value);
    notifyListeners();
    await _persist();
  }

  Future<void> toggleSavedScene(String sceneName) async {
    final name = sceneName.trim();
    if (name.isEmpty) return;
    if (!savedSceneNames.add(name)) savedSceneNames.remove(name);
    notifyListeners();
    await _persist();
  }

  bool isSceneSaved(String sceneName) => savedSceneNames.contains(sceneName);

  String? _readSceneName(Object? value) {
    if (value is! String) return null;
    final name = value.trim();
    return name.isEmpty ? null : name;
  }

  Future<void> _persist() async {
    try {
      await _storage.write(
        key: _storageKey,
        value: jsonEncode({
          'syncBibleSelectionToDock': syncBibleSelectionToDock,
          'themePreference': themePreference.name,
          'showMediaImagePreviews': showMediaImagePreviews,
          'scenePreviewMode': scenePreviewMode.storageValue,
          'showSceneProgramMonitor': showSceneProgramMonitor,
          'showScenePreviewMonitor': showScenePreviewMonitor,
          'brbSceneName': brbSceneName,
          'safeSceneName': safeSceneName,
          'savedSceneNames': savedSceneNames.toList(),
        }),
      );
    } catch (_) {
      // Keep the in-memory setting active for this session.
    }
  }
}
