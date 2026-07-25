import 'package:flutter/material.dart';
import '../theme/mce_theme.dart';
import '../models/sample_data.dart';
import '../widgets/mce_badge.dart';
import 'automation_screen.dart';

class ScenesScreen extends StatefulWidget {
  const ScenesScreen({super.key});

  @override
  State<ScenesScreen> createState() => _ScenesScreenState();
}

class _ScenesScreenState extends State<ScenesScreen> {
  // Stream/Record state
  bool _isStreaming = false;
  bool _isRecording = false;
  bool _isMicMuted = false;
  bool _showBRB = false;
  bool _isSafe = false;

  // Scene state
  String? _previewSceneId;
  String _liveSceneId = 's1';

  void _toggleStream() {
    setState(() => _isStreaming = !_isStreaming);
  }

  void _toggleRecord() {
    setState(() => _isRecording = !_isRecording);
  }

  void _toggleMic() {
    setState(() => _isMicMuted = !_isMicMuted);
  }

  void _toggleBRB() {
    setState(() => _showBRB = !_showBRB);
  }

  void _toggleSafe() {
    setState(() => _isSafe = !_isSafe);
  }

  void _emergencyReset() {
    setState(() {
      _isStreaming = false;
      _isRecording = false;
      _isMicMuted = false;
      _showBRB = false;
      _isSafe = false;
      _previewSceneId = null;
    });
  }

  void _previewScene(String id) {
    setState(() => _previewSceneId = id);
  }

  void _pushLive(String id) {
    setState(() {
      _liveSceneId = id;
      _previewSceneId = null;
    });
  }

  String get _previewSceneName {
    if (_previewSceneId == null) return 'None';
    final scene = sampleScenes.firstWhere((s) => s.id == _previewSceneId);
    return scene.name;
  }

  String get _liveSceneName {
    final scene = sampleScenes.firstWhere((s) => s.id == _liveSceneId);
    return scene.name;
  }

