import 'dart:async';

import 'package:flutter/material.dart';
import '../services/mce_provider.dart';
import '../services/websocket_service.dart';
import '../theme/mce_theme.dart';
import '../widgets/mce_button.dart';

const _bookChapters = <String, int>{
  'Genesis': 50,
  'Exodus': 40,
  'Leviticus': 27,
  'Numbers': 36,
  'Deuteronomy': 34,
  'Joshua': 24,
  'Judges': 21,
  'Ruth': 4,
  '1 Samuel': 31,
  '2 Samuel': 24,
  '1 Kings': 22,
  '2 Kings': 25,
  '1 Chronicles': 29,
  '2 Chronicles': 36,
  'Ezra': 10,
  'Nehemiah': 13,
  'Esther': 10,
  'Job': 42,
  'Psalms': 150,
  'Proverbs': 31,
  'Ecclesiastes': 12,
  'Song of Solomon': 8,
  'Isaiah': 66,
  'Jeremiah': 52,
  'Lamentations': 5,
  'Ezekiel': 48,
  'Daniel': 12,
  'Hosea': 14,
  'Joel': 3,
  'Amos': 9,
  'Obadiah': 1,
  'Jonah': 4,
  'Micah': 7,
  'Nahum': 3,
  'Habakkuk': 3,
  'Zephaniah': 3,
  'Haggai': 2,
  'Zechariah': 14,
  'Malachi': 4,
  'Matthew': 28,
  'Mark': 16,
  'Luke': 24,
  'John': 21,
  'Acts': 28,
  'Romans': 16,
  '1 Corinthians': 16,
  '2 Corinthians': 13,
  'Galatians': 6,
  'Ephesians': 6,
  'Philippians': 4,
  'Colossians': 4,
  '1 Thessalonians': 5,
  '2 Thessalonians': 3,
  '1 Timothy': 6,
  '2 Timothy': 4,
  'Titus': 3,
  'Philemon': 1,
  'Hebrews': 13,
  'James': 5,
  '1 Peter': 5,
  '2 Peter': 3,
  '1 John': 5,
  '2 John': 1,
  '3 John': 1,
  'Jude': 1,
  'Revelation': 22,
};

const _bookAbbr = <String, String>{
  'Genesis': 'Gen',
  'Exodus': 'Exo',
  'Leviticus': 'Lev',
  'Numbers': 'Num',
  'Deuteronomy': 'Deut',
  'Joshua': 'Josh',
  'Judges': 'Judg',
  'Ruth': 'Ruth',
  '1 Samuel': '1 Sam',
  '2 Samuel': '2 Sam',
  '1 Kings': '1 Kgs',
  '2 Kings': '2 Kgs',
  '1 Chronicles': '1 Chr',
  '2 Chronicles': '2 Chr',
  'Ezra': 'Ezra',
  'Nehemiah': 'Neh',
  'Esther': 'Esth',
  'Job': 'Job',
  'Psalms': 'Psa',
  'Proverbs': 'Prov',
  'Ecclesiastes': 'Eccl',
  'Song of Solomon': 'Song',
  'Isaiah': 'Isa',
  'Jeremiah': 'Jer',
  'Lamentations': 'Lam',
  'Ezekiel': 'Ezek',
  'Daniel': 'Dan',
  'Matthew': 'Matt',
  'Mark': 'Mark',
  'Luke': 'Luke',
  'John': 'John',
  'Romans': 'Rom',
  'Revelation': 'Rev',
};

enum _BibleToolbarAction { browse, compare, refresh }

class BibleScreen extends StatefulWidget {
  const BibleScreen({super.key});

  @override
  State<BibleScreen> createState() => _BibleScreenState();
}

class _BibleScreenState extends State<BibleScreen> {
  final _searchController = TextEditingController();
  final _searchFocusNode = FocusNode();
  final _scrollController = ScrollController();
  final _verseScrollController = ScrollController();
  final Map<String, GlobalKey> _verseKeys = {};
  final _verseViewportKey = GlobalKey();
  StreamSubscription<WebSocketEvent>? _webSocketSub;
  Timer? _searchDebounce;

  String _selectedBook = 'John';
  int _selectedChapter = 3;
  int? _selectedVerse = 16;
  String _translation = 'KJV';
  String _translationA = 'KJV';
  String _translationB = 'KJV';
  String _compareMode = 'translations';
  String _compareLayout = 'line-by-line';
  String _referenceFormat = 'full';
  bool _referenceVersionVisible = true;
  bool _browsePopoverOpen = false;
  bool _compareEnabled = false;
  bool _showBibleSource = true;
  bool _favoriteSelected = false;
  bool _loadingChapter = false;
  bool _initialStateLoaded = false;
  String? _chapterError;
  String _outputMode = 'fullscreen';
  Color _dockBackgroundColor = MCEColors.background;

  List<_BibleTranslation> _translations = const [];
  List<_BibleVerseRow> _verses = [];
  final Map<String, List<_BibleVerseRow>> _chapterCache = {};
  List<_BibleVerseRow> _compareVerses = [];
  List<_ComparePassageDraft> _comparePassages = const [
    _ComparePassageDraft(reference: 'John 3:16', translation: 'KJV'),
    _ComparePassageDraft(reference: 'John 3:17', translation: 'KJV'),
  ];
  int _activeComparePassageIndex = 0;
  String _comparePassageNavigation = 'linked';
  final List<_BibleHistoryEntry> _history = [];
  final Set<String> _favoriteReferences = {};
  List<Map<String, dynamic>> _desktopSearchSuggestions = const [];
  List<String> _desktopRecentSearches = const [];
  List<String> _desktopFavoriteSearches = const [];
  bool _searchPopoverOpen = false;
  bool _searchLoading = false;
  int _searchRequestId = 0;
  int _verseScrollRequestId = 0;
  int _chapterRequestId = 0;

