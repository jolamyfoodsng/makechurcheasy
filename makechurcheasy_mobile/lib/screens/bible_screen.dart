/// Bible screen — single unified view mirroring the Desktop Bible Dock.
///
/// Layout: Search Bar → Translation Chips → Book/Chapter/Verse Picker →
///         Verse Reading (always visible) → Present Toolbar → History.
///
/// Content area is NEVER empty: defaults to current-reading from Desktop.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/bible_models.dart';
import '../providers/bible_providers.dart';
import '../providers/connection_provider.dart';
import '../services/bible_search_parser.dart' as parser;
import '../services/websocket_service.dart';
import '../theme/app_theme.dart';

class BibleScreen extends ConsumerStatefulWidget {
  const BibleScreen({super.key});

  @override
  ConsumerState<BibleScreen> createState() => _BibleScreenState();
}

class _BibleScreenState extends ConsumerState<BibleScreen> {
  final _searchController = TextEditingController();
  final _scrollController = ScrollController();
  final _focusNode = FocusNode();

  bool _showSearchDropdown = false;
  bool _showHistory = false;

  @override
  void dispose() {
    _searchController.dispose();
    _scrollController.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  // ── OBS commands ──────────────────────────────────────────────────────

  void _pushToObs(String reference, String text) {
    ref.read(wsServiceProvider.notifier).showScripture(reference, text);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('Sent "$reference" to OBS'),
        behavior: SnackBarBehavior.floating,
        duration: const Duration(seconds: 2),
      ),
    );
    // Add to history
    ref.read(historyProvider.notifier).add(reference);
  }

  void _clearObs() {
    ref.read(wsServiceProvider.notifier).clearScripture();
  }

  // ── Search ────────────────────────────────────────────────────────────

  void _onSearchChanged(String value) {
    setState(() => _showSearchDropdown = value.trim().isNotEmpty);
    ref.read(bibleProvider.notifier).onSearchChanged(value);
  }

  void _onSearchSubmitted(String value) {
    ref.read(bibleProvider.notifier).onSearchSubmitted(value);
    _focusNode.unfocus();
  }

  void _clearSearch() {
    _searchController.clear();
    setState(() => _showSearchDropdown = false);
    // Return to chapter reading
    final state = ref.read(bibleProvider);
    if (state.currentBook != null && state.currentChapter != null) {
      ref.read(bibleProvider.notifier).onSearchChanged('');
    }
  }

  void _pickSearchResult(parser.BibleSearchResult result) {
    setState(() => _showSearchDropdown = false);
    _searchController.clear();
    _focusNode.unfocus();
    ref.read(bibleProvider.notifier).onSearchSubmitted(
        '${result.book} ${result.chapter ?? ""}:${result.verse ?? ""}');
  }

  void _pickKeywordResult(BibleServerSearchResult result) {
    setState(() => _showSearchDropdown = false);
    _searchController.clear();
    _focusNode.unfocus();
    ref.read(bibleProvider.notifier).loadChapter(result.book, result.chapter);
  }

  // ── Book / Chapter / Verse navigation ─────────────────────────────────

  void _pickBook() {
    final state = ref.read(bibleProvider);
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => _BookPickerSheet(
        currentBook: state.currentBook,
        onSelect: (book, chapters) {
          Navigator.pop(ctx);
          // Load chapter 1 of the selected book
          ref.read(bibleProvider.notifier).loadChapter(book, 1);
        },
      ),
    );
  }

  void _pickChapter() {
    final state = ref.read(bibleProvider);
    if (state.currentBook == null) return;
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => _ChapterPickerSheet(
        book: state.currentBook!,
        currentChapter: state.currentChapter,
        onSelect: (chapter) {
          Navigator.pop(ctx);
          ref.read(bibleProvider.notifier).loadChapter(state.currentBook!, chapter);
        },
      ),
    );
  }

  void _navigateVerse(int delta) {
    final state = ref.read(bibleProvider);
    if (state.currentBook == null || state.currentChapter == null) return;
    final current = state.selectedVerse ?? 1;
    final next = current + delta;
    if (next < 1 || next > state.passages.length) return;
    ref.read(bibleProvider.notifier).selectVerse(next);
  }

  // ── Present ───────────────────────────────────────────────────────────

  void _stageSelectedVerse() {
    final state = ref.read(bibleProvider);
    if (state.currentBook == null ||
        state.currentChapter == null ||
        state.selectedVerse == null) {
      return;
    }
    final verse = state.passages.firstWhere(
      (v) => v.verse == state.selectedVerse,
      orElse: () => const BibleVerse(verse: 0, text: ''),
    );
    if (verse.text.isEmpty) {
      return;
    }
    final ref2 =
        '${state.currentBook} ${state.currentChapter}:${state.selectedVerse}';
    _pushToObs(ref2, verse.text);
  }

  void _stageCurrentVerse(int verseNum) {
    final state = ref.read(bibleProvider);
    if (state.currentBook == null || state.currentChapter == null) return;
    final verse = state.passages.firstWhere(
      (v) => v.verse == verseNum,
      orElse: () => const BibleVerse(verse: 0, text: ''),
    );
    if (verse.text.isEmpty) return;
    final ref2 = '${state.currentBook} ${state.currentChapter}:$verseNum';
    _pushToObs(ref2, verse.text);
  }

  // ── Build ─────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final conn = ref.watch(connectionProvider);
    final isConnected = conn.serverUrl != null;
    final state = ref.watch(bibleProvider);
    final translationsAsync = ref.watch(translationsProvider);
    final favorites = ref.watch(favoritesProvider);

    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      body: !isConnected
          ? _buildNotConnected(context)
          : Column(
              children: [
                _buildSearchBar(context, state),
                _buildTranslationChips(context, state, translationsAsync),
                _buildBookChapterBar(context, state),
                Expanded(
                  child: state.mode == BibleScreenMode.searchResults
                      ? _buildSearchResults(context, state)
                      : _buildReadingView(context, state, favorites),
                ),
                _buildPresentToolbar(context, state),
              ],
            ),
    );
  }

  // ── Not Connected ────────────────────────────────────────────────────

  Widget _buildNotConnected(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.cloud_off, size: 64, color: AppTheme.textMuted),
            const SizedBox(height: 16),
            Text('Not Connected',
                style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            Text(
              'Connect to a MakeChurchEasy Desktop server to browse the Bible.',
              textAlign: TextAlign.center,
              style: TextStyle(color: AppTheme.textSecondary),
            ),
          ],
        ),
      ),
    );
  }

  // ── Search Bar ────────────────────────────────────────────────────────

  Widget _buildSearchBar(BuildContext context, BibleScreenState state) {
    final refResults = state.referenceResults;
    final keyResults = state.keywordResults;
    final hasResults = refResults.isNotEmpty || keyResults.isNotEmpty;
    final showDropdown = _showSearchDropdown && state.lastSearchQuery.isNotEmpty;

    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          TextField(
            controller: _searchController,
            focusNode: _focusNode,
            decoration: InputDecoration(
              hintText: 'Search "john 3", "genesis 1:1", "faith"...',
              prefixIcon: const Icon(Icons.search, size: 20),
              suffixIcon: _searchController.text.isNotEmpty
                  ? IconButton(
                      icon: const Icon(Icons.close, size: 18),
                      onPressed: _clearSearch,
                    )
                  : null,
              isDense: true,
              contentPadding:
                  const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            ),
            onChanged: _onSearchChanged,
            onSubmitted: _onSearchSubmitted,
            onTap: () {
              if (_searchController.text.trim().isNotEmpty) {
                setState(() => _showSearchDropdown = true);
              }
            },
          ),
          if (state.isSearching)
            const Padding(
              padding: EdgeInsets.only(top: 4),
              child: LinearProgressIndicator(minHeight: 2),
            ),
          if (showDropdown && hasResults)
            _buildSearchDropdown(context, state, refResults, keyResults),
          if (showDropdown && !hasResults && !state.isSearching)
            _buildSearchEmpty(context, state),
        ],
      ),
    );
  }

  Widget _buildSearchDropdown(
    BuildContext context,
    BibleScreenState state,
    List<parser.BibleSearchResult> refResults,
    List<BibleServerSearchResult> keyResults,
  ) {
    return Container(
      margin: const EdgeInsets.only(top: 4),
      constraints: const BoxConstraints(maxHeight: 260),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: Theme.of(context).colorScheme.outline.withAlpha(50),
        ),
      ),
      child: ListView(
        shrinkWrap: true,
        padding: const EdgeInsets.symmetric(vertical: 4),
        children: [
          if (refResults.isNotEmpty) ...[
            _buildDropdownSectionHeader('References'),
            ...refResults.take(8).map((r) => _buildRefResultTile(r)),
          ],
          if (keyResults.isNotEmpty) ...[
            if (refResults.isNotEmpty)
              Divider(
                  height: 1,
                  color:
                      Theme.of(context).colorScheme.outline.withAlpha(30)),
            _buildDropdownSectionHeader('Keyword Matches'),
            ...keyResults.take(10).map((r) => _buildKeywordResultTile(r)),
          ],
        ],
      ),
    );
  }

  Widget _buildDropdownSectionHeader(String label) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 2),
      child: Text(
        label.toUpperCase(),
        style: TextStyle(
          fontSize: 10,
          fontWeight: FontWeight.w600,
          color: AppTheme.textMuted,
          letterSpacing: 0.8,
        ),
      ),
    );
  }

  Widget _buildRefResultTile(parser.BibleSearchResult r) {
    return ListTile(
      dense: true,
      leading: Icon(
        r.chapter != null ? Icons.menu_book : Icons.book,
        size: 18,
        color: AppTheme.primaryBlue,
      ),
      title: Text(r.label, style: const TextStyle(fontSize: 14)),
      onTap: () => _pickSearchResult(r),
    );
  }

  Widget _buildKeywordResultTile(BibleServerSearchResult r) {
    return ListTile(
      dense: true,
      leading: const Icon(Icons.format_quote, size: 18, color: AppTheme.textMuted),
      title: Text(
        r.reference,
        style: TextStyle(
            fontSize: 13, fontWeight: FontWeight.w500, color: AppTheme.primaryBlue),
      ),
      subtitle: Text(
        r.text,
        maxLines: 2,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(fontSize: 12, color: AppTheme.textSecondary),
      ),
      onTap: () => _pickKeywordResult(r),
    );
  }

  Widget _buildSearchEmpty(BuildContext context, BibleScreenState state) {
    return Container(
      margin: const EdgeInsets.only(top: 4),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Center(
        child: Text(
          'No results for "${state.lastSearchQuery}"',
          style: TextStyle(color: AppTheme.textMuted, fontSize: 13),
        ),
      ),
    );
  }

  // ── Translation Chips ─────────────────────────────────────────────────

  Widget _buildTranslationChips(
    BuildContext context,
    BibleScreenState state,
    AsyncValue<List<BibleTranslation>> translationsAsync,
  ) {
    return translationsAsync.when(
      data: (translations) {
        if (translations.isEmpty) return const SizedBox.shrink();
        return SizedBox(
          height: 40,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            itemCount: translations.length,
            separatorBuilder: (context, index) => const SizedBox(width: 6),
            itemBuilder: (context, i) {
              final t = translations[i];
              final selected =
                  t.abbr.toUpperCase() == state.currentTranslation.toUpperCase();
              return ChoiceChip(
                label: Text(t.abbr, style: const TextStyle(fontSize: 12)),
                selected: selected,
                onSelected: (_) {
                  ref.read(bibleProvider.notifier).setTranslation(t.abbr);
                },
                visualDensity: VisualDensity.compact,
              );
            },
          ),
        );
      },
      loading: () => const SizedBox.shrink(),
      error: (_, _) => const SizedBox.shrink(),
    );
  }

  // ── Book / Chapter / Verse bar ────────────────────────────────────────

  Widget _buildBookChapterBar(BuildContext context, BibleScreenState state) {
    final book = state.currentBook;
    final chapter = state.currentChapter;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      color: Theme.of(context).colorScheme.surfaceContainerHighest,
      child: Row(
        children: [
          // Book button
          Expanded(
            child: InkWell(
              onTap: _pickBook,
              borderRadius: BorderRadius.circular(8),
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(
                  border: Border.all(
                      color: Theme.of(context).colorScheme.outline.withAlpha(80)),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  children: [
                    Icon(Icons.menu_book,
                        size: 16, color: AppTheme.textSecondary),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        book ?? 'Pick Book',
                        style: TextStyle(
                          color: book != null
                              ? AppTheme.textPrimary
                              : AppTheme.textMuted,
                          fontWeight: FontWeight.w500,
                          fontSize: 13,
                        ),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    Icon(Icons.arrow_drop_down,
                        color: AppTheme.textMuted, size: 18),
                  ],
                ),
              ),
            ),
          ),
          const SizedBox(width: 8),
          // Chapter button
          InkWell(
            onTap: book != null ? _pickChapter : null,
            borderRadius: BorderRadius.circular(8),
            child: Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                border: Border.all(
                    color: Theme.of(context).colorScheme.outline.withAlpha(80)),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    chapter != null ? 'Ch $chapter' : 'Ch ?',
                    style: TextStyle(
                      color: chapter != null
                          ? AppTheme.textPrimary
                          : AppTheme.textMuted,
                      fontWeight: FontWeight.w500,
                      fontSize: 13,
                    ),
                  ),
                  Icon(Icons.arrow_drop_down,
                      color: AppTheme.textMuted, size: 18),
                ],
              ),
            ),
          ),
          const SizedBox(width: 8),
          // Verse prev/next
          if (state.selectedVerse != null) ...[
            IconButton(
              icon: const Icon(Icons.keyboard_arrow_up, size: 20),
              onPressed: () => _navigateVerse(-1),
              visualDensity: VisualDensity.compact,
              padding: EdgeInsets.zero,
              constraints: const BoxConstraints(minWidth: 28, minHeight: 28),
            ),
            Container(
              constraints: const BoxConstraints(minWidth: 28),
              alignment: Alignment.center,
              child: Text(
                '${state.selectedVerse}',
                style: TextStyle(
                  color: AppTheme.primaryBlue,
                  fontWeight: FontWeight.bold,
                  fontSize: 13,
                ),
              ),
            ),
            IconButton(
              icon: const Icon(Icons.keyboard_arrow_down, size: 20),
              onPressed: () => _navigateVerse(1),
              visualDensity: VisualDensity.compact,
              padding: EdgeInsets.zero,
              constraints: const BoxConstraints(minWidth: 28, minHeight: 28),
            ),
          ],
        ],
      ),
    );
  }

  // ── Reading View (chapter verses) ─────────────────────────────────────

  Widget _buildReadingView(
    BuildContext context,
    BibleScreenState state,
    List<String> favorites,
  ) {
    if (state.isLoadingChapter && state.passages.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const CircularProgressIndicator(),
            const SizedBox(height: 12),
            Text(
              'Loading ${state.currentBook ?? ""} ${state.currentChapter ?? ""}...',
              style: TextStyle(color: AppTheme.textMuted),
            ),
          ],
        ),
      );
    }

    if (state.passages.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.menu_book, size: 48, color: AppTheme.textMuted),
              const SizedBox(height: 12),
              Text(
                'Pick a book or search to start reading',
                style: TextStyle(color: AppTheme.textMuted),
              ),
              const SizedBox(height: 16),
              ElevatedButton.icon(
                onPressed: _pickBook,
                icon: const Icon(Icons.menu_book, size: 18),
                label: const Text('Browse Books'),
              ),
            ],
          ),
        ),
      );
    }

    return Column(
      children: [
        // Chapter header
        if (state.currentBook != null && state.currentChapter != null)
          _buildChapterHeader(context, state, favorites),

        // Verse list
        Expanded(
          child: ListView.builder(
            controller: _scrollController,
            padding: const EdgeInsets.only(bottom: 80),
            itemCount: state.passages.length,
            itemBuilder: (context, index) {
              final verse = state.passages[index];
              final isSelected = state.selectedVerse == verse.verse;
              final ref2 =
                  '${state.currentBook} ${state.currentChapter}:${verse.verse}';
              final isFav = favorites.contains(ref2);

              return _buildVerseRow(
                context,
                verse,
                isSelected,
                isFav,
                ref2,
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _buildChapterHeader(
    BuildContext context,
    BibleScreenState state,
    List<String> favorites,
  ) {
    final ref2 =
        '${state.currentBook} ${state.currentChapter}:1-${state.passages.length}';
    final isFav = favorites.contains(ref2);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        children: [
          Text(
            '${state.currentBook} ${state.currentChapter}',
            style: Theme.of(context).textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.bold,
                ),
          ),
          const SizedBox(width: 8),
          Text(
            '${state.passages.length} verses',
            style: TextStyle(color: AppTheme.textMuted, fontSize: 12),
          ),
          const Spacer(),
          // Favorite toggle
          IconButton(
            icon: Icon(
              isFav ? Icons.star : Icons.star_border,
              size: 18,
              color: isFav ? Colors.amber : AppTheme.textMuted,
            ),
            visualDensity: VisualDensity.compact,
            onPressed: () {
              ref.read(favoritesProvider.notifier).toggle(ref2);
            },
          ),
        ],
      ),
    );
  }

  Widget _buildVerseRow(
    BuildContext context,
    BibleVerse verse,
    bool isSelected,
    bool isFav,
    String reference,
  ) {
    return InkWell(
      onTap: () {
        ref.read(bibleProvider.notifier).selectVerse(verse.verse);
      },
      onLongPress: () => _stageCurrentVerse(verse.verse),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        decoration: isSelected
            ? BoxDecoration(
                color: AppTheme.primaryBlue.withAlpha(20),
                border: Border(
                  left: BorderSide(color: AppTheme.primaryBlue, width: 3),
                ),
              )
            : null,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Verse number
            SizedBox(
              width: 28,
              child: Text(
                '${verse.verse}',
                style: TextStyle(
                  color: isSelected ? AppTheme.primaryBlue : AppTheme.textMuted,
                  fontWeight:
                      isSelected ? FontWeight.bold : FontWeight.normal,
                  fontSize: 12,
                ),
              ),
            ),
            const SizedBox(width: 4),
            // Verse text
            Expanded(
              child: Text(
                verse.text,
                style: TextStyle(
                  fontSize: 14,
                  height: 1.5,
                  color: isSelected
                      ? AppTheme.textPrimary
                      : AppTheme.textSecondary,
                ),
              ),
            ),
            // Favorite star
            if (isFav)
              Padding(
                padding: const EdgeInsets.only(left: 4, top: 2),
                child:
                    Icon(Icons.star, size: 12, color: Colors.amber[600]),
              ),
          ],
        ),
      ),
    );
  }

  // ── Search Results ────────────────────────────────────────────────────

  Widget _buildSearchResults(BuildContext context, BibleScreenState state) {
    final refResults = state.referenceResults;
    final keyResults = state.keywordResults;
    final hasAny = refResults.isNotEmpty || keyResults.isNotEmpty;

    if (!hasAny && !state.isSearching) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.search_off, size: 48, color: AppTheme.textMuted),
            const SizedBox(height: 12),
            Text(
              'No results for "${state.lastSearchQuery}"',
              style: TextStyle(color: AppTheme.textMuted),
            ),
          ],
        ),
      );
    }

    if (state.isSearching && !hasAny) {
      return const Center(child: CircularProgressIndicator());
    }

    return ListView(
      padding: const EdgeInsets.only(bottom: 80),
      children: [
        if (refResults.isNotEmpty) ...[
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
            child: Text(
              'REFERENCES',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: AppTheme.textMuted,
                letterSpacing: 0.8,
              ),
            ),
          ),
          ...refResults.map((r) {
            return ListTile(
              leading:
                  Icon(Icons.menu_book, size: 18, color: AppTheme.primaryBlue),
              title: Text(r.label, style: const TextStyle(fontSize: 14)),
              onTap: () {
                if (r.chapter != null) {
                  ref
                      .read(bibleProvider.notifier)
                      .loadChapter(r.book, r.chapter!);
                  if (r.verse != null) {
                    ref.read(bibleProvider.notifier).selectVerse(r.verse!);
                  }
                }
              },
            );
          }),
        ],
        if (keyResults.isNotEmpty) ...[
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
            child: Text(
              'KEYWORD MATCHES',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: AppTheme.textMuted,
                letterSpacing: 0.8,
              ),
            ),
          ),
          ...keyResults.map((r) => ListTile(
                leading: const Icon(Icons.format_quote,
                    size: 18, color: AppTheme.textMuted),
                title: Text(
                  r.reference,
                  style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w500,
                      color: AppTheme.primaryBlue),
                ),
                subtitle: Text(
                  r.text,
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                  style:
                      TextStyle(fontSize: 12, color: AppTheme.textSecondary),
                ),
                onTap: () {
                  ref
                      .read(bibleProvider.notifier)
                      .loadChapter(r.book, r.chapter);
                  ref.read(bibleProvider.notifier).selectVerse(r.verse);
                },
              )),
        ],
      ],
    );
  }

  // ── Present Toolbar ───────────────────────────────────────────────────

  Widget _buildPresentToolbar(BuildContext context, BibleScreenState state) {
    final hasSelection = state.selectedVerse != null && state.passages.isNotEmpty;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        border: Border(
          top: BorderSide(
            color: Theme.of(context).colorScheme.outline.withAlpha(50),
          ),
        ),
      ),
      child: SafeArea(
        top: false,
        child: Row(
          children: [
            // History toggle
            IconButton(
              icon: Icon(
                _showHistory ? Icons.history : Icons.history,
                size: 20,
                color: _showHistory ? AppTheme.primaryBlue : AppTheme.textMuted,
              ),
              visualDensity: VisualDensity.compact,
              onPressed: () => setState(() => _showHistory = !_showHistory),
              tooltip: 'History',
            ),
            const SizedBox(width: 4),

            // Push selected verse
            Expanded(
              child: ElevatedButton.icon(
                onPressed: hasSelection ? _stageSelectedVerse : null,
                icon: const Icon(Icons.cast, size: 16),
                label: Text(
                  hasSelection
                      ? 'Push ${state.currentBook} ${state.currentChapter}:${state.selectedVerse}'
                      : 'Select a verse',
                  style: const TextStyle(fontSize: 12),
                  overflow: TextOverflow.ellipsis,
                ),
                style: ElevatedButton.styleFrom(
                  visualDensity: VisualDensity.compact,
                ),
              ),
            ),
            const SizedBox(width: 8),

            // Clear OBS
            IconButton(
              icon: const Icon(Icons.clear, size: 20),
              visualDensity: VisualDensity.compact,
              onPressed: _clearObs,
              tooltip: 'Clear from screen',
            ),
          ],
        ),
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Book Picker Sheet
// ═══════════════════════════════════════════════════════════════════════════

class _BookPickerSheet extends StatelessWidget {
  const _BookPickerSheet({
    required this.currentBook,
    required this.onSelect,
  });

  final String? currentBook;
  final void Function(String book, int chapters) onSelect;

  static const _bookChapters = {
    'Genesis': 50, 'Exodus': 40, 'Leviticus': 27, 'Numbers': 36,
    'Deuteronomy': 34, 'Joshua': 24, 'Judges': 21, 'Ruth': 4,
    '1 Samuel': 31, '2 Samuel': 24, '1 Kings': 22, '2 Kings': 25,
    '1 Chronicles': 29, '2 Chronicles': 36, 'Ezra': 10, 'Nehemiah': 13,
    'Esther': 10, 'Job': 42, 'Psalms': 150, 'Proverbs': 31,
    'Ecclesiastes': 12, 'Song of Solomon': 8, 'Isaiah': 66,
    'Jeremiah': 52, 'Lamentations': 5, 'Ezekiel': 48, 'Daniel': 12,
    'Hosea': 14, 'Joel': 3, 'Amos': 9, 'Obadiah': 1, 'Jonah': 4,
    'Micah': 7, 'Nahum': 3, 'Habakkuk': 3, 'Zephaniah': 3,
    'Haggai': 2, 'Zechariah': 14, 'Malachi': 4,
    'Matthew': 28, 'Mark': 16, 'Luke': 24, 'John': 21,
    'Acts': 28, 'Romans': 16, '1 Corinthians': 16, '2 Corinthians': 13,
    'Galatians': 6, 'Ephesians': 6, 'Philippians': 4, 'Colossians': 4,
    '1 Thessalonians': 5, '2 Thessalonians': 3, '1 Timothy': 6,
    '2 Timothy': 4, 'Titus': 3, 'Philemon': 1, 'Hebrews': 13,
    'James': 5, '1 Peter': 5, '2 Peter': 3, '1 John': 5,
    '2 John': 1, '3 John': 1, 'Jude': 1, 'Revelation': 22,
  };

  static final _otBooks = [
    'Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy',
    'Joshua', 'Judges', 'Ruth', '1 Samuel', '2 Samuel',
    '1 Kings', '2 Kings', '1 Chronicles', '2 Chronicles',
    'Ezra', 'Nehemiah', 'Esther', 'Job', 'Psalms', 'Proverbs',
    'Ecclesiastes', 'Song of Solomon', 'Isaiah', 'Jeremiah',
    'Lamentations', 'Ezekiel', 'Daniel', 'Hosea', 'Joel', 'Amos',
    'Obadiah', 'Jonah', 'Micah', 'Nahum', 'Habakkuk', 'Zephaniah',
    'Haggai', 'Zechariah', 'Malachi',
  ];

  static final _ntBooks = [
    'Matthew', 'Mark', 'Luke', 'John', 'Acts', 'Romans',
    '1 Corinthians', '2 Corinthians', 'Galatians', 'Ephesians',
    'Philippians', 'Colossians', '1 Thessalonians', '2 Thessalonians',
    '1 Timothy', '2 Timothy', 'Titus', 'Philemon', 'Hebrews',
    'James', '1 Peter', '2 Peter', '1 John', '2 John', '3 John',
    'Jude', 'Revelation',
  ];

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.7,
      minChildSize: 0.3,
      maxChildSize: 0.9,
      expand: false,
      builder: (ctx, scrollCtrl) => Column(
        children: [
          Center(
            child: Container(
              margin: const EdgeInsets.only(top: 12),
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: AppTheme.textMuted,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 12),
            child: Text('Select Book',
                style: Theme.of(context).textTheme.titleMedium),
          ),
          Expanded(
            child: ListView(
              controller: scrollCtrl,
              children: [
                _buildSection('Old Testament', _otBooks),
                _buildSection('New Testament', _ntBooks),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSection(String label, List<String> books) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
          child: Text(
            label,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: AppTheme.textMuted,
              letterSpacing: 0.8,
            ),
          ),
        ),
        ...books.map((book) {
          final ch = _bookChapters[book] ?? 1;
          final selected = book == currentBook;
          return ListTile(
            dense: true,
            title: Text(book, style: const TextStyle(fontSize: 14)),
            subtitle: Text('$ch chapters',
                style: TextStyle(fontSize: 11, color: AppTheme.textMuted)),
            selected: selected,
            selectedTileColor: AppTheme.primaryBlue.withAlpha(20),
            onTap: () => onSelect(book, ch),
          );
        }),
      ],
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Chapter Picker Sheet
// ═══════════════════════════════════════════════════════════════════════════

class _ChapterPickerSheet extends StatelessWidget {
  const _ChapterPickerSheet({
    required this.book,
    required this.currentChapter,
    required this.onSelect,
  });

  final String book;
  final int? currentChapter;
  final void Function(int chapter) onSelect;

  static const _bookChapters = {
    'Genesis': 50, 'Exodus': 40, 'Leviticus': 27, 'Numbers': 36,
    'Deuteronomy': 34, 'Joshua': 24, 'Judges': 21, 'Ruth': 4,
    '1 Samuel': 31, '2 Samuel': 24, '1 Kings': 22, '2 Kings': 25,
    '1 Chronicles': 29, '2 Chronicles': 36, 'Ezra': 10, 'Nehemiah': 13,
    'Esther': 10, 'Job': 42, 'Psalms': 150, 'Proverbs': 31,
    'Ecclesiastes': 12, 'Song of Solomon': 8, 'Isaiah': 66,
    'Jeremiah': 52, 'Lamentations': 5, 'Ezekiel': 48, 'Daniel': 12,
    'Hosea': 14, 'Joel': 3, 'Amos': 9, 'Obadiah': 1, 'Jonah': 4,
    'Micah': 7, 'Nahum': 3, 'Habakkuk': 3, 'Zephaniah': 3,
    'Haggai': 2, 'Zechariah': 14, 'Malachi': 4,
    'Matthew': 28, 'Mark': 16, 'Luke': 24, 'John': 21,
    'Acts': 28, 'Romans': 16, '1 Corinthians': 16, '2 Corinthians': 13,
    'Galatians': 6, 'Ephesians': 6, 'Philippians': 4, 'Colossians': 4,
    '1 Thessalonians': 5, '2 Thessalonians': 3, '1 Timothy': 6,
    '2 Timothy': 4, 'Titus': 3, 'Philemon': 1, 'Hebrews': 13,
    'James': 5, '1 Peter': 5, '2 Peter': 3, '1 John': 5,
    '2 John': 1, '3 John': 1, 'Jude': 1, 'Revelation': 22,
  };

  @override
  Widget build(BuildContext context) {
    final chapterCount = _bookChapters[book] ?? 30;

    return DraggableScrollableSheet(
      initialChildSize: 0.5,
      minChildSize: 0.2,
      maxChildSize: 0.8,
      expand: false,
      builder: (ctx, scrollCtrl) => Column(
        children: [
          Center(
            child: Container(
              margin: const EdgeInsets.only(top: 12),
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: AppTheme.textMuted,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 12),
            child: Text(
              '$book — Chapters',
              style: Theme.of(context).textTheme.titleMedium,
            ),
          ),
          Expanded(
            child: GridView.builder(
              controller: scrollCtrl,
              padding: const EdgeInsets.all(16),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 5,
                mainAxisSpacing: 8,
                crossAxisSpacing: 8,
                childAspectRatio: 1.4,
              ),
              itemCount: chapterCount,
              itemBuilder: (context, index) {
                final ch = index + 1;
                final isCurrent = ch == currentChapter;
                return InkWell(
                  onTap: () => onSelect(ch),
                  borderRadius: BorderRadius.circular(8),
                  child: Container(
                    decoration: BoxDecoration(
                      color: isCurrent
                          ? AppTheme.primaryBlue.withAlpha(30)
                          : null,
                      border: Border.all(
                        color: isCurrent
                            ? AppTheme.primaryBlue
                            : Theme.of(context)
                                .colorScheme
                                .outline
                                .withAlpha(80),
                        width: isCurrent ? 1.5 : 1,
                      ),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    alignment: Alignment.center,
                    child: Text(
                      '$ch',
                      style: TextStyle(
                        fontWeight: FontWeight.w500,
                        color: isCurrent
                            ? AppTheme.primaryBlue
                            : AppTheme.textPrimary,
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
