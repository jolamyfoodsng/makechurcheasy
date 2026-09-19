// Remote content models shared by the mobile Dock tabs.

class DockSlide {
  final int index;
  final String label;
  final String text;
  final String type;

  const DockSlide({
    required this.index,
    required this.label,
    required this.text,
    this.type = 'other',
  });

  factory DockSlide.fromJson(Map<String, dynamic> json) {
    return DockSlide(
      index: (json['index'] as num?)?.toInt() ?? 0,
      label: json['label']?.toString() ?? 'Slide',
      text: json['text']?.toString() ?? '',
      type: json['type']?.toString() ?? 'other',
    );
  }
}

class DockSong {
  final String id;
  final String title;
  final String artist;
  final String lyrics;
  final bool? autoSplit;
  final int? linesPerSlide;
  final List<DockSlide> slides;

  const DockSong({
    required this.id,
    required this.title,
    required this.artist,
    this.lyrics = '',
    this.autoSplit,
    this.linesPerSlide,
    required this.slides,
  });

  factory DockSong.fromJson(Map<String, dynamic> json) {
    final rawSlides = json['slides'];
    return DockSong(
      id: json['id']?.toString() ?? '',
      title: json['title']?.toString() ?? 'Untitled song',
      artist: json['artist']?.toString() ?? '',
      lyrics: json['lyrics']?.toString() ?? '',
      autoSplit: json['autoSplit'] is bool ? json['autoSplit'] as bool : null,
      linesPerSlide: (json['linesPerSlide'] as num?)?.toInt(),
      slides: rawSlides is List
          ? rawSlides
                .whereType<Map>()
                .map(
                  (item) => DockSlide.fromJson(Map<String, dynamic>.from(item)),
                )
                .toList()
          : const [],
    );
  }
}

class DockMediaItem {
  final String id;
  final String name;
  final String type;
  final String? diskFileName;
  final double? durationSec;
  final int? width;
  final int? height;
  final String? thumbnailUrl;

  const DockMediaItem({
    required this.id,
    required this.name,
    required this.type,
    this.diskFileName,
    this.durationSec,
    this.width,
    this.height,
    this.thumbnailUrl,
  });

  factory DockMediaItem.fromJson(Map<String, dynamic> json) {
    return DockMediaItem(
      id: json['id']?.toString() ?? '',
      name: json['name']?.toString() ?? 'Media',
      type: json['type']?.toString() ?? 'image',
      diskFileName: json['diskFileName']?.toString(),
      durationSec: (json['durationSec'] as num?)?.toDouble(),
      width: (json['width'] as num?)?.toInt(),
      height: (json['height'] as num?)?.toInt(),
      thumbnailUrl: json['thumbnailUrl']?.toString(),
    );
  }

  bool get isVideo => type == 'video';
}
