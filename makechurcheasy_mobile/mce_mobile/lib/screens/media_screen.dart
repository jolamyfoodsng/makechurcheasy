import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'package:file_picker/file_picker.dart';

import '../models/dock_models.dart';
import '../models/file_transfer_models.dart';
import '../services/mce_provider.dart';
import '../services/websocket_service.dart';
import '../theme/mce_theme.dart';

class MediaScreen extends StatefulWidget {
  final int openFilePickerRequest;

  const MediaScreen({super.key, this.openFilePickerRequest = 0});

  @override
  State<MediaScreen> createState() => _MediaScreenState();
}

class _MediaScreenState extends State<MediaScreen> {
  final _searchController = TextEditingController();
  String _searchQuery = '';
  String _filter = 'All';
  bool _loading = true;
  String? _error;
  String? _nowPlaying;
  bool _showUploadCard = true;
  bool _uploading = false;
  int _uploadCurrent = 0;
  int _uploadTotal = 0;
  String _uploadStatus = '';
  List<DockMediaItem> _items = const [];
  StreamSubscription<WebSocketEvent>? _webSocketSub;
  Timer? _mediaRefreshTimer;
  bool _loadedAfterAuthentication = false;
  bool _mediaLoadInFlight = false;
  String _mediaInventorySignature = '';
  final Map<String, String> _fitModes = <String, String>{};
  final Map<String, bool> _mutedByMedia = <String, bool>{};
  final Map<String, bool> _loopingByMedia = <String, bool>{};