  bool get _shouldMirrorSelection =>
      context.mobilePreferences.syncBibleSelectionToDock;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _webSocketSub = context.webSocketService.events.listen((event) {
        if (!mounted) return;
        if (event.type == WebSocketEventType.authenticated) {
          _maybeLoadInitialBibleState();
        }
      });
      context.webSocketService.addListener(_onWebSocketChanged);
      if (context.webSocketService.isAuthenticated) {
        _maybeLoadInitialBibleState();
      } else {
        setState(() {
          _loadingChapter = false;
          _chapterError = 'Connect to the desktop to load Bible verses.';
        });
      }
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    _searchFocusNode.dispose();
    _scrollController.dispose();
    _verseScrollController.dispose();
    _searchDebounce?.cancel();
    _webSocketSub?.cancel();
    context.webSocketService.removeListener(_onWebSocketChanged);
    super.dispose();
  }

  void _openDesktopSearchPopover() {
    if (_scrollController.hasClients && _scrollController.offset > 0) {
      unawaited(
        _scrollController.animateTo(
          0,
          duration: Duration(milliseconds: 180),
          curve: Curves.easeOutCubic,
        ),
      );
    }
    if (!context.webSocketService.isAuthenticated) {
      setState(() {
        _searchPopoverOpen = true;
        _desktopSearchSuggestions = const [];
        _desktopRecentSearches = const [];
        _desktopFavoriteSearches = const [];
      });
      return;
    }
    setState(() => _searchPopoverOpen = true);
    _scheduleDesktopSearch(_searchController.text);
  }

  void _handleDesktopSearchChanged(String value) {
    setState(() => _searchPopoverOpen = true);
    _scheduleDesktopSearch(value);
  }

  void _scheduleDesktopSearch(String value) {
    _searchDebounce?.cancel();
    final query = value.trim();
    if (!context.webSocketService.isAuthenticated) return;
    _searchDebounce = Timer(
      Duration(milliseconds: 140),
      () => unawaited(_loadDesktopSearchSuggestions(query)),
    );
  }

  Future<void> _loadDesktopSearchSuggestions(String query) async {
    final webSocket = context.webSocketService;
    if (!webSocket.isAuthenticated) return;
    final requestId = ++_searchRequestId;
    if (mounted) setState(() => _searchLoading = true);
    try {
      final payload = await webSocket.getBibleSearchSuggestions(
        query: query,
        translation: _translation,
      );
      if (!mounted || requestId != _searchRequestId) return;
      final suggestions = payload['suggestions'];
      final recent = payload['recentSearches'];
      final favorites = payload['favorites'];
      setState(() {
        _desktopSearchSuggestions = suggestions is List
            ? suggestions
                  .whereType<Map>()
                  .map((item) => Map<String, dynamic>.from(item))
                  .toList()
            : const [];
        _desktopRecentSearches = recent is List
            ? recent.whereType<String>().toList()
            : const [];
        _desktopFavoriteSearches = favorites is List
            ? favorites.whereType<String>().toList()
            : const [];
        _searchLoading = false;
      });
    } catch (_) {
      if (!mounted || requestId != _searchRequestId) return;
      setState(() {
        _desktopSearchSuggestions = const [];
        _desktopRecentSearches = const [];
        _desktopFavoriteSearches = const [];
        _searchLoading = false;
      });
    }
  }

  Future<void> _selectDesktopSearchSuggestion(
    Map<String, dynamic> suggestion,
  ) async {
    final book = suggestion['book']?.toString().trim();
    final chapter = (suggestion['chapter'] as num?)?.toInt();
    final verse = (suggestion['verse'] as num?)?.toInt();
    final label = suggestion['label']?.toString().trim() ?? '';
    if (book == null || book.isEmpty || chapter == null) return;

    _searchController.clear();
    _searchFocusNode.unfocus();
    setState(() {
      _searchPopoverOpen = false;
      _desktopSearchSuggestions = const [];
      _selectedBook = book;
      _selectedChapter = chapter;
      _selectedVerse = verse;
    });
    if (label.isNotEmpty) {
      unawaited(context.webSocketService.recordBibleSearch(label));
    }
    await _loadChapter();
    if (!mounted || verse == null) return;
    setState(() => _selectedVerse = verse);
    _scrollToVerse(verse);
    if (_shouldMirrorSelection) unawaited(_pushSelectedVerse());
  }

  Future<void> _selectDesktopRecentSearch(String value) async {
    final query = value.split(' — ').first.trim();
    _searchController.clear();
    _searchFocusNode.unfocus();
    setState(() => _searchPopoverOpen = false);
    if (query.isEmpty) return;
    await _handleSearchSubmit(query);
  }

  void _onWebSocketChanged() {
    _maybeLoadInitialBibleState();
  }

  void _maybeLoadInitialBibleState() {
    if (!mounted || _initialStateLoaded) return;
    if (!context.webSocketService.isAuthenticated) return;
    _initialStateLoaded = true;
    unawaited(_loadInitialBibleState());
  }

  Future<void> _loadInitialBibleState() async {
    await Future.wait<void>([_loadDockAppearance(), _loadTranslations()]);
    if (!mounted) return;
    await _loadChapter();
  }

  Future<void> _loadDockAppearance() async {
    if (!context.webSocketService.isAuthenticated) return;
    try {
      final style = await context.webSocketService.getBiblePresentationStyle();
      final preview = style['preview'];
      final previewMap = preview is Map
          ? Map<String, dynamic>.from(preview)
          : const <String, dynamic>{};
      if (!mounted) return;
      setState(() {
        final mode = style['overlayMode']?.toString();
        if (mode == 'fullscreen' || mode == 'lower-third') {
          _outputMode = mode!;
        }
        _dockBackgroundColor = _parseColor(
          previewMap['backgroundColor']?.toString(),
          MCEColors.background,
        );
        final format = style['referenceFormat']?.toString();
        if (format == 'full' || format == 'short' || format == 'hidden') {
          _referenceFormat = format!;
        }
        _referenceVersionVisible = style['referenceVersionVisible'] != false;
      });
    } catch (_) {}
  }

  Color _parseColor(String? value, Color fallback) {
    final raw = value?.trim();
    if (raw == null || raw.isEmpty) return fallback;
    final normalized = raw.replaceFirst('#', '');
    final hex = normalized.length == 6 ? 'FF$normalized' : normalized;
    final parsed = int.tryParse(hex, radix: 16);
    return parsed == null ? fallback : Color(parsed);
  }

  Future<void> _loadTranslations() async {
    if (!context.webSocketService.isAuthenticated) return;
    try {
      final raw = await context.webSocketService.getBibleTranslations();
      if (!mounted || raw.isEmpty) return;
      setState(() {
        _translations = raw
            .map(
              (item) => _BibleTranslation(
                value: (item['value'] as String? ?? '').toUpperCase(),
                label:
                    item['label'] as String? ?? item['value'] as String? ?? '',
                language: item['language'] as String?,
              ),
            )
            .where((item) => item.value.isNotEmpty)
            .toList();
        if (!_translations.any((item) => item.value == _translation)) {
          _translation = _translations.first.value;
          _translationA = _translation;
        }
        if (!_translations.any((item) => item.value == _translationB)) {
          _translationB = _translations.length > 1
              ? _translations[1].value
              : _translation;
        }
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _translations = const [];
        _chapterError = 'Bible translations are unavailable from the desktop.';
      });
    }
  }

  Future<void> _loadChapter() async {
    final requestId = ++_chapterRequestId;
    final requestedVerse = _selectedVerse;
    final cacheKey = '$_selectedBook|$_selectedChapter|$_translation';
    final cached = _chapterCache[cacheKey];
    if (cached != null) {
      if (!mounted || requestId != _chapterRequestId) return;
      final targetVerse =
          requestedVerse != null &&
              cached.any((row) => row.verse == requestedVerse)
          ? requestedVerse
          : (cached.isNotEmpty ? cached.first.verse : null);
      setState(() {
        _verses = cached;
        _selectedVerse = targetVerse;
        _chapterError = cached.isEmpty
            ? 'No verses were returned for this reference.'
            : null;
        _loadingChapter = false;
      });
      _scrollToVerse(targetVerse);
      if (_compareEnabled) unawaited(_loadCompareChapter());
      return;
    }
    setState(() {
      _loadingChapter = true;
      _chapterError = null;
      _verses = const [];
    });

    final webSocket = context.webSocketService;
    try {
      if (!webSocket.isAuthenticated) {
        if (!mounted) return;
        setState(() {
          _loadingChapter = false;
          _chapterError = 'Connect to the desktop to load Bible verses.';
        });
        return;
      }
      final payload = await webSocket.getBibleChapter(
        book: _selectedBook,
        chapter: _selectedChapter,
        translation: _translation,
      );
      final verses = _rowsFromPayload(payload);
      if (!mounted || requestId != _chapterRequestId) return;
      _chapterCache[cacheKey] = verses;
      final targetVerse =
          requestedVerse != null &&
              verses.any((row) => row.verse == requestedVerse)
          ? requestedVerse
          : (verses.isNotEmpty ? verses.first.verse : null);
      setState(() {
        _verses = verses;
        _selectedVerse = targetVerse;
        if (_verses.isEmpty) {
          _chapterError = 'No verses were returned for this reference.';
        }
        _loadingChapter = false;
      });
      _scrollToVerse(targetVerse);
      if (_compareEnabled) await _loadCompareChapter();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _verses = const [];
        _selectedVerse = null;
        _chapterError = 'Bible data is unavailable from the desktop.';
        _loadingChapter = false;
      });
    }
  }

  Future<void> _loadCompareChapter() async {
    if (!context.webSocketService.isAuthenticated) return;
    try {
      final payload = await context.webSocketService.getBibleChapter(
        book: _selectedBook,
        chapter: _selectedChapter,
        translation: _translationB,
      );
      if (!mounted) return;
      setState(() => _compareVerses = _rowsFromPayload(payload));
    } catch (_) {
      if (!mounted) return;
      setState(() => _compareVerses = const []);
    }
  }

  List<_BibleVerseRow> _rowsFromPayload(Map<String, dynamic> payload) {
    final rawVerses = payload['verses'];
    if (rawVerses is! List) return const [];
    return rawVerses
        .whereType<Map>()
        .map((item) {
          final verse = item['verse'];
          final text = item['text'];
          if (verse is! num || text is! String || text.trim().isEmpty) {
            return null;
          }
          return _BibleVerseRow(verse: verse.toInt(), text: text);
        })
        .whereType<_BibleVerseRow>()
        .toList();
  }

  String _verseKeyId(String book, int chapter, int verse) =>
      '$book::$chapter::$verse';

  GlobalKey _keyForVerse(_BibleVerseRow row) {
    final keyId = _verseKeyId(_selectedBook, _selectedChapter, row.verse);
    return _verseKeys.putIfAbsent(keyId, GlobalKey.new);
  }

  double _verseViewportHeight() =>
      (MediaQuery.sizeOf(context).height * 0.40).clamp(260.0, 460.0).toDouble();

  void _scrollToVerse(int? verse) {
    if (verse == null) return;
    final requestId = ++_verseScrollRequestId;
    final book = _selectedBook;
    final chapter = _selectedChapter;
    void revealEstimated() {
      if (!mounted || requestId != _verseScrollRequestId) return;
      if (!_verseScrollController.hasClients) return;
      final index = _verses.indexWhere((row) => row.verse == verse);
      if (index < 0) return;
      final position = _verseScrollController.position;
      final estimatedOffset = index * 56.0 - _verseViewportHeight() * 0.32;
      final targetOffset = estimatedOffset
          .clamp(position.minScrollExtent, position.maxScrollExtent)
          .toDouble();
      position.animateTo(
        targetOffset,
        duration: Duration(milliseconds: 220),
        curve: Curves.easeOutCubic,
      );
    }

    void reveal() {
      if (!mounted || requestId != _verseScrollRequestId) return;
      if (!_verseScrollController.hasClients) return;
      final targetContext =
          _verseKeys[_verseKeyId(book, chapter, verse)]?.currentContext;
      if (targetContext == null) {
        revealEstimated();
        return;
      }
      final targetRenderObject = targetContext.findRenderObject();
      final viewportRenderObject = _verseViewportKey.currentContext
          ?.findRenderObject();
      if (targetRenderObject is! RenderBox ||
          viewportRenderObject is! RenderBox) {
        revealEstimated();
        return;
      }
      final targetTop = targetRenderObject.localToGlobal(Offset.zero).dy;
      final viewportTop = viewportRenderObject.localToGlobal(Offset.zero).dy;
      final desiredDelta =
          targetTop - viewportTop - viewportRenderObject.size.height * 0.32;
      final position = _verseScrollController.position;
      final startingOffset = position.pixels;
      final targetOffset = (position.pixels + desiredDelta)
          .clamp(position.minScrollExtent, position.maxScrollExtent)
          .toDouble();
      position.animateTo(
        targetOffset,
        duration: Duration(milliseconds: 220),
        curve: Curves.easeOutCubic,
      );
      if ((targetOffset - startingOffset).abs() < 1) {
        Future<void>.delayed(Duration(milliseconds: 80), revealEstimated);
      }
    }

    WidgetsBinding.instance.addPostFrameCallback((_) {
      reveal();
      // A verse picker closes a bottom sheet first; retry after that route
      // finishes so the selected row is still revealed reliably.
      Future<void>.delayed(Duration(milliseconds: 320), () {
        reveal();
      });
    });
  }

  String get _selectedReference =>
      '$_selectedBook $_selectedChapter:${_selectedVerse ?? 1}';

  String get _referenceLabel {
    if (_referenceFormat == 'hidden') {
      return _referenceVersionVisible ? _translation : '';
    }
    final book = _referenceFormat == 'short'
        ? (_bookAbbr[_selectedBook] ?? _selectedBook.substring(0, 3))
        : _selectedBook;
    final ref = '$book $_selectedChapter:${_selectedVerse ?? 1}';
    return _referenceVersionVisible ? '$ref ($_translation)' : ref;
  }

  _BibleVerseRow? get _selectedVerseRow {
    final selected = _selectedVerse;
    if (selected == null) return null;
    for (final row in _verses) {
      if (row.verse == selected) return row;
    }
    return null;
  }

  _BibleVerseRow? get _selectedCompareRow {
    final selected = _selectedVerse;
    if (selected == null) return null;
    for (final row in _compareVerses) {
      if (row.verse == selected) return row;
    }
    return null;
  }

  Future<void> _pushSelectedVerse() async {
    final selected = _selectedVerseRow;
    if (selected == null) return;
    final webSocket = context.webSocketService;

    final reference = _selectedReference;
    final compareRow = _selectedCompareRow;
    try {
      await webSocket.showScripture(
        reference,
        translation: _translation,
        verseText: selected.text,
        displayReferenceLabel: _referenceLabel,
        overlayMode: _outputMode,
        compareEnabled: _compareEnabled,
        compareLayout: _compareLayout,
        compareMode: _compareMode,
        translationA: _translationA,
        translationB: _translationB,
        compareVerseTextA: selected.text,
        compareVerseTextB: compareRow?.text,
        comparePassages: _compareMode == 'passages'
            ? _comparePassages
                  .map(
                    (passage) => <String, dynamic>{
                      'reference': passage.reference,
                      'translation': passage.translation,
                    },
                  )
                  .toList()
            : null,
      );
      if (!mounted) return;
      setState(() {
        _history.insert(
          0,
          _BibleHistoryEntry(reference: reference, text: selected.text),
        );
        if (_history.length > 8) _history.removeLast();
      });
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Failed to send verse: $e'),
          backgroundColor: MCEColors.danger,
        ),
      );
    }
  }

  Future<void> _clearBible() async {
    try {
      await context.webSocketService.clearScripture();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Failed to clear Bible: $e'),
          backgroundColor: MCEColors.danger,
        ),
      );
    }
  }

  void _selectVerse(int verse, {bool push = false}) {
    setState(() => _selectedVerse = verse);
    _scrollToVerse(verse);
    if (push || _shouldMirrorSelection) {
      unawaited(_pushSelectedVerse());
    }
  }

  Future<void> _selectBook(String book) async {
    Navigator.of(context).pop();
    _searchController.clear();
    setState(() {
      _selectedBook = book;
      _selectedChapter = 1;
      _selectedVerse = null;
      _browsePopoverOpen = false;
    });
    await _loadChapter();
    if (_shouldMirrorSelection) unawaited(_pushSelectedVerse());
  }

  Future<void> _selectChapter(int chapter) async {
    Navigator.of(context).pop();
    _searchController.clear();
    setState(() {
      _selectedChapter = chapter;
      _selectedVerse = null;
    });
    await _loadChapter();
    if (_shouldMirrorSelection) unawaited(_pushSelectedVerse());
  }

  void _selectVerseFromSheet(int verse) {
    Navigator.of(context).pop();
    _selectVerse(verse);
  }

  Future<void> _selectTranslation(String value) async {
    Navigator.of(context).pop();
    _searchController.clear();
    setState(() {
      _translation = value;
      _translationA = value;
    });
    await _loadChapter();
    if (_shouldMirrorSelection) unawaited(_pushSelectedVerse());
  }

  Future<void> _handleSearchSubmit(String query) async {
    final trimmed = query.trim();
    if (trimmed.isEmpty) return;
    if (!context.webSocketService.isAuthenticated) {
      setState(
        () => _chapterError = 'Connect to the desktop to search Bible data.',
      );
      return;
    }

    final match = RegExp(r'^(.+?)\s+(\d+):(\d+)$').firstMatch(trimmed);
    if (match != null) {
      _searchFocusNode.unfocus();
      setState(() => _searchPopoverOpen = false);
      final bookQuery = match.group(1)!.trim().toLowerCase();
      final book = _bookChapters.keys.firstWhere(
        (item) =>
            item.toLowerCase() == bookQuery ||
            (_bookAbbr[item] ?? '').toLowerCase() == bookQuery,
        orElse: () => _selectedBook,
      );
      _searchController.clear();
      setState(() {
        _selectedBook = book;
        _selectedChapter = int.tryParse(match.group(2)!) ?? 1;
        _selectedVerse = int.tryParse(match.group(3)!);
      });
      await _loadChapter();
      if (_shouldMirrorSelection) unawaited(_pushSelectedVerse());
      return;
    }

    final payload = await context.webSocketService.getBibleSearchSuggestions(
      query: trimmed,
      translation: _translation,
    );
    final suggestions = payload['suggestions'];
    if (suggestions is List && suggestions.isNotEmpty) {
      final first = suggestions.first;
      if (first is Map) {
        await _selectDesktopSearchSuggestion(Map<String, dynamic>.from(first));
      }
    }
  }

  void _toggleFavorite() {
    final reference = _selectedReference;
    setState(() {
      if (_favoriteReferences.contains(reference)) {
        _favoriteReferences.remove(reference);
        _favoriteSelected = false;
      } else {
        _favoriteReferences.add(reference);
        _favoriteSelected = true;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Expanded(
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              ListView(
                controller: _scrollController,
                physics: _searchPopoverOpen || _browsePopoverOpen
                    ? NeverScrollableScrollPhysics()
                    : null,
                padding: const EdgeInsets.all(MCESpacing.lg),
                children: [
                  _buildSearchAndTranslationRow(),
                  SizedBox(height: MCESpacing.md),
                  _buildReaderPanel(),
                  SizedBox(height: MCESpacing.xxl),
                ],
              ),
              if (_browsePopoverOpen)
                Positioned(
                  top: MCESpacing.lg + 44 + MCESpacing.sm,
                  left: MCESpacing.lg,
                  right: MCESpacing.lg,
                  child: _buildBrowsePopover(),
                ),
              if (_searchPopoverOpen)
                Positioned(
                  top: MCESpacing.lg + 44 + MCESpacing.xs,
                  left: MCESpacing.lg,
                  right: MCESpacing.lg + 86 + MCESpacing.sm,
                  child: _buildSearchPopover(),
                ),
            ],
          ),
        ),
        _buildBottomToolbar(),
      ],
    );
  }

  Widget _buildSearchAndTranslationRow() {
    return Row(
      children: [
        Expanded(child: _buildDesktopSearchControl()),
        SizedBox(width: MCESpacing.sm),
        _DockButton(
          label: _translation,
          icon: Icons.keyboard_arrow_down,
          onTap: _showTranslationLibrary,
          width: 86,
        ),
        SizedBox(width: MCESpacing.sm),
        _DockOverflowButton(
          active: _compareEnabled || _browsePopoverOpen,
          onSelected: (action) {
            switch (action) {
              case _BibleToolbarAction.browse:
                WidgetsBinding.instance.addPostFrameCallback((_) {
                  if (!mounted) return;
                  setState(() {
                    _browsePopoverOpen = !_browsePopoverOpen;
                    _searchPopoverOpen = false;
                  });
                });
              case _BibleToolbarAction.compare:
                _showCompareSheet();
              case _BibleToolbarAction.refresh:
                _loadChapter();
            }
          },
        ),
      ],
    );
  }

  Color get _dockPanelColor => _dockBackgroundColor;

  Color get _dockPanelTextColor => _dockPanelColor.computeLuminance() > 0.52
      ? Color(0xFF111827)
      : MCEColors.textPrimary;

  Widget _buildDesktopSearchControl() {
    final query = _searchController.text.trim();

    return _DockBox(
      height: 44,
      padding: const EdgeInsets.symmetric(horizontal: MCESpacing.md),
      child: Row(
        children: [
          Icon(Icons.search, size: 18, color: MCEColors.textSecondary),
          SizedBox(width: MCESpacing.sm),
          Expanded(
            child: TextField(
              controller: _searchController,
              focusNode: _searchFocusNode,
              onTap: _openDesktopSearchPopover,
              onChanged: _handleDesktopSearchChanged,
              onSubmitted: _handleSearchSubmit,
              style: MCETypography.body,
              decoration: InputDecoration(
                hintText: 'Search Bible reference or keyword...',
                hintStyle: MCETypography.body.copyWith(
                  color: MCEColors.textTertiary,
                ),
                border: InputBorder.none,
                isDense: true,
              ),
            ),
          ),
          if (query.isNotEmpty)
            GestureDetector(
              onTap: () {
                _searchController.clear();
                _handleDesktopSearchChanged('');
              },
              child: Icon(
                Icons.close,
                size: 16,
                color: MCEColors.textSecondary,
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildSearchPopover() {
    final panelColor = _dockPanelColor;
    final panelTextColor = _dockPanelTextColor;
    final query = _searchController.text.trim();
    final hasResults = _desktopSearchSuggestions.isNotEmpty;
    final hasRecent =
        _desktopRecentSearches.isNotEmpty ||
        _desktopFavoriteSearches.isNotEmpty;

    return Material(
      color: Colors.transparent,
      elevation: 10,
      child: Container(
        constraints: BoxConstraints(maxHeight: 320),
        decoration: BoxDecoration(
          color: panelColor,
          borderRadius: BorderRadius.circular(MCERadius.md),
          border: Border.all(color: MCEColors.border),
          boxShadow: const [
            BoxShadow(
              color: Color(0x66000000),
              blurRadius: 18,
              offset: Offset(0, 8),
            ),
          ],
        ),
        child: _searchLoading
            ? Padding(
                padding: EdgeInsets.all(MCESpacing.lg),
                child: Center(
                  child: SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                ),
              )
            : !context.webSocketService.isAuthenticated
            ? _SearchPopoverMessage(
                icon: Icons.wifi_off,
                message: 'Connect to the desktop to search Bible data.',
                color: panelTextColor,
              )
            : query.isEmpty
            ? hasRecent
                  ? ListView(
                      shrinkWrap: true,
                      padding: const EdgeInsets.symmetric(
                        vertical: MCESpacing.xs,
                      ),
                      children: [
                        if (_desktopRecentSearches.isNotEmpty)
                          _SearchPopoverHeading(
                            label: 'Recent searches',
                            color: panelTextColor,
                          ),
                        ..._desktopRecentSearches.map(
                          (item) => _SearchPopoverItem(
                            icon: Icons.history,
                            label: item,
                            color: panelTextColor,
                            onTap: () =>
                                unawaited(_selectDesktopRecentSearch(item)),
                          ),
                        ),
                        if (_desktopFavoriteSearches.isNotEmpty)
                          _SearchPopoverHeading(
                            label: 'Favorites',
                            color: panelTextColor,
                          ),
                        ..._desktopFavoriteSearches.map(
                          (item) => _SearchPopoverItem(
                            icon: Icons.star_border,
                            label: item,
                            color: panelTextColor,
                            onTap: () =>
                                unawaited(_selectDesktopRecentSearch(item)),
                          ),
                        ),
                      ],
                    )
                  : _SearchPopoverMessage(
                      icon: Icons.history,
                      message: 'No recent searches on the Dock yet.',
                      color: panelTextColor,
                    )
            : hasResults
            ? ListView(
                shrinkWrap: true,
                padding: const EdgeInsets.symmetric(vertical: MCESpacing.xs),
                children: _desktopSearchSuggestions
                    .map(
                      (item) => _SearchPopoverItem(
                        icon: item['kind'] == 'keyword'
                            ? Icons.search
                            : (item['verse'] == null
                                  ? Icons.menu_book
                                  : Icons.format_quote),
                        label: item['label']?.toString() ?? '',
                        subtitle: item['snippet']?.toString(),
                        color: panelTextColor,
                        onTap: () =>
                            unawaited(_selectDesktopSearchSuggestion(item)),
                      ),
                    )
                    .toList(),
              )
            : _SearchPopoverMessage(
                icon: Icons.search_off,
                message: 'No matches for "$query"',
                color: panelTextColor,
              ),
      ),
    );
  }

  Widget _buildBrowsePopover() {
    return Material(
      color: Colors.transparent,
      elevation: 10,
      child: Container(
        decoration: BoxDecoration(
          color: MCEColors.elevated,
          borderRadius: BorderRadius.circular(MCERadius.md),
          border: Border.all(color: MCEColors.border),
          boxShadow: const [
            BoxShadow(
              color: Color(0x66000000),
              blurRadius: 18,
              offset: Offset(0, 8),
            ),
          ],
        ),
        child: Padding(
          padding: const EdgeInsets.all(MCESpacing.sm),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      'Browse Bible',
                      style: MCETypography.captionBold,
                    ),
                  ),
                  IconButton(
                    visualDensity: VisualDensity.compact,
                    padding: EdgeInsets.zero,
                    onPressed: () => setState(() => _browsePopoverOpen = false),
                    icon: Icon(Icons.close, size: 18),
                    color: MCEColors.textSecondary,
                  ),
                ],
              ),
              _buildBrowseControls(),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildBrowseControls() {
    return _DockBox(
      padding: const EdgeInsets.all(MCESpacing.sm),
      child: Column(
        children: [
          _BookTrigger(book: _selectedBook, onTap: _showBookPicker),
          SizedBox(height: MCESpacing.sm),
          Row(
            children: [
              Expanded(
                child: _PickerTrigger(
                  label: 'Ch',
                  value: '$_selectedChapter',
                  onTap: _showChapterPicker,
                ),
              ),
              SizedBox(width: MCESpacing.sm),
              Expanded(
                child: _PickerTrigger(
                  label: 'V',
                  value: _selectedVerse?.toString() ?? '--',
                  onTap: _showVersePicker,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildReaderPanel() {
    final rows = _visibleRows();
    return _DockBox(
      padding: EdgeInsets.zero,
      child: Column(
        children: [
          _buildReaderHeader(),
          if (_chapterError != null)
            _InlineWarning(
              message: _chapterError!,
              onClose: () => setState(() => _chapterError = null),
            ),
          if (_loadingChapter)
            Padding(
              padding: EdgeInsets.all(MCESpacing.xl),
              child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
            )
          else if (rows.isEmpty)
            Padding(
              padding: EdgeInsets.all(MCESpacing.xl),
              child: Text(
                _verses.isEmpty
                    ? 'No verses were returned for this reference.'
                    : 'No verses match this search',
                style: MCETypography.caption,
              ),
            )
          else
            SizedBox(
              key: _verseViewportKey,
              height: _verseViewportHeight(),
              child: SingleChildScrollView(
                controller: _verseScrollController,
                child: Column(children: rows.map(_buildVerseRow).toList()),
              ),
            ),
        ],
      ),
    );
  }

  List<_BibleVerseRow> _visibleRows() {
    // Search belongs to the desktop Dock popover. Keep the current chapter
    // visible while the operator is typing so a suggestion lookup never
    // blanks the reader with a phone-local keyword filter.
    return _verses;
  }

  Widget _buildReaderHeader() {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: MCESpacing.md,
        vertical: MCESpacing.sm,
      ),
      decoration: BoxDecoration(
        border: Border(bottom: BorderSide(color: MCEColors.border)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text('Reading', style: MCETypography.small),
              SizedBox(width: MCESpacing.sm),
              _ChapterNavButton(
                icon: Icons.chevron_left,
                disabled: _selectedChapter <= 1,
                onTap: () async {
                  setState(() => _selectedChapter -= 1);
                  await _loadChapter();
                  if (_shouldMirrorSelection) unawaited(_pushSelectedVerse());
                },
              ),
              _ChapterNavButton(
                icon: Icons.chevron_right,
                disabled:
                    _selectedChapter >= (_bookChapters[_selectedBook] ?? 1),
                onTap: () async {
                  setState(() => _selectedChapter += 1);
                  await _loadChapter();
                  if (_shouldMirrorSelection) unawaited(_pushSelectedVerse());
                },
              ),
              Spacer(),
              _DockIconButton(
                icon:
                    _favoriteSelected ||
                        _favoriteReferences.contains(_selectedReference)
                    ? Icons.star
                    : Icons.star_border,
                active: _favoriteReferences.contains(_selectedReference),
                onTap: _toggleFavorite,
              ),
              SizedBox(width: MCESpacing.xs),
              _DockIconButton(icon: Icons.history, onTap: _showHistorySheet),
            ],
          ),
          SizedBox(height: MCESpacing.xs),
          Row(
            children: [
              Expanded(
                child: Text(
                  _referenceLabel.isEmpty
                      ? 'Reference hidden'
                      : _referenceLabel,
                  style: MCETypography.bodyBold,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              SizedBox(width: MCESpacing.sm),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: MCEColors.primaryBg,
                  borderRadius: BorderRadius.circular(MCERadius.sm),
                ),
                child: Text(
                  _compareEnabled && _compareMode == 'passages'
                      ? 'Compare passages'
                      : _compareEnabled
                      ? '$_translationA / $_translationB'
                      : _translation,
                  style: MCETypography.tiny.copyWith(
                    color: MCEColors.primaryBlue,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildVerseRow(_BibleVerseRow row) {
    final isSelected = _selectedVerse == row.verse;
    final compareRow = _compareVerses
        .where((item) => item.verse == row.verse)
        .firstOrNull;
    return GestureDetector(
      key: _keyForVerse(row),
      onTap: () => _selectVerse(row.verse),
      child: Container(
        padding: const EdgeInsets.symmetric(
          horizontal: MCESpacing.md,
          vertical: MCESpacing.sm,
        ),
        decoration: BoxDecoration(
          color: isSelected ? MCEColors.primaryBg : Colors.transparent,
          border: Border(bottom: BorderSide(color: MCEColors.borderLight)),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              width: 28,
              child: Text(
                '${row.verse}',
                style: MCETypography.captionBold.copyWith(
                  color: isSelected
                      ? MCEColors.primaryBlue
                      : MCEColors.textSecondary,
                ),
              ),
            ),
            Expanded(
              child: _compareEnabled && _compareMode == 'translations'
                  ? _buildCompareVerseText(row, compareRow)
                  : Text(
                      row.text,
                      style: MCETypography.body.copyWith(
                        color: isSelected
                            ? MCEColors.textPrimary
                            : MCEColors.textSecondary,
                        height: 1.45,
                      ),
                    ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCompareVerseText(_BibleVerseRow a, _BibleVerseRow? b) {
    if (_compareLayout == 'side-by-side') {
      return Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: _CompareBlock(translation: _translationA, text: a.text),
          ),
          SizedBox(width: MCESpacing.sm),
          Expanded(
            child: _CompareBlock(
              translation: _translationB,
              text: b?.text ?? 'Not available',
            ),
          ),
        ],
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _CompareBlock(translation: _translationA, text: a.text),
        SizedBox(height: MCESpacing.sm),
        _CompareBlock(
          translation: _translationB,
          text: b?.text ?? 'Not available',
        ),
      ],
    );
  }

  Widget _buildBottomToolbar() {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: MCESpacing.lg,
        vertical: MCESpacing.md,
      ),
      decoration: BoxDecoration(
        color: MCEColors.surface,
        border: Border(top: BorderSide(color: MCEColors.border)),
      ),
      child: SafeArea(
        top: false,
        child: Row(
          children: [
            _ModeToggle(
              value: _outputMode,
              onChanged: (value) => setState(() => _outputMode = value),
            ),
            SizedBox(width: MCESpacing.sm),
            Expanded(
              child: _BottomActionButton(
                label: 'Push To OBS',
                icon: Icons.cast,
                color: MCEColors.primaryBlue,
                foreground: Colors.white,
                onTap: _selectedVerseRow == null ? null : _pushSelectedVerse,
              ),
            ),
            SizedBox(width: MCESpacing.sm),
            _DockIconButton(
              icon: _showBibleSource ? Icons.visibility_off : Icons.visibility,
              active: !_showBibleSource,
              onTap: () {
                setState(() => _showBibleSource = !_showBibleSource);
                if (!_showBibleSource) _clearBible();
              },
            ),
          ],
        ),
      ),
    );
  }

  void _showTranslationLibrary() {
    _showDockSheet(
      title: 'Bible Versions',
      child: Column(
        children: _translations
            .map(
              (item) => _SheetOption(
                title: item.value,
                subtitle: item.label,
                active: item.value == _translation,
                onTap: () => _selectTranslation(item.value),
              ),
            )
            .toList(),
      ),
    );
  }

  void _showCompareSheet() {
    var activeTab = _compareMode == 'passages' ? 1 : 0;
    _showDockSheet(
      title: 'Compare',
      child: StatefulBuilder(
        builder: (context, setSheetState) {
          final translationOptions = _translations.isEmpty
              ? const [_BibleTranslation(value: 'KJV', label: 'KJV')]
              : _translations;

          void updatePassage(int index, _ComparePassageDraft next) {
            setState(() {
              _comparePassages = [
                for (var i = 0; i < _comparePassages.length; i++)
                  if (i == index) next else _comparePassages[i],
              ];
            });
            setSheetState(() {});
          }

          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              DefaultTabController(
                length: 2,
                initialIndex: activeTab,
                child: Column(
                  children: [
                    TabBar(
                      onTap: (index) {
                        activeTab = index;
                        setState(
                          () => _compareMode = index == 1
                              ? 'passages'
                              : 'translations',
                        );
                        setSheetState(() {});
                      },
                      labelColor: MCEColors.primaryBlue,
                      unselectedLabelColor: MCEColors.textSecondary,
                      indicatorColor: MCEColors.primaryBlue,
                      dividerColor: MCEColors.border,
                      tabs: const [
                        Tab(text: 'Compare Translations'),
                        Tab(text: 'Compare Passages'),
                      ],
                    ),
                    SizedBox(height: MCESpacing.md),
                    if (activeTab == 0)
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _SwitchRow(
                            title: 'Enable Compare Translations',
                            value:
                                _compareEnabled &&
                                _compareMode == 'translations',
                            onChanged: (value) async {
                              setSheetState(() => _compareEnabled = value);
                              setState(() {
                                _compareEnabled = value;
                                _compareMode = 'translations';
                              });
                              if (value) await _loadCompareChapter();
                            },
                          ),
                          SizedBox(height: MCESpacing.md),
                          _SheetSelect(
                            label: 'Layout',
                            value: _compareLayout == 'line-by-line'
                                ? 'Line By Line'
                                : 'Side By Side',
                            onTap: () {
                              setSheetState(() {
                                _compareLayout =
                                    _compareLayout == 'line-by-line'
                                    ? 'side-by-side'
                                    : 'line-by-line';
                              });
                              setState(() {});
                            },
                          ),
                          SizedBox(height: MCESpacing.sm),
                          _TranslationChooser(
                            label: 'Translation A',
                            value: _translationA,
                            translations: _translations,
                            onChanged: (value) async {
                              setSheetState(() => _translationA = value);
                              setState(() {
                                _translationA = value;
                                _translation = value;
                              });
                              await _loadChapter();
                            },
                          ),
                          SizedBox(height: MCESpacing.sm),
                          _TranslationChooser(
                            label: 'Translation B',
                            value: _translationB,
                            translations: _translations,
                            onChanged: (value) async {
                              setSheetState(() => _translationB = value);
                              setState(() => _translationB = value);
                              await _loadCompareChapter();
                            },
                          ),
                        ],
                      )
                    else
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _SwitchRow(
                            title: 'Enable Compare Passages',
                            value:
                                _compareEnabled && _compareMode == 'passages',
                            onChanged: (value) {
                              setSheetState(() => _compareEnabled = value);
                              setState(() {
                                _compareEnabled = value;
                                _compareMode = 'passages';
                              });
                            },
                          ),
                          SizedBox(height: MCESpacing.sm),
                          _SheetSelect(
                            label: 'Active passage',
                            value: 'Passage ${_activeComparePassageIndex + 1}',
                            onTap: () {
                              setState(() {
                                _activeComparePassageIndex =
                                    (_activeComparePassageIndex + 1) %
                                    _comparePassages.length;
                              });
                              setSheetState(() {});
                            },
                          ),
                          SizedBox(height: MCESpacing.sm),
                          _SheetSelect(
                            label: 'Navigation',
                            value: _comparePassageNavigation == 'linked'
                                ? 'Linked — move all passages'
                                : 'Independent — move active passage',
                            onTap: () {
                              setState(() {
                                _comparePassageNavigation =
                                    _comparePassageNavigation == 'linked'
                                    ? 'independent'
                                    : 'linked';
                              });
                              setSheetState(() {});
                            },
                          ),
                          SizedBox(height: MCESpacing.md),
                          ..._comparePassages.asMap().entries.map((entry) {
                            final index = entry.key;
                            final passage = entry.value;
                            final translation =
                                translationOptions.any(
                                  (item) => item.value == passage.translation,
                                )
                                ? passage.translation
                                : translationOptions.first.value;
                            return Padding(
                              padding: const EdgeInsets.only(
                                bottom: MCESpacing.sm,
                              ),
                              child: _DockBox(
                                padding: const EdgeInsets.all(MCESpacing.md),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Row(
                                      children: [
                                        Expanded(
                                          child: Text(
                                            'Passage ${index + 1}',
                                            style: MCETypography.captionBold,
                                          ),
                                        ),
                                        if (_comparePassages.length > 2)
                                          IconButton(
                                            tooltip: 'Remove passage',
                                            onPressed: () {
                                              setState(() {
                                                _comparePassages = [
                                                  for (
                                                    var i = 0;
                                                    i < _comparePassages.length;
                                                    i++
                                                  )
                                                    if (i != index)
                                                      _comparePassages[i],
                                                ];
                                                if (_activeComparePassageIndex >=
                                                    _comparePassages.length) {
                                                  _activeComparePassageIndex =
                                                      _comparePassages.length -
                                                      1;
                                                }
                                              });
                                              setSheetState(() {});
                                            },
                                            icon: Icon(Icons.close, size: 17),
                                            color: MCEColors.textSecondary,
                                            visualDensity:
                                                VisualDensity.compact,
                                          ),
                                      ],
                                    ),
                                    TextFormField(
                                      key: ValueKey('compare-passage-$index'),
                                      initialValue: passage.reference,
                                      onChanged: (value) => updatePassage(
                                        index,
                                        passage.copyWith(reference: value),
                                      ),
                                      onTap: () => setState(
                                        () =>
                                            _activeComparePassageIndex = index,
                                      ),
                                      decoration: InputDecoration(
                                        labelText: 'Reference',
                                        hintText: 'John 3:16',
                                      ),
                                    ),
                                    SizedBox(height: MCESpacing.sm),
                                    DropdownButtonFormField<String>(
                                      initialValue: translation,
                                      decoration: InputDecoration(
                                        labelText: 'Translation',
                                      ),
                                      items: translationOptions
                                          .map(
                                            (item) => DropdownMenuItem(
                                              value: item.value,
                                              child: Text(item.label),
                                            ),
                                          )
                                          .toList(),
                                      onChanged: (value) {
                                        if (value == null) return;
                                        updatePassage(
                                          index,
                                          passage.copyWith(translation: value),
                                        );
                                      },
                                    ),
                                  ],
                                ),
                              ),
                            );
                          }),
                          if (_comparePassages.length < 3)
                            TextButton.icon(
                              onPressed: () {
                                setState(() {
                                  _comparePassages = [
                                    ..._comparePassages,
                                    _ComparePassageDraft(
                                      reference: 'John 3:18',
                                      translation: _translation,
                                    ),
                                  ];
                                });
                                setSheetState(() {});
                              },
                              icon: Icon(Icons.add, size: 17),
                              label: Text('Add passage'),
                            ),
                          SizedBox(height: MCESpacing.xs),
                          Text(
                            'Use the active passage in the Bible reader, then send all passages to OBS.',
                            style: MCETypography.caption,
                          ),
                        ],
                      ),
                  ],
                ),
              ),
              SizedBox(height: MCESpacing.lg),
              SizedBox(
                width: double.infinity,
                child: MCEButton.primary(
                  label: 'Send to OBS',
                  icon: Icons.cast,
                  onPressed: _compareEnabled && _selectedVerse != null
                      ? () {
                          Navigator.of(context).pop();
                          _pushSelectedVerse();
                        }
                      : null,
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  void _showHistorySheet() {
    _showDockSheet(
      title: 'History',
      child: Column(
        children: [
          if (_history.isEmpty)
            Padding(
              padding: EdgeInsets.all(MCESpacing.lg),
              child: Text('No Bible history yet', style: MCETypography.caption),
            ),
          ..._history.map(
            (item) => _SheetOption(
              title: item.reference,
              subtitle: item.text,
              active: item.reference == _selectedReference,
              onTap: () {
                Navigator.of(context).pop();
                final match = RegExp(
                  r'^(.+?)\s+(\d+):(\d+)',
                ).firstMatch(item.reference);
                if (match == null) return;
                setState(() {
                  _selectedBook = match.group(1)!;
                  _selectedChapter = int.tryParse(match.group(2)!) ?? 1;
                  _selectedVerse = int.tryParse(match.group(3)!);
                });
                unawaited(
                  _loadChapter().then((_) {
                    if (_shouldMirrorSelection) return _pushSelectedVerse();
                  }),
                );
              },
            ),
          ),
          if (_favoriteReferences.isNotEmpty) ...[
            SizedBox(height: MCESpacing.md),
            Align(
              alignment: Alignment.centerLeft,
              child: Text('Favorites', style: MCETypography.captionBold),
            ),
            SizedBox(height: MCESpacing.sm),
            ..._favoriteReferences.map(
              (reference) => _SheetOption(
                title: reference,
                subtitle: 'Saved passage',
                active: reference == _selectedReference,
                leading: Icons.star,
                onTap: () {
                  Navigator.of(context).pop();
                  final match = RegExp(
                    r'^(.+?)\s+(\d+):(\d+)',
                  ).firstMatch(reference);
                  if (match == null) return;
                  setState(() {
                    _selectedBook = match.group(1)!;
                    _selectedChapter = int.tryParse(match.group(2)!) ?? 1;
                    _selectedVerse = int.tryParse(match.group(3)!);
                  });
                  unawaited(
                    _loadChapter().then((_) {
                      if (_shouldMirrorSelection) return _pushSelectedVerse();
                    }),
                  );
                },
              ),
            ),
          ],
        ],
      ),
    );
  }

  void _showBookPicker() {
    if (_browsePopoverOpen) {
      setState(() => _browsePopoverOpen = false);
    }
    _showDockSheet(
      title: 'Select Book',
      child: GridView.count(
        shrinkWrap: true,
        physics: NeverScrollableScrollPhysics(),
        crossAxisCount: 2,
        crossAxisSpacing: MCESpacing.sm,
        mainAxisSpacing: MCESpacing.sm,
        childAspectRatio: 2.5,
        children: _bookChapters.keys
            .map(
              (book) => _BookOption(
                book: book,
                active: book == _selectedBook,
                onTap: () => _selectBook(book),
              ),
            )
            .toList(),
      ),
    );
  }

  void _showChapterPicker() {
    if (_browsePopoverOpen) {
      setState(() => _browsePopoverOpen = false);
    }
    final count = _bookChapters[_selectedBook] ?? 1;
    _showNumberPicker(
      title: 'Chapters',
      count: count,
      active: _selectedChapter,
      onTap: _selectChapter,
    );
  }

  void _showVersePicker() {
    if (_browsePopoverOpen) {
      setState(() => _browsePopoverOpen = false);
    }
    final count = _verses.isNotEmpty ? _verses.length : 1;
    _showNumberPicker(
      title: 'Verses',
      count: count,
      active: _selectedVerse ?? 1,
      onTap: _selectVerseFromSheet,
    );
  }

  void _showNumberPicker({
    required String title,
    required int count,
    required int active,
    required ValueChanged<int> onTap,
  }) {
    _showDockSheet(
      title: title,
      child: GridView.count(
        shrinkWrap: true,
        physics: NeverScrollableScrollPhysics(),
        crossAxisCount: 6,
        crossAxisSpacing: MCESpacing.sm,
        mainAxisSpacing: MCESpacing.sm,
        children: List.generate(count, (index) {
          final value = index + 1;
          return _NumberOption(
            value: value,
            active: value == active,
            onTap: () => onTap(value),
          );
        }),
      ),
    );
  }

  void _showDockSheet({required String title, required Widget child}) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: MCEColors.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(MCERadius.lg)),
      ),
      builder: (context) => SafeArea(
        top: false,
        child: ConstrainedBox(
          constraints: BoxConstraints(
            maxHeight: MediaQuery.of(context).size.height * 0.78,
          ),
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(MCESpacing.lg),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(title, style: MCETypography.cardTitle),
                    ),
                    IconButton(
                      onPressed: () => Navigator.of(context).pop(),
                      icon: Icon(Icons.close, size: 20),
                      color: MCEColors.textSecondary,
                    ),
                  ],
                ),
                SizedBox(height: MCESpacing.md),
                child,
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _BibleVerseRow {
  final int verse;
  final String text;

  const _BibleVerseRow({required this.verse, required this.text});
}

class _BibleTranslation {
  final String value;
  final String label;
  final String? language;

  const _BibleTranslation({
    required this.value,
    required this.label,
    this.language,
  });
}

class _ComparePassageDraft {
  final String reference;
  final String translation;

  const _ComparePassageDraft({
    required this.reference,
    required this.translation,
  });

  _ComparePassageDraft copyWith({String? reference, String? translation}) {
    return _ComparePassageDraft(
      reference: reference ?? this.reference,
      translation: translation ?? this.translation,
    );
  }
}

class _BibleHistoryEntry {
  final String reference;
  final String text;

  const _BibleHistoryEntry({required this.reference, required this.text});
}

class _SearchPopoverHeading extends StatelessWidget {
  final String label;
  final Color color;

  const _SearchPopoverHeading({required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        MCESpacing.md,
        MCESpacing.sm,
        MCESpacing.md,
        MCESpacing.xs,
      ),
      child: Text(
        label.toUpperCase(),
        style: MCETypography.tiny.copyWith(color: color),
      ),
    );
  }
}

class _SearchPopoverItem extends StatelessWidget {
  final IconData icon;
  final String label;
  final String? subtitle;
  final Color color;
  final VoidCallback onTap;

  const _SearchPopoverItem({
    required this.icon,
    required this.label,
    required this.color,
    required this.onTap,
    this.subtitle,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: MCESpacing.md,
          vertical: MCESpacing.sm,
        ),
        child: Row(
          children: [
            Icon(icon, size: 16, color: color),
            SizedBox(width: MCESpacing.sm),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: MCETypography.captionBold.copyWith(color: color),
                    overflow: TextOverflow.ellipsis,
                  ),
                  if (subtitle != null && subtitle!.trim().isNotEmpty) ...[
                    SizedBox(height: 2),
                    Text(
                      subtitle!,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: MCETypography.tiny.copyWith(color: color),
                    ),
                  ],
                ],
              ),
            ),
            Icon(Icons.chevron_right, size: 16, color: color),
          ],
        ),
      ),
    );
  }
}

class _SearchPopoverMessage extends StatelessWidget {
  final IconData icon;
  final String message;
  final Color color;

  const _SearchPopoverMessage({
    required this.icon,
    required this.message,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(MCESpacing.lg),
      child: Row(
        children: [
          Icon(icon, size: 18, color: color),
          SizedBox(width: MCESpacing.sm),
          Expanded(
            child: Text(
              message,
              style: MCETypography.caption.copyWith(color: color),
            ),
          ),
        ],
      ),
    );
  }
}

class _DockBox extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  final double? height;

  const _DockBox({
    required this.child,
    this.padding = const EdgeInsets.all(MCESpacing.sm),
    this.height,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      height: height,
      padding: padding,
      decoration: BoxDecoration(
        color: MCEColors.elevated,
        borderRadius: BorderRadius.circular(MCERadius.md),
        border: Border.all(color: MCEColors.border),
      ),
      child: child,
    );
  }
}

class _DockButton extends StatelessWidget {
  final String label;
  final IconData? icon;
  final VoidCallback onTap;
  final double? width;

  const _DockButton({
    required this.label,
    required this.onTap,
    this.icon,
    this.width,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: width,
        height: 36,
        padding: const EdgeInsets.symmetric(horizontal: MCESpacing.sm),
        decoration: BoxDecoration(
          color: MCEColors.surface,
          borderRadius: BorderRadius.circular(MCERadius.sm),
          border: Border.all(color: MCEColors.border),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Flexible(
              child: Text(
                label,
                overflow: TextOverflow.ellipsis,
                style: MCETypography.captionBold,
              ),
            ),
            if (icon != null) ...[
              SizedBox(width: MCESpacing.xs),
              Icon(icon, size: 15, color: MCEColors.textSecondary),
            ],
          ],
        ),
      ),
    );
  }
}

class _DockIconButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;
  final bool active;

  const _DockIconButton({
    required this.icon,
    required this.onTap,
    this.active = false,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 36,
        height: 36,
        decoration: BoxDecoration(
          color: active ? MCEColors.primaryBlue : MCEColors.surface,
          borderRadius: BorderRadius.circular(MCERadius.sm),
          border: Border.all(
            color: active ? MCEColors.primaryBlue : MCEColors.border,
          ),
        ),
        child: Icon(
          icon,
          size: 17,
          color: active ? Colors.white : MCEColors.textSecondary,
        ),
      ),
    );
  }
}

class _DockOverflowButton extends StatelessWidget {
  final bool active;
  final ValueChanged<_BibleToolbarAction> onSelected;

  const _DockOverflowButton({required this.onSelected, this.active = false});

  @override
  Widget build(BuildContext context) {
    final buttonColor = active ? MCEColors.primaryBlue : MCEColors.surface;
    final borderColor = active ? MCEColors.primaryBlue : MCEColors.border;
    return Container(
      width: 36,
      height: 36,
      decoration: BoxDecoration(
        color: buttonColor,
        borderRadius: BorderRadius.circular(MCERadius.sm),
        border: Border.all(color: borderColor),
      ),
      child: PopupMenuButton<_BibleToolbarAction>(
        tooltip: 'More Bible actions',
        padding: EdgeInsets.zero,
        constraints: BoxConstraints(minWidth: 36, minHeight: 36),
        offset: Offset(0, 40),
        color: MCEColors.surface,
        elevation: 8,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(MCERadius.md),
          side: BorderSide(color: MCEColors.border),
        ),
        icon: Icon(
          Icons.more_vert,
          size: 18,
          color: active ? Colors.white : MCEColors.textSecondary,
        ),
        onSelected: onSelected,
        itemBuilder: (_) => [
          _BibleActionMenuItem(
            value: _BibleToolbarAction.browse,
            icon: Icons.menu_book_outlined,
            label: 'Browse Bible',
            active: active,
          ),
          _BibleActionMenuItem(
            value: _BibleToolbarAction.compare,
            icon: Icons.swap_horiz,
            label: 'Compare translations / passages',
            active: active,
          ),
          _BibleActionMenuItem(
            value: _BibleToolbarAction.refresh,
            icon: Icons.refresh,
            label: 'Refresh Bible',
          ),
        ],
      ),
    );
  }
}

class _BibleActionMenuItem extends PopupMenuItem<_BibleToolbarAction> {
  _BibleActionMenuItem({
    required super.value,
    required IconData icon,
    required String label,
    bool active = false,
  }) : super(
         child: Row(
           children: [
             Icon(
               icon,
               size: 18,
               color: active ? MCEColors.primaryBlue : MCEColors.textSecondary,
             ),
             SizedBox(width: MCESpacing.md),
             Expanded(
               child: Text(
                 label,
                 style: MCETypography.body.copyWith(
                   color: MCEColors.textPrimary,
                 ),
               ),
             ),
             if (active)
               Icon(Icons.check, size: 16, color: MCEColors.primaryBlue),
           ],
         ),
       );
}

class _BookTrigger extends StatelessWidget {
  final String book;
  final VoidCallback onTap;

  const _BookTrigger({required this.book, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(MCESpacing.sm),
        decoration: BoxDecoration(
          color: MCEColors.surface,
          borderRadius: BorderRadius.circular(MCERadius.sm),
          border: Border.all(color: MCEColors.border),
        ),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Book', style: MCETypography.tiny),
                  SizedBox(height: 2),
                  Text(book, style: MCETypography.bodyBold),
                ],
              ),
            ),
            Icon(Icons.expand_more, size: 16, color: MCEColors.textSecondary),
          ],
        ),
      ),
    );
  }
}

