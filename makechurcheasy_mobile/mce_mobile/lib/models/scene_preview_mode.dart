/// How OBS scene cards should display their live preview on mobile.
///
/// These options mirror DeckPilot's scene-card settings while keeping the
/// actual scene and OBS state owned by the desktop app.
enum ScenePreviewMode {
  off,
  staticThumbnails,
  autoRefresh5s,
  autoRefresh10s,
  tapToRefresh,
}

extension ScenePreviewModeDetails on ScenePreviewMode {
  String get storageValue => switch (this) {
    ScenePreviewMode.off => 'off',
    ScenePreviewMode.staticThumbnails => 'staticThumbnails',
    ScenePreviewMode.autoRefresh5s => 'autoRefresh5s',
    ScenePreviewMode.autoRefresh10s => 'autoRefresh10s',
    ScenePreviewMode.tapToRefresh => 'tapToRefresh',
  };

  String get label => switch (this) {
    ScenePreviewMode.off => 'Off',
    ScenePreviewMode.staticThumbnails => 'Static thumbnails',
    ScenePreviewMode.autoRefresh5s => 'Every 5 seconds',
    ScenePreviewMode.autoRefresh10s => 'Every 10 seconds',
    ScenePreviewMode.tapToRefresh => 'Tap to refresh',
  };

  String get description => switch (this) {
    ScenePreviewMode.off =>
      'Show the scene name only. Best for performance and battery.',
    ScenePreviewMode.staticThumbnails =>
      'Capture a scene image once when the Scenes tab loads.',
    ScenePreviewMode.autoRefresh5s =>
      'Refresh scene screenshots every 5 seconds for live monitoring.',
    ScenePreviewMode.autoRefresh10s =>
      'Refresh scene screenshots every 10 seconds to use less battery.',
    ScenePreviewMode.tapToRefresh =>
      'Keep a still image and refresh it from the Scenes toolbar.',
  };

  static ScenePreviewMode fromStorage(String? value) {
    for (final mode in ScenePreviewMode.values) {
      if (mode.storageValue == value) return mode;
    }
    return ScenePreviewMode.autoRefresh5s;
  }
}
