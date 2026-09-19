import 'package:flutter/material.dart';

import '../models/scene_preview_mode.dart';
import '../services/desktop_service.dart';
import '../services/mce_provider.dart';
import '../services/mobile_preferences.dart';
import '../services/websocket_service.dart';
import '../theme/mce_theme.dart';
import 'connection_wizard_screen.dart';

class AppSettingsScreen extends StatefulWidget {
  const AppSettingsScreen({super.key});

  @override
  State<AppSettingsScreen> createState() => _AppSettingsScreenState();
}

class _AppSettingsScreenState extends State<AppSettingsScreen> {
  late final DesktopService _desktopService;
  late final WebSocketService _webSocketService;
  late final MobilePreferences _mobilePreferences;
  bool _reconnecting = false;
  bool _studioModeBusy = false;
  bool _studioModeEnabled = false;

  @override
  void initState() {
    super.initState();
    _desktopService = context.desktopService;
    _webSocketService = context.webSocketService;
    _mobilePreferences = context.mobilePreferences;
    _studioModeEnabled = _webSocketService.desktopState.studioModeEnabled;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _desktopService.addListener(_refresh);
      _webSocketService.addListener(_refresh);
      _mobilePreferences.addListener(_refresh);
    });
  }

  @override
  void dispose() {
    _desktopService.removeListener(_refresh);
    _webSocketService.removeListener(_refresh);
    _mobilePreferences.removeListener(_refresh);
    super.dispose();
  }

  void _refresh() {
    if (!mounted) return;
    setState(() {
      _studioModeEnabled = _webSocketService.desktopState.studioModeEnabled;
    });
  }

  Future<void> _setStudioMode(bool enabled) async {
    if (_studioModeBusy || !_webSocketService.isAuthenticated) return;
    setState(() {
      _studioModeBusy = true;
      _studioModeEnabled = enabled;
    });
    try {
      await _webSocketService.setStudioMode(enabled);
    } catch (error) {
      if (mounted) {
        setState(() => _studioModeEnabled = !enabled);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Could not update Studio Mode: $error'),
            backgroundColor: MCEColors.danger,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _studioModeBusy = false);
    }
  }

  Future<void> _reconnectSavedDesktop() async {
    final desktop = context.desktopService;
    if (desktop.pairingToken == null || desktop.currentDesktop?.ip == null) {
      _openConnectionSetup();
      return;
    }

    setState(() => _reconnecting = true);
    context.webSocketService.connect();
    await Future<void>.delayed(Duration(milliseconds: 900));
    if (!mounted) return;
    setState(() => _reconnecting = false);
    final connected = context.webSocketService.isAuthenticated;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          connected
              ? 'Connected to ${desktop.currentDesktop?.name ?? 'the desktop'}'
              : 'The desktop is not reachable yet. It will reconnect when it is available on this Wi-Fi.',
        ),
        backgroundColor: connected ? MCEColors.elevated : MCEColors.warning,
      ),
    );
  }

  void _openConnectionSetup() {
    Navigator.of(
      context,
    ).push(MaterialPageRoute(builder: (_) => ConnectionWizardScreen()));
  }

  @override
  Widget build(BuildContext context) {
    final desktop = context.desktopService;
    final webSocket = context.webSocketService;
    final info = desktop.currentDesktop;
    final connected = desktop.isConnected && webSocket.isAuthenticated;
    final hasSavedPairing = desktop.pairingToken != null;
    final savedName = info?.name?.trim();
    final computerName = info?.computerName?.trim();
    final desktopLabel =
        savedName != null &&
            savedName.isNotEmpty &&
            savedName != 'No desktop selected'
        ? savedName
        : computerName != null && computerName.isNotEmpty
        ? computerName
        : info?.ip != null
        ? 'Paired desktop'
        : 'No desktop selected';

    return Scaffold(
      backgroundColor: MCEColors.background,
      appBar: AppBar(
        title: Text('Settings'),
        backgroundColor: MCEColors.surface,
        foregroundColor: MCEColors.textPrimary,
        elevation: 0,
      ),
      body: ListView(
        padding: const EdgeInsets.all(MCESpacing.lg),
        children: [
          Text('General settings', style: MCETypography.sectionTitle),
          SizedBox(height: MCESpacing.xs),
          Text(
            'Phone settings for the mobile surface and live OBS controls.',
            style: MCETypography.caption.copyWith(
              color: MCEColors.textSecondary,
              height: 1.45,
            ),
          ),
          SizedBox(height: MCESpacing.md),
          _SettingsCard(
            child: DropdownButtonFormField<MCEThemePreference>(
              value: context.mobilePreferences.themePreference,
              decoration: InputDecoration(
                labelText: 'Appearance',
                helperText: 'Choose the Dock surface style for this phone.',
              ),
              items: const [
                DropdownMenuItem(
                  value: MCEThemePreference.dark,
                  child: Text('Dark mode'),
                ),
                DropdownMenuItem(
                  value: MCEThemePreference.light,
                  child: Text('Light mode'),
                ),
                DropdownMenuItem(
                  value: MCEThemePreference.system,
                  child: Text('Use device setting'),
                ),
              ],
              onChanged: (value) {
                if (value != null) {
                  context.mobilePreferences.setThemePreference(value);
                }
              },
            ),
          ),
          SizedBox(height: MCESpacing.xxl),
          Text('Desktop connection', style: MCETypography.sectionTitle),
          SizedBox(height: MCESpacing.xs),
          Text(
            'Keep this phone paired to the desktop on the same Wi-Fi. Use QR, network discovery, or manual setup whenever you need to change computers.',
            style: MCETypography.caption.copyWith(
              color: MCEColors.textSecondary,
              height: 1.45,
            ),
          ),
          SizedBox(height: MCESpacing.lg),
          _SettingsCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      width: 40,
                      height: 40,
                      decoration: BoxDecoration(
                        color:
                            (connected ? MCEColors.success : MCEColors.warning)
                                .withValues(alpha: 0.14),
                        borderRadius: BorderRadius.circular(MCERadius.sm),
                      ),
                      child: Icon(
                        connected ? Icons.link : Icons.link_off,
                        color: connected
                            ? MCEColors.success
                            : MCEColors.warning,
                      ),
                    ),
                    SizedBox(width: MCESpacing.md),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            desktopLabel,
                            style: MCETypography.bodyBold,
                            overflow: TextOverflow.ellipsis,
                          ),
                          SizedBox(height: 2),
                          Text(
                            connected
                                ? 'Connected and ready to control OBS'
                                : hasSavedPairing
                                ? 'Saved pairing · waiting for the desktop'
                                : 'Pair a desktop to control OBS',
                            style: MCETypography.caption.copyWith(
                              color: connected
                                  ? MCEColors.success
                                  : MCEColors.textSecondary,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                if (info?.ip != null) ...[
                  SizedBox(height: MCESpacing.md),
                  Text(
                    '${info!.ip}:${info.wsPort ?? 8765}',
                    style: MCETypography.caption.copyWith(
                      fontFamily: 'monospace',
                      color: MCEColors.textSecondary,
                    ),
                  ),
                ],
                SizedBox(height: MCESpacing.lg),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton.icon(
                    onPressed: _reconnecting ? null : _reconnectSavedDesktop,
                    icon: _reconnecting
                        ? SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : Icon(Icons.refresh),
                    label: Text(_reconnecting ? 'Reconnecting…' : 'Reconnect'),
                    style: FilledButton.styleFrom(
                      backgroundColor: MCEColors.primaryBlue,
                      foregroundColor: Colors.white,
                      minimumSize: const Size.fromHeight(46),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(MCERadius.md),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
          SizedBox(height: MCESpacing.md),
          _SettingsAction(
            icon: Icons.qr_code_scanner,
            title: 'Scan desktop QR code',
            subtitle:
                'Pair with the QR code shown in the desktop mobile connection settings.',
            onTap: _openConnectionSetup,
          ),
          SizedBox(height: MCESpacing.sm),
          _SettingsAction(
            icon: Icons.wifi_find,
            title: 'Find desktop on this Wi-Fi',
            subtitle:
                'Search the local network and keep the selected pairing saved.',
            onTap: _openConnectionSetup,
          ),
          SizedBox(height: MCESpacing.sm),
          _SettingsAction(
            icon: Icons.edit_outlined,
            title: 'Manual connection',
            subtitle: 'Enter a desktop IP address and pairing code.',
            onTap: _openConnectionSetup,
          ),
          SizedBox(height: MCESpacing.xxl),
          Text('Dock behavior', style: MCETypography.sectionTitle),
          SizedBox(height: MCESpacing.xs),
          Text(
            'Choose which actions on the phone should immediately control the desktop Dock and OBS output.',
            style: MCETypography.caption.copyWith(
              color: MCEColors.textSecondary,
              height: 1.45,
            ),
          ),
          SizedBox(height: MCESpacing.md),
          _SettingsCard(
            child: SwitchListTile.adaptive(
              contentPadding: EdgeInsets.zero,
              value: context.mobilePreferences.syncBibleSelectionToDock,
              onChanged: (value) =>
                  context.mobilePreferences.setSyncBibleSelectionToDock(value),
              activeThumbColor: MCEColors.primaryBlue,
              title: Text('Mirror Bible selections to Dock'),
              subtitle: Text(
                'Selecting a verse on mobile moves the same verse in the desktop Dock and OBS.',
              ),
            ),
          ),
          SizedBox(height: MCESpacing.xxl),
          Text('Media', style: MCETypography.sectionTitle),
          SizedBox(height: MCESpacing.xs),
          Text(
            'Control whether image cards load live previews from the desktop media folder.',
            style: MCETypography.caption.copyWith(
              color: MCEColors.textSecondary,
              height: 1.45,
            ),
          ),
          SizedBox(height: MCESpacing.md),
          _SettingsCard(
            child: SwitchListTile.adaptive(
              contentPadding: EdgeInsets.zero,
              value: context.mobilePreferences.showMediaImagePreviews,
              onChanged: context.mobilePreferences.setShowMediaImagePreviews,
              activeThumbColor: MCEColors.primaryBlue,
              title: Text('Show image previews'),
              subtitle: Text(
                'Turn this off to keep the Media tab from refreshing image thumbnails.',
              ),
            ),
          ),
          SizedBox(height: MCESpacing.xxl),
          Text('Scene cards and monitors', style: MCETypography.sectionTitle),
          SizedBox(height: MCESpacing.xs),
          Text(
            'Choose how the Scenes tab receives OBS screenshots. The desktop remains the source of truth for every scene and output state.',
            style: MCETypography.caption.copyWith(
              color: MCEColors.textSecondary,
              height: 1.45,
            ),
          ),
          SizedBox(height: MCESpacing.md),
          _SettingsCard(
            child: Column(
              children: [
                DropdownButtonFormField<ScenePreviewMode>(
                  value: context.mobilePreferences.scenePreviewMode,
                  decoration: InputDecoration(
                    labelText: 'Scene preview refresh',
                    helperText:
                        'Auto-refresh every five seconds is the Dock-style default.',
                  ),
                  items: [
                    for (final mode in ScenePreviewMode.values)
                      DropdownMenuItem<ScenePreviewMode>(
                        value: mode,
                        child: Text(mode.label),
                      ),
                  ],
                  onChanged: (value) {
                    if (value != null) {
                      context.mobilePreferences.setScenePreviewMode(value);
                    }
                  },
                ),
                SizedBox(height: MCESpacing.md),
                SwitchListTile.adaptive(
                  contentPadding: EdgeInsets.zero,
                  value: _studioModeEnabled,
                  onChanged: _studioModeBusy ? null : _setStudioMode,
                  activeThumbColor: MCEColors.primaryBlue,
                  title: Text('Enable Studio Mode'),
                  subtitle: Text(
                    _studioModeBusy
                        ? 'Updating OBS…'
                        : 'Use Preview and Program scenes for two-step transitions.',
                  ),
                ),
                Divider(color: MCEColors.border),
                SwitchListTile.adaptive(
                  contentPadding: EdgeInsets.zero,
                  value: context.mobilePreferences.showSceneProgramMonitor,
                  onChanged:
                      context.mobilePreferences.setShowSceneProgramMonitor,
                  activeThumbColor: MCEColors.primaryBlue,
                  title: Text('Show Live monitor'),
                  subtitle: Text(
                    'Show the scene currently on OBS program output.',
                  ),
                ),
                SwitchListTile.adaptive(
                  contentPadding: EdgeInsets.zero,
                  value: context.mobilePreferences.showScenePreviewMonitor,
                  onChanged:
                      context.mobilePreferences.setShowScenePreviewMonitor,
                  activeThumbColor: MCEColors.primaryBlue,
                  title: Text('Show Preview monitor'),
                  subtitle: Text('Show the scene queued in OBS Studio Mode.'),
                ),
              ],
            ),
          ),
          SizedBox(height: MCESpacing.xxl),
          Text('About this app', style: MCETypography.cardTitle),
          SizedBox(height: MCESpacing.sm),
          Text(
            'MakeChurchEasy Mobile is the Dock remote: Bible, Text, Media, Scenes, Ministry, macros, and automations are sent to the paired desktop and rendered through its OBS presentation layer. Multi-View remains desktop-only.',
            style: MCETypography.caption.copyWith(
              color: MCEColors.textSecondary,
              height: 1.5,
            ),
          ),
        ],
      ),
    );
  }
}

class _SettingsCard extends StatelessWidget {
  final Widget child;

  const _SettingsCard({required this.child});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(MCESpacing.lg),
      decoration: BoxDecoration(
        color: MCEColors.surface,
        borderRadius: BorderRadius.circular(MCERadius.md),
        border: Border.all(color: MCEColors.border),
      ),
      child: child,
    );
  }
}

class _SettingsAction extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  const _SettingsAction({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: MCEColors.surface,
      borderRadius: BorderRadius.circular(MCERadius.md),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(MCERadius.md),
        child: Container(
          padding: const EdgeInsets.all(MCESpacing.md),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(MCERadius.md),
            border: Border.all(color: MCEColors.border),
          ),
          child: Row(
            children: [
              Icon(icon, color: MCEColors.primaryBlue),
              SizedBox(width: MCESpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: MCETypography.bodyBold),
                    SizedBox(height: 2),
                    Text(
                      subtitle,
                      style: MCETypography.caption.copyWith(
                        color: MCEColors.textSecondary,
                        height: 1.35,
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
}
