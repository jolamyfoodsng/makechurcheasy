/// Bible providers — Riverpod state management for the Bible screen.
///
/// Unified state model mirrors the Desktop Bible Dock: content is always
/// visible (chapter reading by default), search resolves to chapter/verse/keyword.
library;

import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/bible_models.dart';
import '../services/bible_search_parser.dart' as parser;
import '../services/bible_service.dart';
import 'connection_provider.dart';

// ── BibleService (depends on connection URL) ─────────────────────────────

final bibleServiceProvider = Provider<BibleService?>((ref) {
  final conn = ref.watch(connectionProvider);
  final url = conn.serverUrl;
  if (url == null || url.isEmpty) return null;

  final cleaned = url
      .replaceFirst('ws://', '')
      .replaceFirst('wss://', '')
      .replaceFirst(RegExp(r'/.*$'), '');
  final host = cleaned.split(':').first;

  return BibleService('http://$host:45678');
});

// ── Translations ─────────────────────────────────────────────────────────

final translationsProvider = FutureProvider<List<BibleTranslation>>((ref) async {
  final service = ref.watch(bibleServiceProvider);
  if (service == null) return [];
  return service.getTranslations();
});

final selectedTranslationProvider = StateProvider<String>((ref) => 'KJV');

// ── Bible screen mode ────────────────────────────────────────────────────

enum BibleScreenMode {
  /// Showing a chapter from current-reading or manual navigation
  chapterReading,

  /// Showing search results (parsed references + keyword results)
  searchResults,
}

// ── Unified Bible state ──────────────────────────────────────────────────

class BibleScreenState {
  final BibleScreenMode mode;
  final String? currentBook;
  final int? currentChapter;
  final String currentTranslation;
  final List<BibleVerse> passages;
  final int? selectedVerse;
  final bool isLoadingChapter;

  /// Parsed reference results from the fuzzy parser
  final List<parser.BibleSearchResult> referenceResults;
  /// Keyword search results from the server
  final List<BibleServerSearchResult> keywordResults;
  final String lastSearchQuery;
  final bool isSearching;

  const BibleScreenState({
    this.mode = BibleScreenMode.chapterReading,
    this.currentBook,
    this.currentChapter,
    this.currentTranslation = 'KJV',
    this.passages = const [],
    this.selectedVerse,
    this.isLoadingChapter = false,
    this.referenceResults = const [],
    this.keywordResults = const [],
    this.lastSearchQuery = '',
    this.isSearching = false,
  });

  BibleScreenState copyWith({
    BibleScreenMode? mode,
    String? currentBook,
    int? currentChapter,
    String? currentTranslation,
    List<BibleVerse>? passages,
    int? selectedVerse,
    bool? isLoadingChapter,
    List<parser.BibleSearchResult>? referenceResults,
    List<BibleServerSearchResult>? keywordResults,
    String? lastSearchQuery,
    bool? isSearching,
    bool clearSelectedVerse = false,
    bool clearBook = false,
  }) {
    return BibleScreenState(
      mode: mode ?? this.mode,
      currentBook: clearBook ? null : (currentBook ?? this.currentBook),
      currentChapter: currentChapter ?? this.currentChapter,
      currentTranslation: currentTranslation ?? this.currentTranslation,
      passages: passages ?? this.passages,
      selectedVerse: clearSelectedVerse ? null : (selectedVerse ?? this.selectedVerse),
      isLoadingChapter: isLoadingChapter ?? this.isLoadingChapter,
      referenceResults: referenceResults ?? this.referenceResults,
      keywordResults: keywordResults ?? this.keywordResults,
      lastSearchQuery: lastSearchQuery ?? this.lastSearchQuery,
      isSearching: isSearching ?? this.isSearching,
    );
  }
}

class BibleNotifier extends StateNotifier<BibleScreenState> {
  BibleNotifier(this._ref) : super(const BibleScreenState()) {
    _init();
  }

  final Ref _ref;
  Timer? _debounce;

  BibleService? get _service => _ref.read(bibleServiceProvider);

  /// Initialize: load current reading from Desktop dock
  Future<void> _init() async {
    final service = _service;
    if (service == null) return;

    final current = await service.getCurrentReading();
    if (current != null && mounted) {
      final verses = current.verses
          .map((v) => BibleVerse(verse: v.verse, text: v.text))
          .toList();
      state = state.copyWith(
        currentBook: current.book,
        currentChapter: current.chapter,
        currentTranslation: current.translation,
        passages: verses,
        selectedVerse: current.selectedVerse,
        mode: BibleScreenMode.chapterReading,
      );
    }
  }

