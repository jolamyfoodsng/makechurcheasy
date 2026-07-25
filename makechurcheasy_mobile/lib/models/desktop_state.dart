/// Desktop state model — mirrors the state broadcast from the Tauri backend.
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

  DesktopState copyWith({
    bool? obsConnected,
    String? currentSong,
    int? currentSlide,
    String? currentScripture,
    String? currentLowerThird,
    bool clearSong = false,
    bool clearSlide = false,
    bool clearScripture = false,
    bool clearLowerThird = false,
  }) {
    return DesktopState(
      obsConnected: obsConnected ?? this.obsConnected,
      currentSong: clearSong ? null : (currentSong ?? this.currentSong),
      currentSlide: clearSlide ? null : (currentSlide ?? this.currentSlide),
      currentScripture: clearScripture ? null : (currentScripture ?? this.currentScripture),
      currentLowerThird: clearLowerThird ? null : (currentLowerThird ?? this.currentLowerThird),
    );
  }

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
