import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../services/mce_provider.dart';
import '../theme/mce_theme.dart';

/// The compact mobile equivalent of DockOutputQuickActions.
///
/// Values are read from and written to the desktop Dock. The phone keeps only
/// an optimistic visual copy while the desktop remains the source of truth.
class DockQuickControls extends StatefulWidget {
  final String surface;
  final Color? fallbackBackgroundColor;
  final String? title;
  final int maxLineCount;
  final VoidCallback? onControlsChanged;

  const DockQuickControls({
    super.key,
    required this.surface,
    this.fallbackBackgroundColor,
    this.title,
    this.maxLineCount = 12,
    this.onControlsChanged,
  });

  @override
  State<DockQuickControls> createState() => _DockQuickControlsState();
}

class _DockQuickControlsState extends State<DockQuickControls> {
  bool _open = false;
  bool _loading = false;
  bool _saving = false;
  bool _autoFit = true;
  double _fontSize = 48;
  int _lineCount = 1;
  String _lineMode = 'count';
  Color _backgroundColor = MCEColors.background;
  Color _textColor = MCEColors.textPrimary;
  bool _hasDesktopStyle = false;
  bool _alignLeft = false;
  double _dragDeltaX = 0;
  final LayerLink _quickLayerLink = LayerLink();
  final OverlayPortalController _overlayPortalController =
      OverlayPortalController();

  @override
  void initState() {
    super.initState();
    _backgroundColor = widget.fallbackBackgroundColor ?? MCEColors.background;
  }