  static const _filters = ['All', 'Images', 'Videos'];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.mobilePreferences.addListener(_onPreferencesChanged);
      _webSocketSub = context.webSocketService.events.listen((event) {
        if (!mounted || event.type != WebSocketEventType.authenticated) return;
        _loadAfterAuthentication();
      });
      _loadAfterAuthentication();
      if (widget.openFilePickerRequest > 0) {
        unawaited(_pickAndUpload());
      }
    });
  }

  @override
  void didUpdateWidget(covariant MediaScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.openFilePickerRequest != oldWidget.openFilePickerRequest &&
        widget.openFilePickerRequest > 0) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) unawaited(_pickAndUpload());
      });
    }
  }

  @override
  void dispose() {
    _searchController.dispose();
    context.mobilePreferences.removeListener(_onPreferencesChanged);
    _webSocketSub?.cancel();
    _mediaRefreshTimer?.cancel();
    super.dispose();
  }

  void _onPreferencesChanged() {
    if (mounted) setState(() {});
  }

  void _loadAfterAuthentication() {
    if (!mounted || _loadedAfterAuthentication) return;
    if (!context.webSocketService.isAuthenticated) return;
    _loadedAfterAuthentication = true;
    unawaited(_loadMedia());
    _mediaRefreshTimer = Timer.periodic(
      Duration(seconds: 5),
      (_) => unawaited(_loadMedia(showLoading: false)),
    );
  }

  Future<void> _loadMedia({bool showLoading = true}) async {
    if (!mounted) return;
    // The desktop reconciles the shared uploads folder on every request. Do
    // not let the five-second refresh timer stack another full inventory read
    // while the previous one is still waiting on the bridge.
    if (_mediaLoadInFlight) return;
    _mediaLoadInFlight = true;
    if (showLoading) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }

    try {
      final webSocket = context.webSocketService;
      final isAuthenticated = webSocket.isAuthenticated;
      final raw = isAuthenticated
          ? await webSocket.getMediaLibrary()
          : const <Map<String, dynamic>>[];
      final items = raw
          .map(DockMediaItem.fromJson)
          .where((item) => item.id.isNotEmpty)
          .toList();
      if (!mounted) return;
      final signature = items
          .map(
            (item) =>
                '${item.id}|${item.name}|${item.type}|${item.diskFileName}|${item.durationSec}|${item.width}|${item.height}',
          )
          .join('\u0000');
      setState(() {
        if (signature != _mediaInventorySignature) {
          _items = items;
          _mediaInventorySignature = signature;
        }
        if (showLoading) _loading = false;
        _error = items.isEmpty
            ? (isAuthenticated
                  ? 'No media has been saved on the desktop yet.'
                  : 'Connect to the desktop to load media.')
            : null;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        // Keep an already loaded inventory visible when a background refresh
        // briefly misses the desktop command timeout.
        if (showLoading) _loading = false;
        if (_items.isEmpty) {
          _error = 'Desktop media library unavailable: $error';
        }
      });
    } finally {
      _mediaLoadInFlight = false;
    }
  }

  List<DockMediaItem> get _filteredItems {
    final query = _searchQuery.trim().toLowerCase();
    return _items.where((item) {
      final matchesQuery =
          query.isEmpty || item.name.toLowerCase().contains(query);
      final matchesFilter = switch (_filter) {
        'Images' => !item.isVideo,
        'Videos' => item.isVideo,
        _ => true,
      };
      return matchesQuery && matchesFilter;
    }).toList();
  }

  String? _previewUrlFor(DockMediaItem item) {
    final thumbnail = item.thumbnailUrl?.trim();
    if (thumbnail != null && thumbnail.isNotEmpty) {
      return thumbnail;
    }

    // Never open the full video file just to paint a gallery card. The desktop
    // sends a poster frame when it has one; otherwise the card stays a cheap
    // static placeholder until the user chooses to send the media to OBS.
    if (item.isVideo) return null;

    final fileName = item.diskFileName?.trim();
    final desktop = context.desktopService.currentDesktop;
    final host = desktop?.ip?.trim();
    if (fileName == null || fileName.isEmpty || host == null || host.isEmpty) {
      return null;
    }

    final port = desktop?.apiPort ?? 45678;
    return 'http://$host:$port/uploads/${Uri.encodeComponent(fileName)}';
  }

  String _fitModeFor(DockMediaItem item) => _fitModes[item.id] ?? 'cover';

  bool _mutedFor(DockMediaItem item) => _mutedByMedia[item.id] ?? true;

  bool _loopingFor(DockMediaItem item) => _loopingByMedia[item.id] ?? true;

  Future<void> _showMedia(DockMediaItem item) async {
    try {
      await context.webSocketService.showMedia(
        item.id,
        muted: _mutedFor(item),
        looping: _loopingFor(item),
        fitMode: _fitModeFor(item),
      );
      if (!mounted) return;
      setState(() => _nowPlaying = item.id);
    } catch (error) {
      if (mounted) _showMessage('Could not send media: $error', danger: true);
    }
  }

  Future<void> _sendMediaToScene(DockMediaItem item) async {
    try {
      final result = await context.webSocketService.getScenes();
      final payload = result['payload'];
      final scenes = payload is List
          ? payload
                .whereType<Map>()
                .map((scene) => scene['name']?.toString().trim() ?? '')
                .where((name) => name.isNotEmpty)
                .toSet()
                .toList()
          : <String>[];
      scenes.sort();

      if (!mounted) return;
      if (scenes.isEmpty) {
        _showMessage('No OBS scenes are available.', danger: true);
        return;
      }

      final sceneName = await showModalBottomSheet<String>(
        context: context,
        backgroundColor: MCEColors.surface,
        showDragHandle: true,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(
            top: Radius.circular(MCERadius.xl),
          ),
        ),
        builder: (sheetContext) => SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(
              MCESpacing.lg,
              0,
              MCESpacing.lg,
              MCESpacing.lg,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Send to scene', style: MCETypography.sectionTitle),
                SizedBox(height: MCESpacing.xs),
                Text(item.name, style: MCETypography.caption),
                SizedBox(height: MCESpacing.md),
                ...scenes.map(
                  (scene) => ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: Icon(
                      Icons.video_library_outlined,
                      color: MCEColors.primaryBlue,
                    ),
                    title: Text(scene, style: MCETypography.bodyBold),
                    trailing: Icon(Icons.chevron_right),
                    onTap: () => Navigator.of(sheetContext).pop(scene),
                  ),
                ),
              ],
            ),
          ),
        ),
      );
      if (!mounted || sceneName == null) return;

      await context.webSocketService.sendMediaToScene(
        mediaId: item.id,
        sceneName: sceneName,
        muted: _mutedFor(item),
        looping: _loopingFor(item),
        fitMode: _fitModeFor(item),
      );
      if (mounted) _showMessage('${item.name} sent to $sceneName');
    } catch (error) {
      if (mounted) {
        _showMessage('Could not send media to scene: $error', danger: true);
      }
    }
  }

  Future<void> _showMediaOptions(DockMediaItem item) async {
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: MCEColors.surface,
      showDragHandle: true,
      isScrollControlled: true,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(MCERadius.xl)),
      ),
      builder: (sheetContext) {
        var fitMode = _fitModeFor(item);
        var muted = _mutedFor(item);
        var looping = _loopingFor(item);

        return StatefulBuilder(
          builder: (context, setSheetState) => SafeArea(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(
                MCESpacing.lg,
                0,
                MCESpacing.lg,
                MCESpacing.lg,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(item.name, style: MCETypography.sectionTitle),
                            SizedBox(height: MCESpacing.xs),
                            Text('Media actions', style: MCETypography.caption),
                          ],
                        ),
                      ),
                      IconButton(
                        tooltip: 'Close',
                        onPressed: () => Navigator.of(sheetContext).pop(),
                        icon: Icon(Icons.close),
                      ),
                    ],
                  ),
                  SizedBox(height: MCESpacing.md),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      onPressed: () {
                        Navigator.of(sheetContext).pop();
                        unawaited(_showMedia(item));
                      },
                      icon: Icon(Icons.play_arrow),
                      label: Text('Send to OBS'),
                    ),
                  ),
                  SizedBox(height: MCESpacing.sm),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton.icon(
                      onPressed: () {
                        Navigator.of(sheetContext).pop();
                        unawaited(_sendMediaToScene(item));
                      },
                      icon: Icon(Icons.send_outlined),
                      label: Text('Send to scene'),
                    ),
                  ),
                  SizedBox(height: MCESpacing.lg),
                  Text('Display', style: MCETypography.bodyBold),
                  SizedBox(height: MCESpacing.sm),
                  Wrap(
                    spacing: MCESpacing.sm,
                    children: [
                      for (final option in const [
                        ('cover', 'Fill'),
                        ('contain', 'Fit'),
                        ('stretch', 'Stretch'),
                      ])
                        ChoiceChip(
                          label: Text(option.$2),
                          selected: fitMode == option.$1,
                          onSelected: (_) {
                            setSheetState(() => fitMode = option.$1);
                            setState(() => _fitModes[item.id] = option.$1);
                            if (_nowPlaying == item.id)
                              unawaited(_showMedia(item));
                          },
                        ),
                    ],
                  ),
                  if (item.isVideo) ...[
                    SizedBox(height: MCESpacing.lg),
                    Text('Audio', style: MCETypography.bodyBold),
                    SizedBox(height: MCESpacing.sm),
                    Wrap(
                      spacing: MCESpacing.sm,
                      children: [
                        for (final option in const [
                          (true, 'Muted'),
                          (false, 'Sound'),
                        ])
                          ChoiceChip(
                            label: Text(option.$2),
                            selected: muted == option.$1,
                            onSelected: (_) {
                              setSheetState(() => muted = option.$1);
                              setState(
                                () => _mutedByMedia[item.id] = option.$1,
                              );
                              if (_nowPlaying == item.id)
                                unawaited(_showMedia(item));
                            },
                          ),
                      ],
                    ),
                    SizedBox(height: MCESpacing.lg),
                    Text('Playback', style: MCETypography.bodyBold),
                    SizedBox(height: MCESpacing.sm),
                    Wrap(
                      spacing: MCESpacing.sm,
                      children: [
                        for (final option in const [
                          (true, 'Loop'),
                          (false, 'Play once'),
                        ])
                          ChoiceChip(
                            label: Text(option.$2),
                            selected: looping == option.$1,
                            onSelected: (_) {
                              setSheetState(() => looping = option.$1);
                              setState(
                                () => _loopingByMedia[item.id] = option.$1,
                              );
                              if (_nowPlaying == item.id)
                                unawaited(_showMedia(item));
                            },
                          ),
                      ],
                    ),
                  ],
                  SizedBox(height: MCESpacing.sm),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  Future<void> _clearMedia() async {
    try {
      await context.webSocketService.clearMedia();
      if (!mounted) return;
      setState(() => _nowPlaying = null);
      _showMessage('Media output cleared');
    } catch (error) {
      if (mounted) _showMessage('Could not clear media: $error', danger: true);
    }
  }

  Future<void> _pickAndUpload() async {
    if (_uploading) return;

    try {
      final result = await FilePicker.pickFiles(
        allowMultiple: true,
        type: FileType.any,
        withReadStream: true,
        withData: kIsWeb,
      );
      if (result == null || result.files.isEmpty || !mounted) return;
      await _uploadFiles(result.files);
    } catch (error) {
      if (mounted) _showMessage('Could not send files: $error', danger: true);
    }
  }

  Future<void> _uploadFiles(List<PlatformFile> files) async {
    final apiService = context.apiService;
    setState(() {
      _uploading = true;
      _uploadCurrent = 0;
      _uploadTotal = files.length;
      _uploadStatus = 'Preparing the desktop Receiver…';
    });

    try {
      final batch = await apiService.prepareLocalSendUpload(
        files,
        destination: FileTransferDestination.receiver,
      );
      for (final transferFile in batch.files) {
        if (!mounted) return;
        setState(() {
          _uploadStatus = 'Sending ${transferFile.file.name} to desktop';
        });
        await apiService.uploadLocalSendFile(
          batch,
          transferFile,
          onProgress: (sent, total) {
            if (!mounted) return;
            setState(() {
              final percent = total > 0 ? (sent / total * 100).round() : 0;
              _uploadStatus = 'Sending ${transferFile.file.name} · $percent%';
            });
          },
        );

        if (!mounted) return;
        setState(() => _uploadCurrent += 1);
      }

      await _loadMedia();
      if (!mounted) return;
      _showMessage('File sent to the desktop Receiver.');
    } finally {
      if (mounted) {
        setState(() {
          _uploading = false;
          _uploadStatus = '';
        });
      }
    }
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
    final filteredItems = _filteredItems;
    return Column(
      children: [
        Expanded(
          child: RefreshIndicator(
            color: MCEColors.primaryBlue,
            backgroundColor: MCEColors.surface,
            onRefresh: _loadMedia,
            child: CustomScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              slivers: [
                SliverPadding(
                  padding: const EdgeInsets.fromLTRB(
                    MCESpacing.lg,
                    MCESpacing.lg,
                    MCESpacing.lg,
                    0,
                  ),
                  sliver: SliverList(
                    delegate: SliverChildListDelegate([
                      _buildTitleRow(),
                      SizedBox(height: MCESpacing.lg),
                      if (_showUploadCard)
                        _buildUploadCard()
                      else
                        _buildShowUploadCard(),
                      if (_uploading) ...[
                        SizedBox(height: MCESpacing.md),
                        _buildUploadProgress(),
                      ],
                      SizedBox(height: MCESpacing.lg),
                      _buildSearchField(),
                      SizedBox(height: MCESpacing.md),
                      _buildFilters(),
                      SizedBox(height: MCESpacing.lg),
                      if (_error != null) _buildInfoBanner(),
                      SizedBox(height: MCESpacing.lg),
                      if (_loading)
                        Padding(
                          padding: EdgeInsets.all(MCESpacing.xxl),
                          child: Center(child: CircularProgressIndicator()),
                        )
                      else if (filteredItems.isEmpty)
                        _buildEmptyState(),
                    ]),
                  ),
                ),
                if (!_loading && filteredItems.isNotEmpty)
                  SliverPadding(
                    padding: const EdgeInsets.fromLTRB(
                      MCESpacing.lg,
                      0,
                      MCESpacing.lg,
                      MCESpacing.xl,
                    ),
                    sliver: SliverGrid(
                      gridDelegate:
                          const SliverGridDelegateWithFixedCrossAxisCount(
                            crossAxisCount: 2,
                            mainAxisSpacing: MCESpacing.md,
                            crossAxisSpacing: MCESpacing.md,
                            childAspectRatio: 0.82,
                          ),
                      delegate: SliverChildBuilderDelegate(
                        (context, index) =>
                            _buildMediaCard(filteredItems[index]),
                        childCount: filteredItems.length,
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
        _buildClearBar(),
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
              Text('Media', style: MCETypography.sectionTitle),
              SizedBox(height: MCESpacing.xs),
              Text(
                'Images, videos, and backgrounds for OBS',
                style: MCETypography.sectionSubtitle,
              ),
            ],
          ),
        ),
        IconButton(
          tooltip: 'Refresh media',
          onPressed: _loading ? null : _loadMedia,
          icon: Icon(Icons.refresh),
          color: MCEColors.textSecondary,
        ),
      ],
    );
  }

  Widget _buildUploadCard() {
    return Container(
      padding: const EdgeInsets.all(MCESpacing.md),
      decoration: BoxDecoration(
        color: MCEColors.primaryBlue.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(MCERadius.md),
        border: Border.all(color: MCEColors.primaryBlue.withValues(alpha: 0.4)),
      ),
      child: Row(
        children: [
          Icon(Icons.upload_file_outlined, color: MCEColors.primaryBlue),
          SizedBox(width: MCESpacing.sm),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Send file to desktop', style: MCETypography.bodyBold),
                SizedBox(height: MCESpacing.xs),
                Text(
                  'Any file goes to the desktop Receiver for saving',
                  style: MCETypography.caption,
                ),
              ],
            ),
          ),
          SizedBox(width: MCESpacing.sm),
          SizedBox(
            height: 48,
            child: FilledButton.icon(
              onPressed: _uploading ? null : _pickAndUpload,
              icon: Icon(Icons.add, size: 18),
              label: Text('Send file'),
              style: FilledButton.styleFrom(
                backgroundColor: MCEColors.primaryBlue,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(MCERadius.md),
                ),
              ),
            ),
          ),
          SizedBox(width: MCESpacing.xs),
          IconButton(
            tooltip: 'Hide send file',
            onPressed: _uploading
                ? null
                : () => setState(() => _showUploadCard = false),
            icon: Icon(Icons.close),
            color: MCEColors.textSecondary,
          ),
        ],
      ),
    );
  }

  Widget _buildShowUploadCard() {
    return Align(
      alignment: Alignment.centerRight,
      child: TextButton.icon(
        onPressed: () => setState(() => _showUploadCard = true),
        icon: Icon(Icons.upload_file_outlined, size: 18),
        label: Text('Show send file'),
        style: TextButton.styleFrom(foregroundColor: MCEColors.primaryBlue),
      ),
    );
  }

  Widget _buildUploadProgress() {
    final progress = _uploadTotal == 0 ? null : _uploadCurrent / _uploadTotal;
    return Container(
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
              SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
              SizedBox(width: MCESpacing.sm),
              Expanded(
                child: Text(_uploadStatus, style: MCETypography.bodyBold),
              ),
              Text(
                '$_uploadCurrent/$_uploadTotal',
                style: MCETypography.caption,
              ),
            ],
          ),
          SizedBox(height: MCESpacing.sm),
          LinearProgressIndicator(
            value: progress,
            minHeight: 6,
            borderRadius: BorderRadius.circular(MCERadius.pill),
            color: MCEColors.primaryBlue,
            backgroundColor: MCEColors.elevated,
          ),
        ],
      ),
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
          Expanded(
            child: TextField(
              controller: _searchController,
              onChanged: (value) => setState(() => _searchQuery = value),
              style: MCETypography.body,
              decoration: InputDecoration(
                hintText: 'Search media',
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

  Widget _buildFilters() {
    return SizedBox(
      height: 48,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: _filters.length,
        separatorBuilder: (_, _) => SizedBox(width: MCESpacing.sm),
        itemBuilder: (context, index) {
          final filter = _filters[index];
          final selected = filter == _filter;
          return ChoiceChip(
            label: Text(filter),
            selected: selected,
            onSelected: (_) => setState(() => _filter = filter),
            selectedColor: MCEColors.primaryBlue,
            backgroundColor: MCEColors.elevated,
            side: BorderSide(
              color: selected ? MCEColors.primaryBlue : MCEColors.border,
            ),
            labelStyle: TextStyle(
              color: selected ? Colors.white : MCEColors.textSecondary,
              fontWeight: FontWeight.w600,
            ),
          );
        },
      ),
    );
  }

  Widget _buildInfoBanner() {
    const color = MCEColors.primaryBlue;
    return Container(
      margin: const EdgeInsets.only(bottom: MCESpacing.lg),
      padding: const EdgeInsets.all(MCESpacing.md),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(MCERadius.md),
        border: Border.all(color: color.withValues(alpha: 0.35)),
      ),
      child: Row(
        children: [
          Icon(Icons.info_outline, color: color),
          SizedBox(width: MCESpacing.sm),
          Expanded(child: Text(_error!, style: MCETypography.caption)),
        ],
      ),
    );
  }

  Widget _buildMediaCard(DockMediaItem item) {
    final isLive = item.id == _nowPlaying;
    final previewUrl = _previewUrlFor(item);
    final typeColor = item.isVideo ? MCEColors.danger : MCEColors.secondaryBlue;
    final duration = item.durationSec != null && item.durationSec! > 0
        ? '${item.durationSec!.round()} sec'
        : null;

    return Semantics(
      button: true,
      label: '${item.name}, ${item.isVideo ? 'video' : 'image'}',
      hint: 'Tap to send to OBS. Long press for options.',
      child: Material(
        color: MCEColors.surface,
        clipBehavior: Clip.antiAlias,
        borderRadius: BorderRadius.circular(MCERadius.md),
        child: InkWell(
          onTap: () => _showMedia(item),
          onLongPress: () => _showMediaOptions(item),
          child: Container(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(MCERadius.md),
              border: Border.all(
                color: isLive ? MCEColors.success : MCEColors.border,
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      _MediaPreview(
                        item: item,
                        url: previewUrl,
                        showImagePreview:
                            context.mobilePreferences.showMediaImagePreviews,
                      ),
                      Positioned(
                        top: MCESpacing.sm,
                        left: MCESpacing.sm,
                        child: DecoratedBox(
                          decoration: BoxDecoration(
                            color: MCEColors.background.withValues(alpha: 0.82),
                            borderRadius: BorderRadius.circular(MCERadius.pill),
                          ),
                          child: Padding(
                            padding: const EdgeInsets.symmetric(
                              horizontal: MCESpacing.sm,
                              vertical: MCESpacing.xs,
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(
                                  item.isVideo
                                      ? Icons.videocam_outlined
                                      : Icons.image_outlined,
                                  size: 14,
                                  color: typeColor,
                                ),
                                SizedBox(width: MCESpacing.xs),
                                Text(
                                  item.isVideo ? 'VIDEO' : 'IMAGE',
                                  style: MCETypography.tiny.copyWith(
                                    color: MCEColors.textPrimary,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                      if (item.isVideo && _mutedFor(item))
                        Positioned(
                          right: MCESpacing.sm,
                          bottom: MCESpacing.sm,
                          child: CircleAvatar(
                            radius: 14,
                            backgroundColor: MCEColors.background.withValues(
                              alpha: 0.82,
                            ),
                            child: Icon(
                              Icons.volume_off_outlined,
                              size: 16,
                              color: MCEColors.textPrimary,
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(
                    MCESpacing.sm,
                    MCESpacing.sm,
                    MCESpacing.sm,
                    MCESpacing.md,
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        item.name,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: MCETypography.bodyBold,
                      ),
                      SizedBox(height: MCESpacing.xs),
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              item.isVideo
                                  ? 'Video background'
                                  : 'Image background',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: MCETypography.caption,
                            ),
                          ),
                          if (duration != null)
                            Text(duration, style: MCETypography.tiny),
                        ],
                      ),
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
          Icon(
            Icons.perm_media_outlined,
            size: 36,
            color: MCEColors.textTertiary,
          ),
          SizedBox(height: MCESpacing.md),
          Text('No matching media', style: MCETypography.bodyBold),
          SizedBox(height: MCESpacing.xs),
          Text('Try another search or filter.', style: MCETypography.caption),
        ],
      ),
    );
  }

  Widget _buildClearBar() {
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
        child: SizedBox(
          height: 56,
          width: double.infinity,
          child: OutlinedButton.icon(
            onPressed: _nowPlaying == null ? null : _clearMedia,
            icon: Icon(Icons.clear),
            label: Text('Clear media output'),
            style: OutlinedButton.styleFrom(
              foregroundColor: MCEColors.danger,
              side: BorderSide(color: MCEColors.danger.withValues(alpha: 0.45)),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(MCERadius.md),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _MediaPreview extends StatefulWidget {
  final DockMediaItem item;
  final String? url;
  final bool showImagePreview;

  const _MediaPreview({
    required this.item,
    required this.url,
    required this.showImagePreview,
  });

  @override
  State<_MediaPreview> createState() => _MediaPreviewState();
}

class _MediaPreviewState extends State<_MediaPreview> {
  String? _resolvedUrl;
  bool _loading = false;
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    _resolvedUrl = widget.url;
    _loadVideoPosterIfNeeded();
  }

  @override
  void didUpdateWidget(covariant _MediaPreview oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.item.id != widget.item.id || oldWidget.url != widget.url) {
      _resolvedUrl = widget.url;
      _failed = false;
      _loadVideoPosterIfNeeded();
    }
  }

  Future<void> _loadVideoPosterIfNeeded() async {
    if (!widget.item.isVideo ||
        (_resolvedUrl?.isNotEmpty ?? false) ||
        _loading ||
        _failed) {
      return;
    }

    _loading = true;
    try {
      final thumbnail = await context.webSocketService.getMediaThumbnail(
        widget.item.id,
      );
      if (!mounted) return;
      setState(() {
        _resolvedUrl = thumbnail;
        _loading = false;
        _failed = thumbnail == null;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _failed = true;
      });
    }
  }

  Widget _placeholder() {
    final color = widget.item.isVideo
        ? MCEColors.danger
        : MCEColors.secondaryBlue;
    return Container(
      color: color.withValues(alpha: 0.12),
      alignment: Alignment.center,
      child: Icon(
        widget.item.isVideo ? Icons.videocam_outlined : Icons.image_outlined,
        size: 34,
        color: color,
      ),
    );
  }

  Widget _image(String source) {
    if (source.startsWith('data:')) {
      final comma = source.indexOf(',');
      if (comma < 0) return _placeholder();
      try {
        return Image.memory(
          base64Decode(source.substring(comma + 1)),
          fit: BoxFit.cover,
          gaplessPlayback: true,
          errorBuilder: (_, _, _) => _placeholder(),
        );
      } catch (_) {
        return _placeholder();
      }
    }
    return Image.network(
      source,
      fit: BoxFit.cover,
      filterQuality: FilterQuality.low,
      errorBuilder: (_, _, _) => _placeholder(),
      loadingBuilder: (context, child, progress) {
        if (progress == null) return child;
        return _placeholder();
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final url = _resolvedUrl;
    if (url == null ||
        url.isEmpty ||
        (!widget.item.isVideo && !widget.showImagePreview)) {
      return _placeholder();
    }

    // Images and video poster frames both use a single static image widget.
    // There is deliberately no video controller here, so scrolling the grid
    // cannot start playback or open dozens of network streams.
    return _image(url);
  }
}
