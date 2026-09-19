import 'dart:async';

import 'package:flutter/material.dart';

import '../services/mce_provider.dart';
import '../services/websocket_service.dart';
import '../theme/mce_theme.dart';

/// The mobile view of the Dock's saved Multi-View cards.
///
/// Layout creation and assignment stay on the desktop Dock. The phone only
/// presents the saved cards and invokes their real OBS preview/clear actions.
class MultiViewScreen extends StatefulWidget {
  const MultiViewScreen({super.key});

  @override
  State<MultiViewScreen> createState() => _MultiViewScreenState();
}

class _MultiViewScreenState extends State<MultiViewScreen> {
  bool _loading = true;
  String? _error;
  String? _activeId;
  List<_SavedMultiView> _cards = const [];
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
    _webSocketSub?.cancel();
    super.dispose();
  }

  void _loadAfterAuthentication() {
    if (!mounted || _loadedAfterAuthentication) return;
    if (!context.webSocketService.isAuthenticated) return;
    _loadedAfterAuthentication = true;
    unawaited(_loadCards());
  }

  Future<void> _loadCards() async {
    if (!mounted) return;
    setState(() {
      _loading = true;
      _error = null;
    });

    final webSocket = context.webSocketService;
    if (!webSocket.isAuthenticated) {
      if (!mounted) return;
      setState(() {
        _cards = const [];
        _loading = false;
        _error = 'Connect to the desktop to load saved Multi-Views.';
      });
      return;
    }

    try {
      final raw = await webSocket.getMultiviewCards();
      if (!mounted) return;
      setState(() {
        _cards = raw
            .map(_SavedMultiView.fromJson)
            .where((card) => card.id.isNotEmpty)
            .toList();
        _loading = false;
        if (_cards.isEmpty) {
          _error =
              'No saved Multi-View cards are available in the desktop Dock.';
        }
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _cards = const [];
        _loading = false;
        _error = 'Multi-View cards are unavailable: $error';
      });
    }
  }

  Future<void> _preview(_SavedMultiView card) async {
    if (card.obsSceneName.isEmpty) {
      _showMessage('This Multi-View has no OBS scene yet.', danger: true);
      return;
    }
    try {
      await context.webSocketService.setPreviewScene(card.obsSceneName);
      if (!mounted) return;
      setState(() => _activeId = card.id);
      _showMessage('${card.name} is in OBS Preview');
    } catch (error) {
      if (mounted) {
        _showMessage('Could not preview Multi-View: $error', danger: true);
      }
    }
  }

  Future<void> _clear(_SavedMultiView card) async {
    try {
      await context.webSocketService.clearMultiview(
        sceneName: card.obsSceneName,
        multiviewId: card.id,
      );
      if (!mounted) return;
      setState(() {
        if (_activeId == card.id) _activeId = null;
      });
      _showMessage('${card.name} cleared');
    } catch (error) {
      if (mounted) {
        _showMessage('Could not clear Multi-View: $error', danger: true);
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
    return RefreshIndicator(
      color: MCEColors.primaryBlue,
      backgroundColor: MCEColors.surface,
      onRefresh: _loadCards,
      child: ListView(
        physics: AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(
          MCESpacing.lg,
          MCESpacing.lg,
          MCESpacing.lg,
          MCESpacing.xl,
        ),
        children: [
          _buildHeader(),
          SizedBox(height: MCESpacing.lg),
          if (_error != null) _buildInfoBanner(_error!),
          if (_loading)
            Padding(
              padding: EdgeInsets.all(MCESpacing.xxl),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (_cards.isEmpty)
            _buildEmptyState()
          else
            ..._cards.map(_buildCard),
        ],
      ),
    );
  }

  Widget _buildHeader() {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Multi-View', style: MCETypography.sectionTitle),
              SizedBox(height: MCESpacing.xs),
              Text(
                'Saved layouts from the desktop Dock',
                style: MCETypography.sectionSubtitle,
              ),
            ],
          ),
        ),
        IconButton(
          tooltip: 'Refresh Multi-Views',
          onPressed: _loading ? null : _loadCards,
          icon: Icon(Icons.refresh),
          color: MCEColors.textSecondary,
        ),
      ],
    );
  }

  Widget _buildCard(_SavedMultiView card) {
    final active = card.id == _activeId;
    final assignments = card.assignments.values
        .map((value) => value.trim())
        .where((value) => value.isNotEmpty)
        .toList();
    return Container(
      margin: const EdgeInsets.only(bottom: MCESpacing.md),
      padding: const EdgeInsets.all(MCESpacing.md),
      decoration: BoxDecoration(
        color: MCEColors.surface,
        borderRadius: BorderRadius.circular(MCERadius.md),
        border: Border.all(
          color: active ? MCEColors.success : MCEColors.border,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                Icons.grid_view,
                color: active ? MCEColors.success : MCEColors.primaryBlue,
              ),
              SizedBox(width: MCESpacing.sm),
              Expanded(child: Text(card.name, style: MCETypography.cardTitle)),
              if (active)
                Text(
                  'PREVIEW',
                  style: TextStyle(
                    color: MCEColors.success,
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                  ),
                ),
            ],
          ),
          SizedBox(height: MCESpacing.sm),
          Text(
            '${card.layoutId.isEmpty ? 'Layout not selected' : card.layoutId} · ${assignments.length} assigned',
            style: MCETypography.caption,
          ),
          if (assignments.isNotEmpty) ...[
            SizedBox(height: MCESpacing.sm),
            Wrap(
              spacing: MCESpacing.xs,
              runSpacing: MCESpacing.xs,
              children: assignments
                  .map(
                    (assignment) => Chip(
                      label: Text(assignment, overflow: TextOverflow.ellipsis),
                      backgroundColor: MCEColors.elevated,
                      side: BorderSide(color: MCEColors.border),
                      labelStyle: MCETypography.tiny,
                    ),
                  )
                  .toList(),
            ),
          ],
          SizedBox(height: MCESpacing.md),
          Row(
            children: [
              Expanded(
                child: SizedBox(
                  height: 48,
                  child: FilledButton.icon(
                    onPressed: () => _preview(card),
                    icon: Icon(Icons.cast, size: 18),
                    label: Text(active ? 'Previewing' : 'Preview'),
                    style: FilledButton.styleFrom(
                      backgroundColor: active
                          ? MCEColors.success
                          : MCEColors.primaryBlue,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(MCERadius.md),
                      ),
                    ),
                  ),
                ),
              ),
              SizedBox(width: MCESpacing.sm),
              SizedBox(
                height: 48,
                child: OutlinedButton.icon(
                  onPressed: () => _clear(card),
                  icon: Icon(Icons.visibility_off, size: 18),
                  label: Text('Clear'),
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
          ),
        ],
      ),
    );
  }

  Widget _buildInfoBanner(String message) {
    return Container(
      margin: const EdgeInsets.only(bottom: MCESpacing.md),
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
            Icons.grid_view_outlined,
            size: 36,
            color: MCEColors.textTertiary,
          ),
          SizedBox(height: MCESpacing.md),
          Text('No saved Multi-Views', style: MCETypography.bodyBold),
          SizedBox(height: MCESpacing.xs),
          Text(
            'Create a Multi-View card in the desktop Dock and it will appear here.',
            textAlign: TextAlign.center,
            style: MCETypography.caption,
          ),
        ],
      ),
    );
  }
}

class _SavedMultiView {
  final String id;
  final String name;
  final String obsSceneName;
  final String layoutId;
  final Map<String, String> assignments;

  const _SavedMultiView({
    required this.id,
    required this.name,
    required this.obsSceneName,
    required this.layoutId,
    required this.assignments,
  });

  factory _SavedMultiView.fromJson(Map<String, dynamic> json) {
    final rawAssignments = json['assignments'];
    final assignments = <String, String>{};
    if (rawAssignments is Map) {
      for (final entry in rawAssignments.entries) {
        final value = entry.value?.toString() ?? '';
        if (value.isNotEmpty) assignments[entry.key.toString()] = value;
      }
    }
    return _SavedMultiView(
      id: json['id']?.toString() ?? '',
      name: json['name']?.toString() ?? 'Multi-View',
      obsSceneName: json['obsSceneName']?.toString() ?? '',
      layoutId: json['layoutId']?.toString() ?? '',
      assignments: assignments,
    );
  }
}