  void _openAutomation() {
    Navigator.of(context).push(
      MaterialPageRoute(
        fullscreenDialog: true,
        builder: (_) => const AutomationScreen(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(MCESpacing.lg),
      children: [
        // Quick Actions
        _buildQuickActions(),
        const SizedBox(height: MCESpacing.xl),

        // Preview / Program
        _buildPreviewProgram(),
        const SizedBox(height: MCESpacing.xl),

        // Scene Switcher
        _buildSceneSwitcher(),
        const SizedBox(height: MCESpacing.xl),

        // Automation button
        _buildAutomationButton(),
        const SizedBox(height: MCESpacing.lg),
      ],
    );
  }

  Widget _buildQuickActions() {
    return SizedBox(
      height: 44,
      child: ListView(
        scrollDirection: Axis.horizontal,
        children: [
          _QuickAction(
            label: _isStreaming ? 'Stop Stream' : 'Start Stream',
            icon: _isStreaming ? Icons.stop : Icons.wifi,
            color: _isStreaming ? MCEColors.danger : MCEColors.textSecondary,
            onTap: _toggleStream,
          ),
          const SizedBox(width: 8),
          _QuickAction(
            label: _isRecording ? 'Stop Rec' : 'Start Rec',
            icon: _isRecording ? Icons.stop : Icons.fiber_manual_record,
            color: _isRecording ? MCEColors.danger : MCEColors.textSecondary,
            onTap: _toggleRecord,
          ),
          const SizedBox(width: 8),
          _QuickAction(
            label: _isMicMuted ? 'Unmute Mic' : 'Mute Mic',
            icon: _isMicMuted ? Icons.mic_off : Icons.mic,
            color: _isMicMuted ? MCEColors.warning : MCEColors.textSecondary,
            onTap: _toggleMic,
          ),
          const SizedBox(width: 8),
          _QuickAction(
            label: _showBRB ? 'Hide BRB' : 'Show BRB',
            icon: Icons.pause_circle_outline,
            color: _showBRB ? MCEColors.primaryPurple : MCEColors.textSecondary,
            onTap: _toggleBRB,
          ),
          const SizedBox(width: 8),
          _QuickAction(
            label: _isSafe ? 'Unsafe' : 'Go Safe',
            icon: Icons.shield_outlined,
            color: _isSafe ? MCEColors.accentOrange : MCEColors.textSecondary,
            onTap: _toggleSafe,
          ),
          const SizedBox(width: 8),
          _QuickAction(
            label: 'Reset',
            icon: Icons.refresh,
            color: MCEColors.textTertiary,
            onTap: _emergencyReset,
          ),
        ],
      ),
    );
  }

  Widget _buildPreviewProgram() {
    return Row(
      children: [
        Expanded(
          child: _MonitorCard(
            label: 'PREVIEW',
            sceneName: _previewSceneName,
            color: MCEColors.secondaryBlue,
            isActive: _previewSceneId != null,
          ),
        ),
        const SizedBox(width: MCESpacing.md),
        Expanded(
          child: _MonitorCard(
            label: 'LIVE',
            sceneName: _liveSceneName,
            color: MCEColors.success,
            isActive: true,
          ),
        ),
      ],
    );
  }

  Widget _buildSceneSwitcher() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('Scenes', style: MCETypography.sectionTitle),
        const SizedBox(height: MCESpacing.md),
        SizedBox(
          height: 120,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: sampleScenes.length,
            separatorBuilder: (_, _) => const SizedBox(width: MCESpacing.md),
            itemBuilder: (context, i) {
              final scene = sampleScenes[i];
              final isPreview = _previewSceneId == scene.id;
              final isLive = _liveSceneId == scene.id;
              return _SceneCard(
                scene: scene,
                isPreview: isPreview,
                isLive: isLive,
                onTap: () => _previewScene(scene.id),
                onDoubleTap: () => _pushLive(scene.id),
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _buildAutomationButton() {
    return GestureDetector(
      onTap: _openAutomation,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(vertical: MCESpacing.md),
        decoration: BoxDecoration(
          color: MCEColors.primaryPurple,
          borderRadius: BorderRadius.circular(MCERadius.md),
        ),
        child: const Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.smart_toy_outlined, color: Colors.white, size: 20),
            SizedBox(width: MCESpacing.sm),
            Text(
              'Automation',
              style: TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w600,
                color: Colors.white,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _QuickAction extends StatelessWidget {
  final String label;
  final IconData icon;
  final Color color;
  final VoidCallback onTap;

  const _QuickAction({
    required this.label,
    required this.icon,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: MCEColors.elevated,
          borderRadius: BorderRadius.circular(MCERadius.sm),
          border: Border.all(
            color: color == MCEColors.textSecondary
                ? MCEColors.border
                : color.withValues(alpha: 0.3),
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 16, color: color),
            const SizedBox(width: 6),
            Text(
              label,
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: color,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _MonitorCard extends StatelessWidget {
  final String label;
  final String sceneName;
  final Color color;
  final bool isActive;

  const _MonitorCard({
    required this.label,
    required this.sceneName,
    required this.color,
    required this.isActive,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 120,
      decoration: BoxDecoration(
        color: MCEColors.surface.withValues(alpha: 0.6),
        borderRadius: BorderRadius.circular(MCERadius.md),
        border: Border.all(
          color: isActive
              ? color.withValues(alpha: 0.5)
              : MCEColors.border,
          width: 1,
        ),
        boxShadow: [
          if (isActive)
            BoxShadow(
              color: color.withValues(alpha: 0.1),
              blurRadius: 10,
            ),
        ],
      ),
      child: Column(
        children: [
          Expanded(
            flex: 65,
            child: Container(
              width: double.infinity,
              decoration: const BoxDecoration(
                color: Colors.black,
                borderRadius: BorderRadius.only(
                  topLeft: Radius.circular(MCERadius.md),
                  topRight: Radius.circular(MCERadius.md),
                ),
              ),
              child: Center(
                child: Icon(
                  label == 'LIVE' ? Icons.live_tv : Icons.preview,
                  color: MCEColors.textSecondary.withValues(alpha: 0.3),
                  size: 32,
                ),
              ),
            ),
          ),
          Expanded(
            flex: 35,
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 8),
              decoration: const BoxDecoration(
                color: MCEColors.surface,
                borderRadius: BorderRadius.only(
                  bottomLeft: Radius.circular(MCERadius.md),
                  bottomRight: Radius.circular(MCERadius.md),
                ),
              ),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    sceneName,
                    style: const TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: MCEColors.textPrimary,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  Text(
                    label,
                    style: TextStyle(
                      fontSize: 9,
                      fontWeight: FontWeight.w700,
                      color: color,
                      letterSpacing: 0.5,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _SceneCard extends StatelessWidget {
  final SceneData scene;
  final bool isPreview;
  final bool isLive;
  final VoidCallback onTap;
  final VoidCallback onDoubleTap;

  const _SceneCard({
    required this.scene,
    required this.isPreview,
    required this.isLive,
    required this.onTap,
    required this.onDoubleTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      onDoubleTap: onDoubleTap,
      child: Container(
        width: 140,
        decoration: BoxDecoration(
          color: MCEColors.surface.withValues(alpha: 0.6),
          borderRadius: BorderRadius.circular(MCERadius.md),
          border: Border.all(
            color: isPreview
                ? MCEColors.secondaryBlue
                : isLive
                    ? MCEColors.success
                    : MCEColors.border,
            width: isPreview || isLive ? 2 : 1,
          ),
          boxShadow: [
            if (isPreview || isLive)
              BoxShadow(
                color: (isPreview ? MCEColors.secondaryBlue : MCEColors.success)
                    .withValues(alpha: 0.15),
                blurRadius: 8,
              ),
          ],
        ),
        child: Column(
          children: [
            Expanded(
              flex: 65,
              child: Stack(
                children: [
                  Container(
                    width: double.infinity,
                    decoration: const BoxDecoration(
                      color: Colors.black,
                      borderRadius: BorderRadius.only(
                        topLeft: Radius.circular(MCERadius.md),
                        topRight: Radius.circular(MCERadius.md),
                      ),
                    ),
                  ),
                  if (isPreview)
                    Positioned(
                      top: 4,
                      left: 4,
                      child: MCEBadge.preview(),
                    ),
                  if (isLive)
                    Positioned(
                      top: 4,
                      left: 4,
                      child: MCEBadge.live(),
                    ),
                ],
              ),
            ),
            Expanded(
              flex: 35,
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(horizontal: 8),
                decoration: const BoxDecoration(color: MCEColors.surface),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      scene.name,
                      style: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: MCEColors.textPrimary,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const Text(
                      'Tap to preview • Double-tap to push live',
                      style: TextStyle(
                        fontSize: 8,
                        color: MCEColors.textTertiary,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