class _PickerTrigger extends StatelessWidget {
  final String label;
  final String value;
  final VoidCallback onTap;

  const _PickerTrigger({
    required this.label,
    required this.value,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        height: 44,
        padding: const EdgeInsets.symmetric(horizontal: MCESpacing.sm),
        decoration: BoxDecoration(
          color: MCEColors.surface,
          borderRadius: BorderRadius.circular(MCERadius.sm),
          border: Border.all(color: MCEColors.border),
        ),
        child: Row(
          children: [
            Text(label, style: MCETypography.tiny),
            SizedBox(width: MCESpacing.sm),
            Expanded(child: Text(value, style: MCETypography.bodyBold)),
            Icon(Icons.expand_more, size: 15, color: MCEColors.textSecondary),
          ],
        ),
      ),
    );
  }
}

class _ChapterNavButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;
  final bool disabled;

  const _ChapterNavButton({
    required this.icon,
    required this.onTap,
    required this.disabled,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: disabled ? null : onTap,
      child: Opacity(
        opacity: disabled ? 0.35 : 1,
        child: Container(
          width: 24,
          height: 24,
          margin: const EdgeInsets.only(right: MCESpacing.xs),
          decoration: BoxDecoration(
            color: MCEColors.surface,
            borderRadius: BorderRadius.circular(MCERadius.sm),
            border: Border.all(color: MCEColors.border),
          ),
          child: Icon(icon, size: 16, color: MCEColors.textSecondary),
        ),
      ),
    );
  }
}

