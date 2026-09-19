import 'dart:async';

import 'package:flutter/material.dart';

import '../models/dock_models.dart';
import '../services/mce_provider.dart';
import '../services/websocket_service.dart';
import '../theme/mce_theme.dart';

class WorshipScreen extends StatefulWidget {
  const WorshipScreen({super.key});

  @override
  State<WorshipScreen> createState() => _WorshipScreenState();
}

class _WorshipScreenState extends State<WorshipScreen> {
  final _searchController = TextEditingController();
  String _searchQuery = '';
  int _textSubTab = 0;
  bool _loading = true;
  bool _loadingNotes = true;
  String? _error;
  String? _notesError;
  List<DockSong> _songs = const [];
  List<Map<String, dynamic>> _notes = const [];
  DockSong? _performingSong;
  int _currentSlideIndex = 0;
  String _outputMode = 'fullscreen';
  bool _sending = false;
  StreamSubscription<WebSocketEvent>? _webSocketSub;
  bool _loadedAfterAuthentication = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _webSocketSub = context.webSocketService.events.listen((event) {
        if (!mounted || event.type != WebSocketEventType.authenticated) return;
        _loadAfterAuthentication();
      });
      _loadAfterAuthentication();
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    _webSocketSub?.cancel();
    super.dispose();
  }

  void _loadAfterAuthentication() {
    if (!mounted || _loadedAfterAuthentication) return;
    if (!context.webSocketService.isAuthenticated) return;
    _loadedAfterAuthentication = true;
    unawaited(_loadSongs());
    unawaited(_loadNotes());
  }

  Future<void> _loadNotes() async {
    if (!mounted) return;
    setState(() {
      _loadingNotes = true;
      _notesError = null;
    });
    final webSocket = context.webSocketService;
    if (!webSocket.isAuthenticated) {
      if (!mounted) return;
      setState(() {
        _notes = const [];
        _loadingNotes = false;
        _notesError = 'Connect to the desktop to load notes.';
      });
      return;
    }
    try {
      final raw = await webSocket.getNotes();
      if (!mounted) return;
      setState(() {
        _notes = raw;
        _loadingNotes = false;
        if (_notes.isEmpty) {
          _notesError = 'No notes have been saved in the Dock yet.';
        }
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _notes = const [];
        _loadingNotes = false;
        _notesError = 'Desktop notes are unavailable: $error';
      });
    }
  }

  Future<void> _createNote() async {
    final draft = await _showNoteEditor();
    if (draft == null || !mounted) return;
    try {
      final now = DateTime.now().millisecondsSinceEpoch;
      final saved = await context.webSocketService.saveNotes([
        {
          ...draft,
          'id': 'note-$now',
          'updatedAt': now,
          'splitOnLineBreaks': false,
        },
        ..._notes,
      ]);
      if (!mounted) return;
      setState(() => _notes = saved);
    } catch (error) {
      if (mounted) _showMessage('Could not save note: $error', danger: true);
    }
  }

  Future<void> _editNote(Map<String, dynamic> note) async {
    final draft = await _showNoteEditor(
      title: note['title']?.toString() ?? '',
      content: note['content']?.toString() ?? '',
    );
    if (draft == null || !mounted) return;
    final next = _notes.map((item) {
      if (item['id']?.toString() != note['id']?.toString()) return item;
      return {
        ...item,
        ...draft,
        'updatedAt': DateTime.now().millisecondsSinceEpoch,
      };
    }).toList();
    try {
      final saved = await context.webSocketService.saveNotes(next);
      if (!mounted) return;
      setState(() => _notes = saved);
    } catch (error) {
      if (mounted) _showMessage('Could not update note: $error', danger: true);
    }
  }

  Future<Map<String, String>?> _showNoteEditor({
    String title = '',
    String content = '',
  }) async {
    return showDialog<Map<String, String>>(
      context: context,
      builder: (_) => _NoteEditorDialog(title: title, content: content),
    );
  }

  Future<void> _showNote(Map<String, dynamic> note) async {
    try {
      await context.webSocketService.showNote(note);
      if (mounted) {
        _showMessage('${note['title'] ?? 'Note'} is live');
      }
    } catch (error) {
      if (mounted) _showMessage('Could not show note: $error', danger: true);
    }
  }

  Future<void> _clearNotes() async {
    try {
      await context.webSocketService.clearNotes();
      if (mounted) {
        _showMessage('Notes output cleared');
      }
    } catch (error) {
      if (mounted) _showMessage('Could not clear notes: $error', danger: true);
    }
  }

  Future<void> _loadSongs() async {
    if (!mounted) return;
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final webSocket = context.webSocketService;
      final isAuthenticated = webSocket.isAuthenticated;
      final raw = isAuthenticated
          ? await webSocket.getWorshipLibrary()
          : const <Map<String, dynamic>>[];
      final songs = raw
          .map(DockSong.fromJson)
          .where((song) => song.id.isNotEmpty && song.slides.isNotEmpty)
          .toList();

      if (!mounted) return;
      setState(() {
        _songs = songs;
        _loading = false;
        if (songs.isEmpty) {
          _error = isAuthenticated
              ? 'No songs have been saved on the desktop yet.'
              : 'Connect to the desktop to load songs.';
        }
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _songs = const [];
        _loading = false;
        _error = 'Desktop song library unavailable: $error';
      });
    }
  }

  List<DockSong> get _filteredSongs {
    final query = _searchQuery.trim().toLowerCase();
    if (query.isEmpty) return _songs;
    return _songs
        .where(
          (song) =>
              song.title.toLowerCase().contains(query) ||
              song.artist.toLowerCase().contains(query) ||
              song.slides.any(
                (slide) => slide.text.toLowerCase().contains(query),
              ),
        )
        .toList();
  }

  void _openSong(DockSong song) {
    setState(() {
      _performingSong = song;
      _currentSlideIndex = 0;
    });
  }

  Future<void> _pushCurrentSlide() async {
    final song = _performingSong;
    if (song == null || song.slides.isEmpty || _sending) return;
    final slide = song.slides[_currentSlideIndex];

    setState(() => _sending = true);
    try {
      await context.webSocketService.showSlide(
        song.id,
        _currentSlideIndex,
        songTitle: song.title,
        artist: song.artist,
        slideText: slide.text,
        sectionLabel: slide.label,
        overlayMode: _outputMode,
      );
      if (!mounted) return;
      _showMessage('${song.title} · ${slide.label} is live');
    } catch (error) {
      if (!mounted) return;
      _showMessage('Could not send slide: $error', danger: true);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _clearWorship() async {
    try {
      await context.webSocketService.clearWorship();
      if (mounted) _showMessage('Text output cleared');
    } catch (error) {
      if (mounted) {
        _showMessage('Could not clear text output: $error', danger: true);
      }
    }
  }

  Future<void> _moveSlide(int delta) async {
    final song = _performingSong;
    if (song == null || song.slides.isEmpty) return;
    final next = (_currentSlideIndex + delta).clamp(0, song.slides.length - 1);
    if (next == _currentSlideIndex) return;
    setState(() => _currentSlideIndex = next);
    await _pushCurrentSlide();
  }

  void _showMessage(String message, {bool danger = false}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: danger ? MCEColors.danger : MCEColors.elevated,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final song = _performingSong;
    return Column(
      children: [
        _buildTextSubtabs(),
        Expanded(
          child: _textSubTab == 1
              ? _buildNotesMode()
              : song != null
              ? _buildPerformMode(song)
              : _buildBrowseMode(),
        ),
      ],
    );
  }

  Widget _buildTextSubtabs() {
    return Container(
      margin: const EdgeInsets.fromLTRB(
        MCESpacing.lg,
        MCESpacing.md,
        MCESpacing.lg,
        0,
      ),
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: MCEColors.elevated,
        borderRadius: BorderRadius.circular(MCERadius.md),
        border: Border.all(color: MCEColors.border),
      ),
      child: Row(
        children: ['Worship', 'Notes'].asMap().entries.map((entry) {
          final selected = entry.key == _textSubTab;
          return Expanded(
            child: GestureDetector(
              onTap: () => setState(() {
                _textSubTab = entry.key;
                if (entry.key == 1) _performingSong = null;
              }),
              child: Container(
                height: 44,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: selected ? MCEColors.primaryBlue : Colors.transparent,
                  borderRadius: BorderRadius.circular(MCERadius.sm),
                ),
                child: Text(
                  entry.value,
                  style: TextStyle(
                    color: selected ? Colors.white : MCEColors.textSecondary,
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }

  Widget _buildNotesMode() {
    return RefreshIndicator(
      color: MCEColors.primaryBlue,
      backgroundColor: MCEColors.surface,
      onRefresh: _loadNotes,
      child: ListView(
        physics: AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(
          MCESpacing.lg,
          MCESpacing.lg,
          MCESpacing.lg,
          MCESpacing.xl,
        ),
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Notes', style: MCETypography.sectionTitle),
                    SizedBox(height: MCESpacing.xs),
                    Text(
                      'Notes saved in the desktop Dock',
                      style: MCETypography.sectionSubtitle,
                    ),
                  ],
                ),
              ),
              IconButton(
                tooltip: 'New note',
                onPressed: _createNote,
                icon: Icon(Icons.add),
                color: MCEColors.primaryBlue,
              ),
              IconButton(
                tooltip: 'Refresh notes',
                onPressed: _loadingNotes ? null : _loadNotes,
                icon: Icon(Icons.refresh),
                color: MCEColors.textSecondary,
              ),
            ],
          ),
          SizedBox(height: MCESpacing.sm),
          if (_notesError != null) _buildNotesInfoBanner(_notesError!),
          SizedBox(height: MCESpacing.md),
          if (_loadingNotes)
            Center(child: CircularProgressIndicator())
          else if (_notes.isEmpty)
            _buildNotesEmptyState()
          else
            ..._notes.map(_buildNoteCard),
          if (_notes.isNotEmpty) ...[
            SizedBox(height: MCESpacing.lg),
            SizedBox(
              height: 52,
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: _clearNotes,
                icon: Icon(Icons.clear),
                label: Text('Clear Notes Output'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: MCEColors.danger,
                  side: BorderSide(
                    color: MCEColors.danger.withValues(alpha: 0.5),
                  ),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(MCERadius.md),
                  ),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildNoteCard(Map<String, dynamic> note) {
    final title = note['title']?.toString() ?? 'Note';
    final content = note['content']?.toString() ?? '';
    return Container(
      margin: const EdgeInsets.only(bottom: MCESpacing.sm),
      padding: const EdgeInsets.all(MCESpacing.md),
      decoration: BoxDecoration(
        color: MCEColors.surface,
        borderRadius: BorderRadius.circular(MCERadius.md),
        border: Border.all(color: MCEColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: Text(title, style: MCETypography.bodyBold)),
              IconButton(
                tooltip: 'Edit note',
                onPressed: () => _editNote(note),
                icon: Icon(Icons.edit_outlined, size: 19),
                color: MCEColors.textSecondary,
              ),
            ],
          ),
          Text(
            content,
            maxLines: 4,
            overflow: TextOverflow.ellipsis,
            style: MCETypography.caption.copyWith(height: 1.35),
          ),
          SizedBox(height: MCESpacing.md),
          SizedBox(
            height: 46,
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: () => _showNote(note),
              icon: Icon(Icons.visibility, size: 18),
              label: Text('Show in OBS'),
              style: FilledButton.styleFrom(
                backgroundColor: MCEColors.primaryBlue,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(MCERadius.md),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildNotesInfoBanner(String message) {
    return Container(
      margin: const EdgeInsets.only(top: MCESpacing.md),
      padding: const EdgeInsets.all(MCESpacing.md),
      decoration: BoxDecoration(
        color: MCEColors.primaryBlue.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(MCERadius.md),
        border: Border.all(
          color: MCEColors.primaryBlue.withValues(alpha: 0.35),
        ),
      ),
      child: Row(
        children: [
          Icon(Icons.info_outline, color: MCEColors.primaryBlue),
          SizedBox(width: MCESpacing.sm),
          Expanded(child: Text(message, style: MCETypography.caption)),
        ],
      ),
    );
  }

  Widget _buildNotesEmptyState() {
    return Container(
      padding: const EdgeInsets.all(MCESpacing.xxl),
      decoration: BoxDecoration(
        color: MCEColors.surface,
        borderRadius: BorderRadius.circular(MCERadius.md),
        border: Border.all(color: MCEColors.border),
      ),
      child: Column(
        children: [
          Icon(Icons.notes_outlined, size: 36, color: MCEColors.textTertiary),
          SizedBox(height: MCESpacing.md),
          Text('No notes saved', style: MCETypography.bodyBold),
          SizedBox(height: MCESpacing.xs),
          Text(
            'Create a note here or in the desktop Dock.',
            textAlign: TextAlign.center,
            style: MCETypography.caption,
          ),
        ],
      ),
    );
  }

  Widget _buildBrowseMode() {
    return Column(
      children: [
        Expanded(
          child: RefreshIndicator(
            color: MCEColors.primaryBlue,
            backgroundColor: MCEColors.surface,
            onRefresh: _loadSongs,
            child: ListView(
              physics: AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(
                MCESpacing.lg,
                MCESpacing.lg,
                MCESpacing.lg,
                MCESpacing.xl,
              ),
              children: [
                _buildTitleRow(),
                SizedBox(height: MCESpacing.lg),
                _buildSearchField(),
                SizedBox(height: MCESpacing.lg),
                if (_error != null) _buildInfoBanner(),
                _buildLibraryHeader(),
                SizedBox(height: MCESpacing.md),
                if (_loading)
                  Padding(
                    padding: EdgeInsets.all(MCESpacing.xxl),
                    child: Center(child: CircularProgressIndicator()),
                  )
                else if (_filteredSongs.isEmpty)
                  _buildEmptyState()
                else
                  ..._filteredSongs.map(_buildSongCard),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildTitleRow() {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Text', style: MCETypography.sectionTitle),
              SizedBox(height: MCESpacing.xs),
              Text(
                'Worship lyrics, notes, and song slides',
                style: MCETypography.sectionSubtitle,
              ),
            ],
          ),
        ),
        IconButton(
          tooltip: 'Refresh library',
          onPressed: _loading ? null : _loadSongs,
          icon: Icon(Icons.refresh),
          color: MCEColors.textSecondary,
        ),
      ],
    );
  }

  Widget _buildSearchField() {
    return Container(
      height: 56,
      padding: const EdgeInsets.symmetric(horizontal: MCESpacing.md),
      decoration: BoxDecoration(
        color: MCEColors.surface,
        borderRadius: BorderRadius.circular(MCERadius.md),
        border: Border.all(color: MCEColors.border),
      ),
      child: Row(
        children: [
          Icon(Icons.search, color: MCEColors.textSecondary),
          SizedBox(width: MCESpacing.sm),
          Expanded(
            child: TextField(
              controller: _searchController,
              onChanged: (value) => setState(() => _searchQuery = value),
              style: MCETypography.body,
              decoration: InputDecoration(
                hintText: 'Search songs or lyrics',
                border: InputBorder.none,
              ),
            ),
          ),
          if (_searchQuery.isNotEmpty)
            IconButton(
              tooltip: 'Clear search',
              onPressed: () {
                _searchController.clear();
                setState(() => _searchQuery = '');
              },
              icon: Icon(Icons.close, size: 20),
              color: MCEColors.textSecondary,
            ),
        ],
      ),
    );
  }

  Widget _buildInfoBanner() {
    return Container(
      margin: const EdgeInsets.only(bottom: MCESpacing.lg),
      padding: const EdgeInsets.all(MCESpacing.md),
      decoration: BoxDecoration(
        color: MCEColors.primaryBlue.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(MCERadius.md),
        border: Border.all(
          color: MCEColors.primaryBlue.withValues(alpha: 0.35),
        ),
      ),
      child: Row(
        children: [
          Icon(Icons.info_outline, color: MCEColors.primaryBlue),
          SizedBox(width: MCESpacing.sm),
          Expanded(
            child: Text(
              _error!,
              style: MCETypography.caption.copyWith(height: 1.35),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildLibraryHeader() {
    return Row(
      children: [
        Expanded(child: Text('Library', style: MCETypography.cardTitle)),
        Text(
          '${_filteredSongs.length} ${_filteredSongs.length == 1 ? 'song' : 'songs'}',
          style: MCETypography.caption,
        ),
      ],
    );
  }

  Widget _buildSongCard(DockSong song) {
    return Container(
      margin: const EdgeInsets.only(bottom: MCESpacing.sm),
      decoration: BoxDecoration(
        color: MCEColors.surface,
        borderRadius: BorderRadius.circular(MCERadius.md),
        border: Border.all(color: MCEColors.border),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(MCERadius.md),
        onTap: () => _openSong(song),
        child: Padding(
          padding: const EdgeInsets.all(MCESpacing.md),
          child: Row(
            children: [
              Container(
                width: 56,
                height: 56,
                decoration: BoxDecoration(
                  color: MCEColors.primaryPurple.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(MCERadius.md),
                ),
                child: Icon(Icons.music_note, color: MCEColors.primaryPurple),
              ),
              SizedBox(width: MCESpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(song.title, style: MCETypography.bodyBold),
                    SizedBox(height: MCESpacing.xs),
                    Text(
                      song.artist.isEmpty ? 'Text slide set' : song.artist,
                      style: MCETypography.caption,
                    ),
                    SizedBox(height: MCESpacing.xs),
                    Text(
                      '${song.slides.length} slides',
                      style: MCETypography.tiny.copyWith(
                        color: MCEColors.textTertiary,
                      ),
                    ),
                  ],
                ),
              ),
              Icon(Icons.chevron_right, color: MCEColors.textTertiary),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildEmptyState() {
    return Container(
      padding: const EdgeInsets.all(MCESpacing.xxl),
      decoration: BoxDecoration(
        color: MCEColors.surface,
        borderRadius: BorderRadius.circular(MCERadius.md),
        border: Border.all(color: MCEColors.border),
      ),
      child: Column(
        children: [
          Icon(Icons.search_off, size: 36, color: MCEColors.textTertiary),
          SizedBox(height: MCESpacing.md),
          Text('No matching songs', style: MCETypography.bodyBold),
          SizedBox(height: MCESpacing.xs),
          Text(
            'Try a different title, artist, or lyric search.',
            style: MCETypography.caption,
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }

  Widget _buildPerformMode(DockSong song) {
    final slide = song.slides[_currentSlideIndex];
    return Column(
      children: [
        _buildPerformHeader(song),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(
              MCESpacing.lg,
              MCESpacing.lg,
              MCESpacing.lg,
              MCESpacing.xl,
            ),
            children: [
              SizedBox(height: MCESpacing.sm),
              _buildLiveSlideCard(song, slide),
              SizedBox(height: MCESpacing.lg),
              Row(
                children: [
                  Expanded(
                    child: Text('Slides', style: MCETypography.cardTitle),
                  ),
                  Text(
                    '${_currentSlideIndex + 1} of ${song.slides.length}',
                    style: MCETypography.caption,
                  ),
                ],
              ),
              SizedBox(height: MCESpacing.md),
              _buildSlideGrid(song),
            ],
          ),
        ),
        _buildPerformToolbar(song),
      ],
    );
  }

  Widget _buildPerformHeader(DockSong song) {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: MCESpacing.lg,
        vertical: MCESpacing.sm,
      ),
      decoration: BoxDecoration(
        color: MCEColors.surface,
        border: Border(bottom: BorderSide(color: MCEColors.border)),
      ),
      child: SafeArea(
        bottom: false,
        child: Row(
          children: [
            IconButton(
              tooltip: 'Back to library',
              onPressed: () => setState(() => _performingSong = null),
              icon: Icon(Icons.arrow_back),
              color: MCEColors.textSecondary,
            ),
            SizedBox(width: MCESpacing.sm),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(song.title, style: MCETypography.bodyBold),
                  Text(
                    song.artist.isEmpty ? 'Text presentation' : song.artist,
                    style: MCETypography.caption,
                  ),
                ],
              ),
            ),
            _LivePill(),
            IconButton(
              tooltip: 'Clear text output',
              onPressed: _clearWorship,
              icon: Icon(Icons.clear),
              color: MCEColors.danger,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildLiveSlideCard(DockSong song, DockSlide slide) {
    return Container(
      width: double.infinity,
      constraints: BoxConstraints(minHeight: 220),
      padding: const EdgeInsets.all(MCESpacing.xl),
      decoration: BoxDecoration(
        color: MCEColors.elevated,
        borderRadius: BorderRadius.circular(MCERadius.lg),
        border: Border.all(
          color: MCEColors.primaryPurple.withValues(alpha: 0.65),
        ),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.music_note, size: 16, color: MCEColors.primaryPurple),
              SizedBox(width: MCESpacing.xs),
              Text(
                slide.label.toUpperCase(),
                style: MCETypography.tiny.copyWith(
                  color: MCEColors.primaryPurple,
                ),
              ),
            ],
          ),
          SizedBox(height: MCESpacing.lg),
          Text(
            slide.text,
            textAlign: TextAlign.center,
            style: TextStyle(
              fontFamily: 'Inter',
              fontSize: 20,
              fontWeight: FontWeight.w600,
              height: 1.45,
              color: MCEColors.textPrimary,
            ),
          ),
          SizedBox(height: MCESpacing.lg),
          Text(song.title, style: MCETypography.caption),
        ],
      ),
    );
  }

  Widget _buildSlideGrid(DockSong song) {
    return GridView.builder(
      shrinkWrap: true,
      physics: NeverScrollableScrollPhysics(),
      itemCount: song.slides.length,
      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        crossAxisSpacing: MCESpacing.sm,
        mainAxisSpacing: MCESpacing.sm,
        childAspectRatio: 1.55,
      ),
      itemBuilder: (context, index) {
        final item = song.slides[index];
        final selected = index == _currentSlideIndex;
        return InkWell(
          borderRadius: BorderRadius.circular(MCERadius.md),
          onTap: () {
            setState(() => _currentSlideIndex = index);
            _pushCurrentSlide();
          },
          child: Container(
            padding: const EdgeInsets.all(MCESpacing.md),
            decoration: BoxDecoration(
              color: selected
                  ? MCEColors.primaryBlue.withValues(alpha: 0.16)
                  : MCEColors.surface,
              borderRadius: BorderRadius.circular(MCERadius.md),
              border: Border.all(
                color: selected ? MCEColors.primaryBlue : MCEColors.border,
                width: selected ? 2 : 1,
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${index + 1} · ${item.label}',
                  style: MCETypography.tiny.copyWith(
                    color: selected
                        ? MCEColors.primaryBlue
                        : MCEColors.textSecondary,
                  ),
                ),
                SizedBox(height: MCESpacing.sm),
                Expanded(
                  child: Text(
                    item.text,
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                    style: MCETypography.caption.copyWith(height: 1.35),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildPerformToolbar(DockSong song) {
    return Container(
      padding: const EdgeInsets.fromLTRB(
        MCESpacing.lg,
        MCESpacing.md,
        MCESpacing.lg,
        MCESpacing.sm,
      ),
      decoration: BoxDecoration(
        color: MCEColors.surface,
        border: Border(top: BorderSide(color: MCEColors.border)),
      ),
      child: SafeArea(
        top: false,
        child: Column(
          children: [
            Row(
              children: [
                Expanded(
                  child: _ToolbarButton(
                    icon: Icons.skip_previous,
                    label: 'Prev',
                    onPressed: _currentSlideIndex > 0
                        ? () => _moveSlide(-1)
                        : null,
                  ),
                ),
                SizedBox(width: MCESpacing.sm),
                Expanded(
                  flex: 2,
                  child: SizedBox(
                    height: 56,
                    child: ElevatedButton.icon(
                      onPressed: _sending ? null : _pushCurrentSlide,
                      icon: Icon(_sending ? Icons.sync : Icons.visibility),
                      label: Text(_sending ? 'Sending…' : 'Send to OBS'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: MCEColors.primaryBlue,
                        foregroundColor: Colors.white,
                        disabledBackgroundColor: MCEColors.elevated,
                        elevation: 0,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(MCERadius.md),
                        ),
                      ),
                    ),
                  ),
                ),
                SizedBox(width: MCESpacing.sm),
                Expanded(
                  child: _ToolbarButton(
                    icon: Icons.skip_next,
                    label: 'Next',
                    onPressed: _currentSlideIndex < song.slides.length - 1
                        ? () => _moveSlide(1)
                        : null,
                  ),
                ),
              ],
            ),
            SizedBox(height: MCESpacing.sm),
            Row(
              children: [
                Text('Output', style: MCETypography.caption),
                SizedBox(width: MCESpacing.md),
                Expanded(
                  child: SegmentedButton<String>(
                    segments: const [
                      ButtonSegment(value: 'fullscreen', label: Text('Full')),
                      ButtonSegment(
                        value: 'lower-third',
                        label: Text('Lower third'),
                      ),
                    ],
                    selected: {_outputMode},
                    onSelectionChanged: (value) =>
                        setState(() => _outputMode = value.first),
                    style: ButtonStyle(
                      minimumSize: WidgetStatePropertyAll(Size.fromHeight(48)),
                      foregroundColor: WidgetStatePropertyAll(
                        MCEColors.textSecondary,
                      ),
                      side: WidgetStatePropertyAll(
                        BorderSide(color: MCEColors.border),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _LivePill extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: MCESpacing.sm,
        vertical: 6,
      ),
      decoration: BoxDecoration(
        color: MCEColors.success.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(MCERadius.sm),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.circle, size: 8, color: MCEColors.success),
          SizedBox(width: MCESpacing.xs),
          Text('LIVE', style: MCETypography.tiny),
        ],
      ),
    );
  }
}

class _ToolbarButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback? onPressed;

  const _ToolbarButton({
    required this.icon,
    required this.label,
    required this.onPressed,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 56,
      child: OutlinedButton.icon(
        onPressed: onPressed,
        icon: Icon(icon),
        label: Text(label),
        style: OutlinedButton.styleFrom(
          foregroundColor: onPressed == null
              ? MCEColors.textTertiary
              : MCEColors.textPrimary,
          side: BorderSide(
            color: onPressed == null ? MCEColors.border : MCEColors.borderLight,
          ),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(MCERadius.md),
          ),
        ),
      ),
    );
  }
}

class _NoteEditorDialog extends StatefulWidget {
  final String title;
  final String content;

  const _NoteEditorDialog({required this.title, required this.content});

  @override
  State<_NoteEditorDialog> createState() => _NoteEditorDialogState();
}

class _NoteEditorDialogState extends State<_NoteEditorDialog> {
  late final TextEditingController _titleController;
  late final TextEditingController _contentController;

  @override
  void initState() {
    super.initState();
    _titleController = TextEditingController(text: widget.title);
    _contentController = TextEditingController(text: widget.content);
  }

  @override
  void dispose() {
    _titleController.dispose();
    _contentController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      backgroundColor: MCEColors.surface,
      title: Text(widget.title.isEmpty ? 'New note' : 'Edit note'),
      content: SizedBox(
        width: 420,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: _titleController,
              decoration: InputDecoration(labelText: 'Title'),
            ),
            SizedBox(height: MCESpacing.md),
            TextField(
              controller: _contentController,
              minLines: 4,
              maxLines: 8,
              decoration: InputDecoration(labelText: 'Note content'),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: Text('Cancel'),
        ),
        FilledButton(
          onPressed: () {
            final nextTitle = _titleController.text.trim();
            final nextContent = _contentController.text.trim();
            if (nextTitle.isEmpty || nextContent.isEmpty) return;
            Navigator.of(
              context,
            ).pop({'title': nextTitle, 'content': nextContent});
          },
          child: Text('Save'),
        ),
      ],
    );
  }
}