  /// Load a specific chapter from the server
  Future<void> loadChapter(String book, int chapter) async {
    final service = _service;
    if (service == null) return;

    state = state.copyWith(
      isLoadingChapter: true,
      mode: BibleScreenMode.chapterReading,
      clearSelectedVerse: true,
    );

    try {
      final translation = state.currentTranslation;
      final data = await service.getChapter(translation, book, chapter);
      if (mounted) {
        state = state.copyWith(
          currentBook: book,
          currentChapter: chapter,
          passages: data.verses,
          isLoadingChapter: false,
        );
      }
    } catch (_) {
      if (mounted) {
        state = state.copyWith(isLoadingChapter: false);
      }
    }
  }

  /// Select a verse (highlight it)
  void selectVerse(int verse) {
    state = state.copyWith(selectedVerse: verse);
  }

  /// Handle search input with debounce — resolves to chapter/verse/search
  void onSearchChanged(String query) {
    _debounce?.cancel();
    if (query.trim().isEmpty) {
      // Return to chapter reading if we have one
      if (state.currentBook != null && state.currentChapter != null) {
        state = state.copyWith(
          mode: BibleScreenMode.chapterReading,
          referenceResults: [],
          keywordResults: [],
          lastSearchQuery: '',
        );
      } else {
        state = state.copyWith(
          mode: BibleScreenMode.chapterReading,
          referenceResults: [],
          keywordResults: [],
          lastSearchQuery: '',
        );
      }
      return;
    }
    _debounce = Timer(const Duration(milliseconds: 500), () {
      _resolveSearch(query.trim());
    });
  }

  /// Execute search immediately (e.g., on Enter key)
  void onSearchSubmitted(String query) {
    _debounce?.cancel();
    if (query.trim().isEmpty) return;
    _resolveSearch(query.trim());
  }

  /// Resolve a search query: parse as reference first, then keyword search
  Future<void> _resolveSearch(String query) async {
    final service = _service;
    if (service == null) return;

    state = state.copyWith(isSearching: true, lastSearchQuery: query);

    // Step 1: Try fuzzy reference parsing
    final refResults = parser.parseBibleSearch(query);

    // Step 2: If the query looks like a reference and we got a chapter match, load it directly
    final chapterMatch = refResults.where((r) => r.chapter != null).firstOrNull;
    if (chapterMatch != null && chapterMatch.book.isNotEmpty) {
      // Load the chapter and optionally jump to verse
      await loadChapter(chapterMatch.book, chapterMatch.chapter!);
      if (chapterMatch.verse != null && mounted) {
        state = state.copyWith(selectedVerse: chapterMatch.verse);
      }
      state = state.copyWith(isSearching: false);
      return;
    }

    // Step 3: If reference parsed but no chapter (book-only match), load chapter 1
    final bookMatch = refResults.where((r) => r.chapter == null).firstOrNull;
    if (bookMatch != null) {
      await loadChapter(bookMatch.book, 1);
      state = state.copyWith(isSearching: false);
      return;
    }

    // Step 4: No reference match — do keyword search on server
    final translation = state.currentTranslation;
    List<BibleServerSearchResult> keywordResults = [];
    try {
      final response = await service.search(translation, query, limit: 20);
      keywordResults = response.results;
    } catch (_) {}

    if (mounted) {
      state = state.copyWith(
        referenceResults: refResults,
        keywordResults: keywordResults,
        mode: BibleScreenMode.searchResults,
        isSearching: false,
      );
    }
  }

  /// Switch translation
  void setTranslation(String translation) {
    state = state.copyWith(currentTranslation: translation);
    // Reload current chapter with new translation
    if (state.currentBook != null && state.currentChapter != null) {
      loadChapter(state.currentBook!, state.currentChapter!);
    }
  }

  @override
  void dispose() {
    _debounce?.cancel();
    super.dispose();
  }
}

final bibleProvider = StateNotifierProvider<BibleNotifier, BibleScreenState>((ref) {
  return BibleNotifier(ref);
});

// ── Favorites ────────────────────────────────────────────────────────────

final favoritesProvider =
    StateNotifierProvider<FavoritesNotifier, List<String>>((ref) {
  return FavoritesNotifier();
});

class FavoritesNotifier extends StateNotifier<List<String>> {
  FavoritesNotifier() : super([]) {
    _load();
  }

  static const _key = 'bible_favorites';

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getStringList(_key) ?? [];
    state = raw;
  }

  Future<void> toggle(String reference) async {
    state = state.contains(reference)
        ? [...state.where((r) => r != reference)]
        : [...state, reference];
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList(_key, state);
  }

  bool isFavorite(String reference) => state.contains(reference);
}

// ── History ──────────────────────────────────────────────────────────────

final historyProvider =
    StateNotifierProvider<HistoryNotifier, List<String>>((ref) {
  return HistoryNotifier();
});

class HistoryNotifier extends StateNotifier<List<String>> {
  HistoryNotifier() : super([]) {
    _load();
  }

  static const _key = 'bible_history';
  static const _max = 50;

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getStringList(_key) ?? [];
    state = raw;
  }

  Future<void> add(String reference) async {
    state = [reference, ...state.where((r) => r != reference)]
        .take(_max)
        .toList();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList(_key, state);
  }
}