class _CompareBlock extends StatelessWidget {
  final String translation;
  final String text;

  const _CompareBlock({required this.translation, required this.text});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(MCESpacing.sm),
      decoration: BoxDecoration(
        color: MCEColors.surface,
        borderRadius: BorderRadius.circular(MCERadius.sm),
        border: Border.all(color: MCEColors.borderLight),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            translation,
            style: MCETypography.tiny.copyWith(color: MCEColors.primaryBlue),
          ),
          SizedBox(height: MCESpacing.xs),
          Text(text, style: MCETypography.caption.copyWith(height: 1.35)),
        ],
      ),
    );
  }
}

class _InlineWarning extends StatelessWidget {
  final String message;
  final VoidCallback onClose;

  const _InlineWarning({required this.message, required this.onClose});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(MCESpacing.sm),
      color: MCEColors.warning.withValues(alpha: 0.12),
      child: Row(
        children: [
          Icon(Icons.warning_amber, size: 16, color: MCEColors.warning),
          SizedBox(width: MCESpacing.sm),
          Expanded(child: Text(message, style: MCETypography.caption)),
          GestureDetector(
            onTap: onClose,
            child: Icon(Icons.close, size: 16, color: MCEColors.textSecondary),
          ),
        ],
      ),
    );
  }
}