  @override
  void didUpdateWidget(covariant DockQuickControls oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.fallbackBackgroundColor != widget.fallbackBackgroundColor &&
        !_hasDesktopStyle &&
        widget.fallbackBackgroundColor != null) {
      setState(() => _backgroundColor = widget.fallbackBackgroundColor!);
    }
  }

  Color _parseColor(Object? value, Color fallback) {
    final raw = value?.toString().trim();
    if (raw == null || raw.isEmpty || raw == 'transparent') return fallback;
    final normalized = raw.replaceFirst('#', '');
    final hex = normalized.length == 6 ? 'FF$normalized' : normalized;
    final parsed = int.tryParse(hex, radix: 16);
    return parsed == null ? fallback : Color(parsed);
  }

  Color _foregroundFor(Color color) {
    return color.computeLuminance() > 0.52
        ? MCEColors.lightTextPrimary
        : MCEColors.textPrimary;
  }

  Future<void> _loadStyle() async {
    final webSocket = context.webSocketService;
    if (!webSocket.isAuthenticated) return;
    if (mounted) setState(() => _loading = true);
    try {
      final style = await webSocket.getTextPresentationStyle(widget.surface);
      final preview = style['preview'];
      final previewMap = preview is Map
          ? Map<String, dynamic>.from(preview)
          : const <String, dynamic>{};
      final settings = style['themeSettings'];
      final settingsMap = settings is Map
          ? Map<String, dynamic>.from(settings)
          : const <String, dynamic>{};
      if (!mounted) return;
      setState(() {
        _backgroundColor = _parseColor(
          previewMap['backgroundColor'],
          widget.fallbackBackgroundColor ?? MCEColors.background,
        );
        _textColor = _foregroundFor(
          _parseColor(previewMap['fontColor'], MCEColors.textPrimary),
        );
        _autoFit = settingsMap['autoFontScale'] == true;
        final fontSize = settingsMap['fontSize'];
        if (fontSize is num && fontSize > 0) _fontSize = fontSize.toDouble();
        final lineCount = style['lineCount'];
        if (lineCount is num) {
          _lineCount = lineCount.toInt().clamp(1, widget.maxLineCount).toInt();
        }
        final lineMode = style['lineMode']?.toString();
        if (lineMode == 'original' || lineMode == 'count') {
          _lineMode = lineMode!;
        }
        _alignLeft = style['quickAlignment']?.toString() == 'left';
        _hasDesktopStyle = true;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _toggleOpen() {
    final nextOpen = !_open;
    setState(() => _open = nextOpen);
    if (nextOpen) {
      _overlayPortalController.show();
      unawaited(_loadStyle());
    } else {
      _overlayPortalController.hide();
    }
  }

  Future<void> _save({
    Map<String, dynamic>? patch,
    int? lineCount,
    String? lineMode,
    String? quickAlignment,
  }) async {
    final webSocket = context.webSocketService;
    if (!webSocket.isAuthenticated) return;
    if (mounted) setState(() => _saving = true);
    try {
      final style = await webSocket.saveTextPresentationControls(
        surface: widget.surface,
        patch: patch,
        lineCount: lineCount,
        lineMode: lineMode,
        quickAlignment: quickAlignment,
      );
      if (!mounted) return;
      final preview = style['preview'];
      final previewMap = preview is Map
          ? Map<String, dynamic>.from(preview)
          : const <String, dynamic>{};
      setState(() {
        _backgroundColor = _parseColor(
          previewMap['backgroundColor'],
          _backgroundColor,
        );
        _textColor = _foregroundFor(
          _parseColor(previewMap['fontColor'], _textColor),
        );
        final returnedLineCount = style['lineCount'];
        if (returnedLineCount is num) {
          _lineCount = returnedLineCount
              .toInt()
              .clamp(1, widget.maxLineCount)
              .toInt();
        }
        final returnedLineMode = style['lineMode']?.toString();
        if (returnedLineMode == 'original' || returnedLineMode == 'count') {
          _lineMode = returnedLineMode!;
        }
        _saving = false;
      });
      widget.onControlsChanged?.call();
    } catch (_) {
      if (mounted) setState(() => _saving = false);
    }
  }

  String get _lineLabel {
    if (widget.surface == 'worship') return 'Lines per slide';
    if (widget.surface == 'notes') return 'Lines per note';
    return 'Verses per output';
  }

  void _handleDragStart(DragStartDetails details) {
    _dragDeltaX = 0;
  }

  void _handleDragUpdate(DragUpdateDetails details) {
    _dragDeltaX += details.delta.dx;
  }

  void _handleDragEnd(DragEndDetails details) {
    final delta = _dragDeltaX + details.velocity.pixelsPerSecond.dx * 0.04;
    _dragDeltaX = 0;
    if (delta.abs() < 18) return;
    final nextAlignLeft = delta < 0;
    if (nextAlignLeft == _alignLeft) return;
    setState(() => _alignLeft = nextAlignLeft);
    unawaited(_save(quickAlignment: nextAlignLeft ? 'left' : 'right'));
  }

  @override
  Widget build(BuildContext context) {
    final panelColor = _hasDesktopStyle
        ? _backgroundColor
        : (widget.fallbackBackgroundColor ?? MCEColors.background);
    final panelTextColor = _foregroundFor(panelColor);
    final mutedColor = panelTextColor == MCEColors.textPrimary
        ? MCEColors.textSecondary
        : MCEColors.lightTextSecondary;

    return SizedBox(
      width: double.infinity,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          OverlayPortal(
            controller: _overlayPortalController,
            overlayChildBuilder: (overlayContext) =>
                CompositedTransformFollower(
                  link: _quickLayerLink,
                  targetAnchor: _alignLeft
                      ? Alignment.bottomLeft
                      : Alignment.bottomRight,
                  followerAnchor: _alignLeft
                      ? Alignment.topLeft
                      : Alignment.topRight,
                  offset: const Offset(0, MCESpacing.sm),
                  showWhenUnlinked: false,
                  child: UnconstrainedBox(
                    alignment: _alignLeft
                        ? Alignment.topLeft
                        : Alignment.topRight,
                    child: SizedBox(
                      width: math.min(
                        330,
                        MediaQuery.sizeOf(overlayContext).width - 32,
                      ),
                      child: _buildPanel(overlayContext),
                    ),
                  ),
                ),
            child: Align(
              alignment: _alignLeft
                  ? Alignment.centerLeft
                  : Alignment.centerRight,
              child: CompositedTransformTarget(
                link: _quickLayerLink,
                child: GestureDetector(
                  onTap: _toggleOpen,
                  onHorizontalDragStart: _handleDragStart,
                  onHorizontalDragUpdate: _handleDragUpdate,
                  onHorizontalDragEnd: _handleDragEnd,
                  child: Container(
                    height: 34,
                    padding: const EdgeInsets.symmetric(
                      horizontal: MCESpacing.sm,
                    ),
                    decoration: BoxDecoration(
                      color: panelColor,
                      borderRadius: BorderRadius.circular(MCERadius.sm),
                      border: Border.all(color: MCEColors.border),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.tune, size: 15, color: panelTextColor),
                        const SizedBox(width: MCESpacing.xs),
                        Text(
                          'Quick',
                          style: MCETypography.tiny.copyWith(
                            color: panelTextColor,
                          ),
                        ),
                        const SizedBox(width: MCESpacing.xs),
                        Icon(
                          _open ? Icons.expand_less : Icons.expand_more,
                          size: 15,
                          color: mutedColor,
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPanel(BuildContext context) {
    final panelColor = _hasDesktopStyle
        ? _backgroundColor
        : (widget.fallbackBackgroundColor ?? MCEColors.background);
    final panelTextColor = _foregroundFor(panelColor);
    final mutedColor = panelTextColor == MCEColors.textPrimary
        ? MCEColors.textSecondary
        : MCEColors.lightTextSecondary;
    final lineValue = widget.surface == 'bible'
        ? _lineCount.toString()
        : (_lineMode == 'original' ? 'original' : _lineCount.toString());

    return Container(
      width: math.min(330, MediaQuery.sizeOf(context).width - 32),
      padding: const EdgeInsets.all(MCESpacing.md),
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
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  widget.title ?? 'Dock output controls',
                  style: MCETypography.bodyBold.copyWith(color: panelTextColor),
                ),
              ),
              if (_loading || _saving)
                SizedBox(
                  width: 14,
                  height: 14,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: panelTextColor,
                  ),
                )
              else
                IconButton(
                  tooltip: 'Refresh from Dock',
                  onPressed: _loadStyle,
                  icon: Icon(Icons.refresh, size: 16, color: mutedColor),
                  visualDensity: VisualDensity.compact,
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(
                    minWidth: 28,
                    minHeight: 28,
                  ),
                ),
            ],
          ),
          const SizedBox(height: MCESpacing.sm),
          _ControlRow(
            title: 'Fit text to frame',
            subtitle: 'Shrink text when the frame is full',
            textColor: panelTextColor,
            mutedColor: mutedColor,
            trailing: Switch(
              value: _autoFit,
              onChanged: (value) {
                setState(() => _autoFit = value);
                unawaited(_save(patch: {'autoFontScale': value}));
              },
              activeThumbColor: MCEColors.primaryBlue,
            ),
          ),
          const SizedBox(height: MCESpacing.sm),
          _ControlRow(
            title: 'Text size',
            subtitle: '${_fontSize.round()} px',
            textColor: panelTextColor,
            mutedColor: mutedColor,
            trailing: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                IconButton(
                  tooltip: 'Decrease text size',
                  onPressed: _autoFit || _fontSize <= 14
                      ? null
                      : () {
                          final next = (_fontSize - 4).clamp(14, 200);
                          setState(() => _fontSize = next.toDouble());
                          unawaited(_save(patch: {'fontSize': _fontSize}));
                        },
                  icon: Icon(Icons.remove, size: 16, color: mutedColor),
                  visualDensity: VisualDensity.compact,
                ),
                IconButton(
                  tooltip: 'Increase text size',
                  onPressed: _autoFit || _fontSize >= 200
                      ? null
                      : () {
                          final next = (_fontSize + 4).clamp(14, 200);
                          setState(() => _fontSize = next.toDouble());
                          unawaited(_save(patch: {'fontSize': _fontSize}));
                        },
                  icon: Icon(Icons.add, size: 16, color: mutedColor),
                  visualDensity: VisualDensity.compact,
                ),
              ],
            ),
          ),
          const SizedBox(height: MCESpacing.sm),
          Text(
            _lineLabel,
            style: MCETypography.captionBold.copyWith(color: panelTextColor),
          ),
          const SizedBox(height: MCESpacing.xs),
          DropdownButtonFormField<String>(
            initialValue: lineValue,
            dropdownColor: panelColor,
            decoration: InputDecoration(
              isDense: true,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(MCERadius.sm),
                borderSide: BorderSide(color: MCEColors.border),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(MCERadius.sm),
                borderSide: BorderSide(color: MCEColors.border),
              ),
            ),
            items: [
              if (widget.surface != 'bible')
                DropdownMenuItem(
                  value: 'original',
                  child: Text(
                    'Original',
                    style: MCETypography.caption.copyWith(
                      color: panelTextColor,
                    ),
                  ),
                ),
              ...List.generate(widget.maxLineCount, (index) {
                final count = index + 1;
                return DropdownMenuItem(
                  value: '$count',
                  child: Text(
                    '$count ${count == 1 ? 'line' : 'lines'}',
                    style: MCETypography.caption.copyWith(
                      color: panelTextColor,
                    ),
                  ),
                );
              }),
            ],
            onChanged: (value) {
              if (value == null) return;
              if (value == 'original') {
                setState(() => _lineMode = 'original');
                unawaited(_save(lineMode: 'original'));
                return;
              }
              final count = int.tryParse(value);
              if (count == null) return;
              setState(() {
                _lineMode = 'count';
                _lineCount = count;
              });
              unawaited(_save(lineCount: count, lineMode: 'count'));
            },
          ),
        ],
      ),
    );
  }
}

class _ControlRow extends StatelessWidget {
  final String title;
  final String subtitle;
  final Color textColor;
  final Color mutedColor;
  final Widget trailing;

  const _ControlRow({
    required this.title,
    required this.subtitle,
    required this.textColor,
    required this.mutedColor,
    required this.trailing,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: MCETypography.captionBold.copyWith(color: textColor),
              ),
              const SizedBox(height: 2),
              Text(
                subtitle,
                style: MCETypography.tiny.copyWith(color: mutedColor),
              ),
            ],
          ),
        ),
        trailing,
      ],
    );
  }
}
