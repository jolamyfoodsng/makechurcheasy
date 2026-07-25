/// Bible API response models.
library;

// ── Translations ──────────────────────────────────────────────────────────

class BibleTranslation {
  final String id;
  final String abbr;
  final String name;
  final String language;
  final String? downloadedAt;
  final int? filesize;

  const BibleTranslation({
    required this.id,
    required this.abbr,
    required this.name,
    required this.language,
    this.downloadedAt,
    this.filesize,
  });

  factory BibleTranslation.fromJson(Map<String, dynamic> json) {
    return BibleTranslation(
      id: json['id'] as String? ?? '',
      abbr: json['abbr'] as String? ?? '',
      name: json['name'] as String? ?? '',
      language: json['language'] as String? ?? '',
      downloadedAt: json['downloadedAt'] as String?,
      filesize: json['filesize'] as int?,
    );
  }
}

// ── Books ─────────────────────────────────────────────────────────────────

class BibleBook {
  final String name;
  final int chapterCount;

  const BibleBook({required this.name, required this.chapterCount});

  factory BibleBook.fromJson(Map<String, dynamic> json) {
    return BibleBook(
      name: json['name'] as String? ?? '',
      chapterCount: json['chapterCount'] as int? ?? 0,
    );
  }
}

// ── Verses ────────────────────────────────────────────────────────────────

class BibleVerse {
  final int verse;
  final String text;

  const BibleVerse({required this.verse, required this.text});

  factory BibleVerse.fromJson(Map<String, dynamic> json) {
    return BibleVerse(
      verse: json['verse'] as int? ?? 0,
      text: json['text'] as String? ?? '',
    );
  }
}

// ── Chapter ───────────────────────────────────────────────────────────────

class BibleChapter {
  final String book;
  final int chapter;
  final String translation;
  final int verseCount;
  final List<BibleVerse> verses;

  const BibleChapter({
    required this.book,
    required this.chapter,
    required this.translation,
    required this.verseCount,
    required this.verses,
  });

  factory BibleChapter.fromJson(Map<String, dynamic> json) {
    return BibleChapter(
      book: json['book'] as String? ?? '',
      chapter: json['chapter'] as int? ?? 0,
      translation: json['translation'] as String? ?? '',
      verseCount: json['verseCount'] as int? ?? 0,
      verses: (json['verses'] as List<dynamic>? ?? [])
          .map((v) => BibleVerse.fromJson(v as Map<String, dynamic>))
          .toList(),
    );
  }
}

// ── Single Verse ──────────────────────────────────────────────────────────

class BibleSingleVerse {
  final String book;
  final int chapter;
  final int verse;
  final String translation;
  final String text;

  const BibleSingleVerse({
    required this.book,
    required this.chapter,
    required this.verse,
    required this.translation,
    required this.text,
  });

  factory BibleSingleVerse.fromJson(Map<String, dynamic> json) {
    return BibleSingleVerse(
      book: json['book'] as String? ?? '',
      chapter: json['chapter'] as int? ?? 0,
      verse: json['verse'] as int? ?? 0,
      translation: json['translation'] as String? ?? '',
      text: json['text'] as String? ?? '',
    );
  }

  String get reference => '$book $chapter:$verse';
}

// ── Search Results ────────────────────────────────────────────────────────

class BibleServerSearchResult {
  final String book;
  final int chapter;
  final int verse;
  final String text;
  final String reference;

  const BibleServerSearchResult({
    required this.book,
    required this.chapter,
    required this.verse,
    required this.text,
    required this.reference,
  });

  factory BibleServerSearchResult.fromJson(Map<String, dynamic> json) {
    return BibleServerSearchResult(
      book: json['book'] as String? ?? '',
      chapter: json['chapter'] as int? ?? 0,
      verse: json['verse'] as int? ?? 0,
      text: json['text'] as String? ?? '',
      reference: json['reference'] as String? ?? '',
    );
  }
}

class BibleSearchResponse {
  final String query;
  final String translation;
  final int count;
  final List<BibleServerSearchResult> results;

  const BibleSearchResponse({
    required this.query,
    required this.translation,
    required this.count,
    required this.results,
  });

  factory BibleSearchResponse.fromJson(Map<String, dynamic> json) {
    return BibleSearchResponse(
      query: json['query'] as String? ?? '',
      translation: json['translation'] as String? ?? '',
      count: json['count'] as int? ?? 0,
      results: (json['results'] as List<dynamic>? ?? [])
          .map((r) => BibleServerSearchResult.fromJson(r as Map<String, dynamic>))
          .toList(),
    );
  }
}

// ── Current Reading (from Desktop dock state) ─────────────────────────────

class CurrentReadingVerse {
  final int verse;
  final String text;

  const CurrentReadingVerse({required this.verse, required this.text});

  factory CurrentReadingVerse.fromJson(Map<String, dynamic> json) {
    return CurrentReadingVerse(
      verse: json['verse'] as int? ?? 0,
      text: json['text'] as String? ?? '',
    );
  }
}

class CurrentReadingResponse {
  final String translation;
  final String book;
  final int chapter;
  final List<CurrentReadingVerse> verses;
  final int? selectedVerse;

  const CurrentReadingResponse({
    required this.translation,
    required this.book,
    required this.chapter,
    required this.verses,
    this.selectedVerse,
  });

  factory CurrentReadingResponse.fromJson(Map<String, dynamic> json) {
    return CurrentReadingResponse(
      translation: json['translation'] as String? ?? '',
      book: json['book'] as String? ?? '',
      chapter: json['chapter'] as int? ?? 0,
      verses: (json['verses'] as List<dynamic>? ?? [])
          .map((v) => CurrentReadingVerse.fromJson(v as Map<String, dynamic>))
          .toList(),
      selectedVerse: json['selected_verse'] as int?,
    );
  }
}