class _ModeToggle extends StatelessWidget {
  final String value;
  final ValueChanged<String> onChanged;

  const _ModeToggle({required this.value, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(2),
      decoration: BoxDecoration(
        color: MCEColors.elevated,
        borderRadius: BorderRadius.circular(MCERadius.sm),
        border: Border.all(color: MCEColors.border),
      ),
      child: Row(
        children: [
          _ModeChip(
            label: 'Full',
            active: value == 'fullscreen',
            onTap: () => onChanged('fullscreen'),
          ),
          _ModeChip(
            label: 'LT',
            active: value == 'lower-third',
            onTap: () => onChanged('lower-third'),
          ),
        ],
      ),
    );
  }
}

class _BottomActionButton extends StatelessWidget {
  final String label;
  final IconData icon;
  final Color color;
  final Color foreground;
  final VoidCallback? onTap;

  const _BottomActionButton({
    required this.label,
    required this.icon,
    required this.color,
    required this.foreground,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Opacity(
        opacity: onTap == null ? 0.45 : 1,
        child: Container(
          height: 44,
          alignment: Alignment.center,
          padding: const EdgeInsets.symmetric(horizontal: MCESpacing.sm),
          decoration: BoxDecoration(
            color: color,
            borderRadius: BorderRadius.circular(MCERadius.md),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 16, color: foreground),
              SizedBox(width: MCESpacing.sm),
              Flexible(
                child: Text(
                  label,
                  overflow: TextOverflow.ellipsis,
                  style: MCETypography.bodyBold.copyWith(color: foreground),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ModeChip extends StatelessWidget {
  final String label;
  final bool active;
  final VoidCallback onTap;

  const _ModeChip({
    required this.label,
    required this.active,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 44,
        height: 32,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: active ? MCEColors.primaryBlue : Colors.transparent,
          borderRadius: BorderRadius.circular(MCERadius.sm),
        ),
        child: Text(
          label,
          style: MCETypography.captionBold.copyWith(
            color: active ? Colors.white : MCEColors.textSecondary,
          ),
        ),
      ),
    );
  }
}

class _SheetOption extends StatelessWidget {
  final String title;
  final String subtitle;
  final bool active;
  final VoidCallback onTap;
  final IconData? leading;

  const _SheetOption({
    required this.title,
    required this.subtitle,
    required this.active,
    required this.onTap,
    this.leading,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(bottom: MCESpacing.sm),
        padding: const EdgeInsets.all(MCESpacing.md),
        decoration: BoxDecoration(
          color: active ? MCEColors.primaryBg : MCEColors.elevated,
          borderRadius: BorderRadius.circular(MCERadius.md),
          border: Border.all(
            color: active ? MCEColors.primaryBlue : MCEColors.border,
          ),
        ),
        child: Row(
          children: [
            if (leading != null) ...[
              Icon(leading, size: 18, color: MCEColors.primaryBlue),
              SizedBox(width: MCESpacing.sm),
            ],
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: MCETypography.bodyBold),
                  SizedBox(height: 2),
                  Text(
                    subtitle,
                    style: MCETypography.caption,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
            if (active)
              Icon(Icons.check, size: 18, color: MCEColors.primaryBlue),
          ],
        ),
      ),
    );
  }
}

class _SwitchRow extends StatelessWidget {
  final String title;
  final bool value;
  final ValueChanged<bool> onChanged;

  const _SwitchRow({
    required this.title,
    required this.value,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(child: Text(title, style: MCETypography.bodyBold)),
        Switch(
          value: value,
          onChanged: onChanged,
          activeThumbColor: MCEColors.primaryBlue,
        ),
      ],
    );
  }
}

class _SheetSelect extends StatelessWidget {
  final String label;
  final String value;
  final VoidCallback onTap;

  const _SheetSelect({
    required this.label,
    required this.value,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: _DockBox(
        child: Row(
          children: [
            Text(label, style: MCETypography.captionBold),
            Spacer(),
            Text(value, style: MCETypography.bodyBold),
            SizedBox(width: MCESpacing.sm),
            Icon(Icons.swap_vert, size: 16, color: MCEColors.textSecondary),
          ],
        ),
      ),
    );
  }
}

class _TranslationChooser extends StatelessWidget {
  final String label;
  final String value;
  final List<_BibleTranslation> translations;
  final ValueChanged<String> onChanged;

  const _TranslationChooser({
    required this.label,
    required this.value,
    required this.translations,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return DropdownButtonFormField<String>(
      initialValue: value,
      dropdownColor: MCEColors.elevated,
      decoration: InputDecoration(
        labelText: label,
        labelStyle: MCETypography.caption,
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(MCERadius.md),
          borderSide: BorderSide(color: MCEColors.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(MCERadius.md),
          borderSide: BorderSide(color: MCEColors.primaryBlue),
        ),
      ),
      items: translations
          .map(
            (item) => DropdownMenuItem(
              value: item.value,
              child: Text(item.value, style: MCETypography.body),
            ),
          )
          .toList(),
      onChanged: (value) {
        if (value != null) onChanged(value);
      },
    );
  }
}

class _BookOption extends StatelessWidget {
  final String book;
  final bool active;
  final VoidCallback onTap;

  const _BookOption({
    required this.book,
    required this.active,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(MCESpacing.sm),
        decoration: BoxDecoration(
          color: active ? MCEColors.primaryBg : MCEColors.elevated,
          borderRadius: BorderRadius.circular(MCERadius.md),
          border: Border.all(
            color: active ? MCEColors.primaryBlue : MCEColors.border,
          ),
        ),
        child: Row(
          children: [
            SizedBox(
              width: 44,
              child: Text(
                _bookAbbr[book] ?? book.substring(0, book.length.clamp(0, 4)),
                style: MCETypography.tiny.copyWith(
                  color: MCEColors.primaryBlue,
                ),
              ),
            ),
            Expanded(
              child: Text(
                book,
                style: MCETypography.captionBold,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _NumberOption extends StatelessWidget {
  final int value;
  final bool active;
  final VoidCallback onTap;

  const _NumberOption({
    required this.value,
    required this.active,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: active ? MCEColors.primaryBlue : MCEColors.elevated,
          borderRadius: BorderRadius.circular(MCERadius.sm),
          border: Border.all(
            color: active ? MCEColors.primaryBlue : MCEColors.border,
          ),
        ),
        child: Text(
          '$value',
          style: MCETypography.captionBold.copyWith(
            color: active ? Colors.white : MCEColors.textPrimary,
          ),
        ),
      ),
    );
  }
}
