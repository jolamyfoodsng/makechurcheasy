import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../theme/mce_theme.dart';
import '../services/mce_provider.dart';
import '../models/desktop_models.dart';
import 'bible_screen.dart';
import 'worship_screen.dart';
import 'ministry_screen.dart';
import 'media_screen.dart';
import 'desktop_offline_screen.dart';
import 'connection_wizard_screen.dart';
import 'scenes_screen.dart';
import 'app_settings_screen.dart';
import 'automation_screen.dart';
import '../widgets/mce_brand_logo.dart';

class AppShell extends StatefulWidget {
  const AppShell({super.key});

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  final _scaffoldKey = GlobalKey<ScaffoldState>();
  int _currentTabIndex = 0;
  int _sendFileRequest = 0;

  static const _tabNames = ['Scenes', 'Bible', 'Text', 'Media', 'Ministry'];
  static const _tabIcons = [
    Icons.video_library_outlined,
    Icons.menu_book_outlined,
    Icons.text_fields,
    Icons.perm_media_outlined,
    Icons.campaign_outlined,
  ];

  static const _tabActiveIcons = [
    Icons.video_library,
    Icons.menu_book,
    Icons.text_fields,
    Icons.perm_media,
    Icons.campaign,
  ];

  @override
  void initState() {
    super.initState();
    // Listen for desktop connection status changes
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.desktopService.addListener(_onDesktopStatusChanged);
      context.webSocketService.addListener(_onWebSocketChanged);
    });
  }

  void _onDesktopStatusChanged() {
    if (!mounted) return;
    final desktop = context.desktopService;
    setState(() {});
    if (desktop.connection?.status == ConnectionStatus.disconnected) {
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => DesktopOfflineScreen()),
      );
    }
  }

  void _onWebSocketChanged() {
    if (mounted) setState(() {});
  }

  String? _desktopAddress(DesktopInfo? info) {
    final ip = info?.ip?.trim();
    if (ip == null || ip.isEmpty) return null;
    return '$ip:${info?.wsPort ?? 8765}';
  }

  Future<void> _copyDesktopAddress(String address) async {
    await Clipboard.setData(ClipboardData(text: address));
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('Desktop address copied'),
        duration: Duration(seconds: 2),
      ),
    );
  }

  @override
  void dispose() {
    // Safe to call removeListener even if not added
    try {
      context.desktopService.removeListener(_onDesktopStatusChanged);
      context.webSocketService.removeListener(_onWebSocketChanged);
    } catch (_) {}
    super.dispose();
  }

  Widget _buildHeader() {
    if (_currentTabIndex == 0 || _currentTabIndex == 4) {
      return SafeArea(
        bottom: false,
        child: SizedBox(
          height: 24,
          child: Align(
            alignment: Alignment.centerLeft,
            child: IconButton(
              visualDensity: VisualDensity.compact,
              padding: EdgeInsets.zero,
              tooltip: 'Open menu',
              onPressed: () => _scaffoldKey.currentState?.openDrawer(),
              icon: Icon(Icons.menu, color: MCEColors.textPrimary),
            ),
          ),
        ),
      );
    }

    final desktop = context.desktopService;
    final desktopInfo = desktop.currentDesktop;
    final desktopAddress = _desktopAddress(desktopInfo);
    final isConnected =
        desktop.isConnected && context.webSocketService.isAuthenticated;
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: MCESpacing.lg,
        vertical: MCESpacing.xs,
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
              tooltip: 'Open menu',
              onPressed: () => _scaffoldKey.currentState?.openDrawer(),
              icon: Icon(Icons.menu, color: MCEColors.textPrimary),
            ),
            SizedBox(width: MCESpacing.xs),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'OBS Dock Remote',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      color: MCEColors.textPrimary,
                    ),
                  ),
                  SizedBox(height: 2),
                  Row(
                    children: [
                      Text(
                        'MakeChurchEasy',
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w500,
                          color: MCEColors.textSecondary,
                        ),
                      ),
                      if (desktopAddress != null) ...[
                        SizedBox(width: MCESpacing.sm),
                        Container(
                          width: 3,
                          height: 3,
                          decoration: BoxDecoration(
                            color: MCEColors.textTertiary,
                            shape: BoxShape.circle,
                          ),
                        ),
                        SizedBox(width: MCESpacing.sm),
                        Flexible(
                          child: InkWell(
                            onTap: () => _copyDesktopAddress(desktopAddress),
                            borderRadius: BorderRadius.circular(MCERadius.sm),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Flexible(
                                  child: Text(
                                    desktopAddress,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(
                                      fontSize: 10,
                                      fontWeight: FontWeight.w600,
                                      color: MCEColors.textSecondary,
                                      fontFeatures: [
                                        FontFeature.tabularFigures(),
                                      ],
                                    ),
                                  ),
                                ),
                                SizedBox(width: MCESpacing.xs),
                                Icon(
                                  Icons.copy_outlined,
                                  size: 12,
                                  color: MCEColors.textTertiary,
                                ),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                ],
              ),
            ),

            // Connection status indicator
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: (isConnected ? MCEColors.success : MCEColors.danger)
                    .withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(6),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 6,
                    height: 6,
                    decoration: BoxDecoration(
                      color: isConnected ? MCEColors.success : MCEColors.danger,
                      shape: BoxShape.circle,
                    ),
                  ),
                  SizedBox(width: 4),
                  Text(
                    isConnected ? 'Connected' : 'Offline',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: isConnected ? MCEColors.success : MCEColors.danger,
                      letterSpacing: 0.5,
                    ),
                  ),
                ],
              ),
            ),
            SizedBox(width: MCESpacing.sm),
            InkWell(
              borderRadius: BorderRadius.circular(24),
              onTap: () => _showProfileMenu(),
              child: Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: MCEColors.primaryBlue,
                  shape: BoxShape.circle,
                ),
                child: Center(
                  child: Padding(
                    padding: EdgeInsets.all(9),
                    child: MCEBrandMark(size: 22),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _showProfileMenu() {
    final desktopInfo = context.desktopService.currentDesktop;

    showModalBottomSheet(
      context: context,
      backgroundColor: MCEColors.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(MCERadius.lg)),
      ),
      builder: (_) => Padding(
        padding: const EdgeInsets.all(MCESpacing.xxl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                CircleAvatar(
                  radius: 24,
                  backgroundColor: MCEColors.primaryBlue,
                  child: Padding(
                    padding: EdgeInsets.all(9),
                    child: MCEBrandMark(size: 30),
                  ),
                ),
                SizedBox(width: MCESpacing.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        desktopInfo?.name ??
                            desktopInfo?.computerName ??
                            'Paired Desktop',
                        style: MCETypography.bodyBold,
                      ),
                      Text(
                        desktopInfo?.ip ?? 'Wi-Fi remote',
                        style: MCETypography.caption.copyWith(
                          color: MCEColors.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            SizedBox(height: MCESpacing.xxl),
            Divider(color: MCEColors.border),
            SizedBox(height: MCESpacing.md),

            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: Icon(
                Icons.settings_outlined,
                color: MCEColors.primaryBlue,
              ),
              title: Text('Settings'),
              subtitle: Text('Connection, QR, and Wi-Fi discovery'),
              onTap: () {
                Navigator.of(context).pop();
                Navigator.of(
                  context,
                ).push(MaterialPageRoute(builder: (_) => AppSettingsScreen()));
              },
            ),

            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: Icon(Icons.link_off, color: MCEColors.danger),
              title: Text(
                'Disconnect Desktop',
                style: TextStyle(color: MCEColors.danger),
              ),
              onTap: () async {
                Navigator.of(context).pop();
                context.webSocketService.disconnect();
                await context.desktopService.disconnect();
                if (!mounted) return;
                Navigator.of(context).pushReplacement(
                  MaterialPageRoute(builder: (_) => ConnectionWizardScreen()),
                );
              },
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildBody() {
    // Keep every Dock tab mounted. Bible data, media catalog state, and the
    // desktop connection must stay warm while the operator moves between tabs.
    return IndexedStack(
      index: _currentTabIndex,
      children: [
        ScenesScreen(),
        BibleScreen(),
        WorshipScreen(),
        MediaScreen(openFilePickerRequest: _sendFileRequest),
        MinistryScreen(),
      ],
    );
  }

  void _openAutomation({int tab = 0}) {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => AutomationScreen(initialTab: tab)),
    );
  }

  Widget _buildDrawer() {
    final isConnected =
        context.desktopService.isConnected &&
        context.webSocketService.isAuthenticated;
    return Drawer(
      backgroundColor: MCEColors.surface,
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(
                MCESpacing.lg,
                MCESpacing.lg,
                MCESpacing.md,
                MCESpacing.md,
              ),
              child: Row(
                children: [
                  MCEBrandMark(size: 30),
                  SizedBox(width: MCESpacing.md),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('MakeChurchEasy', style: MCETypography.bodyBold),
                        SizedBox(height: 2),
                        Text('Desktop control', style: MCETypography.caption),
                      ],
                    ),
                  ),
                  IconButton(
                    tooltip: 'Close menu',
                    onPressed: () => Navigator.of(context).pop(),
                    icon: Icon(Icons.close),
                  ),
                ],
              ),
            ),
            Divider(color: MCEColors.border, height: 1),
            _drawerLabel('Live control'),
            for (var index = 0; index < _tabNames.length; index++)
              _drawerItem(
                icon: _tabActiveIcons[index],
                label: _tabNames[index],
                selected: _currentTabIndex == index,
                onTap: () {
                  setState(() => _currentTabIndex = index);
                  Navigator.of(context).pop();
                },
              ),
            _drawerLabel('Tools'),
            _drawerItem(
              icon: Icons.upload_file_outlined,
              label: 'Send file to PC',
              subtitle: 'Choose any file from this phone',
              onTap: () {
                setState(() {
                  _currentTabIndex = 3;
                  _sendFileRequest++;
                });
                Navigator.of(context).pop();
              },
            ),
            _drawerItem(
              icon: Icons.bolt_outlined,
              label: 'Open automations',
              subtitle: 'Run when the phone is away',
              onTap: () {
                Navigator.of(context).pop();
                _openAutomation(tab: 1);
              },
            ),
            _drawerItem(
              icon: Icons.playlist_play_outlined,
              label: 'Open macros',
              subtitle: 'Run ordered actions on OBS',
              onTap: () {
                Navigator.of(context).pop();
                _openAutomation();
              },
            ),
            _drawerLabel('Desktop-only'),
            _drawerItem(
              icon: Icons.grid_view_outlined,
              label: 'Multi-View',
              subtitle: 'Available on the desktop app',
              enabled: false,
            ),
            Spacer(),
            Divider(color: MCEColors.border, height: 1),
            _drawerItem(
              icon: Icons.settings_outlined,
              label: 'Settings',
              onTap: () {
                Navigator.of(context).pop();
                Navigator.of(
                  context,
                ).push(MaterialPageRoute(builder: (_) => AppSettingsScreen()));
              },
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(
                MCESpacing.xl,
                MCESpacing.xs,
                MCESpacing.xl,
                MCESpacing.lg,
              ),
              child: Row(
                children: [
                  Container(
                    width: 8,
                    height: 8,
                    decoration: BoxDecoration(
                      color: isConnected ? MCEColors.success : MCEColors.danger,
                      shape: BoxShape.circle,
                    ),
                  ),
                  SizedBox(width: MCESpacing.sm),
                  Text(
                    isConnected ? 'Connected to desktop' : 'Desktop offline',
                    style: MCETypography.caption,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _drawerLabel(String label) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        MCESpacing.xl,
        MCESpacing.lg,
        MCESpacing.lg,
        MCESpacing.xs,
      ),
      child: Text(
        label.toUpperCase(),
        style: MCETypography.tiny.copyWith(
          color: MCEColors.textTertiary,
          letterSpacing: 1,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }

  Widget _drawerItem({
    required IconData icon,
    required String label,
    String? subtitle,
    bool selected = false,
    bool enabled = true,
    VoidCallback? onTap,
  }) {
    return ListTile(
      enabled: enabled,
      minVerticalPadding: 8,
      contentPadding: const EdgeInsets.symmetric(horizontal: MCESpacing.lg),
      leading: Icon(
        icon,
        color: enabled
            ? (selected ? MCEColors.primaryBlue : MCEColors.textSecondary)
            : MCEColors.textTertiary,
      ),
      title: Text(
        label,
        style: MCETypography.body.copyWith(
          color: enabled
              ? (selected ? MCEColors.primaryBlue : MCEColors.textPrimary)
              : MCEColors.textTertiary,
          fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
        ),
      ),
      subtitle: subtitle == null
          ? null
          : Text(subtitle, style: MCETypography.tiny),
      selected: selected,
      selectedTileColor: MCEColors.primaryBlue.withValues(alpha: 0.10),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(MCERadius.md),
      ),
      onTap: enabled ? onTap : null,
    );
  }

  @override
  Widget build(BuildContext context) {
    final scenesSelected = _currentTabIndex == 0;
    return Scaffold(
      key: _scaffoldKey,
      drawer: _buildDrawer(),
      body: Column(
        children: [
          _buildHeader(),
          Expanded(child: _buildBody()),
        ],
      ),
      bottomNavigationBar: Theme(
        data: Theme.of(context).copyWith(
          navigationBarTheme: scenesSelected
              ? NavigationBarThemeData(
                  backgroundColor: MCEColors.surface,
                  indicatorColor: MCEColors.primaryBg,
                  surfaceTintColor: Colors.transparent,
                  elevation: 0,
                  height: 72,
                  labelTextStyle: WidgetStateProperty.resolveWith((states) {
                    final selected = states.contains(WidgetState.selected);
                    return TextStyle(
                      fontFamily: 'Inter',
                      fontSize: 11,
                      fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                      color: selected
                          ? MCEColors.primaryBlue
                          : MCEColors.textSecondary,
                    );
                  }),
                  iconTheme: WidgetStateProperty.resolveWith((states) {
                    final selected = states.contains(WidgetState.selected);
                    return IconThemeData(
                      color: selected
                          ? MCEColors.primaryBlue
                          : MCEColors.textSecondary,
                      size: 24,
                    );
                  }),
                )
              : Theme.of(context).navigationBarTheme,
        ),
        child: NavigationBar(
          selectedIndex: _currentTabIndex,
          onDestinationSelected: (index) {
            setState(() => _currentTabIndex = index);
          },
          destinations: List.generate(_tabNames.length, (i) {
            final isActive = _currentTabIndex == i;
            return NavigationDestination(
              icon: Icon(
                isActive ? _tabActiveIcons[i] : _tabIcons[i],
                color: isActive
                    ? MCEColors.primaryBlue
                    : MCEColors.textSecondary,
              ),
              label: _tabNames[i],
            );
          }),
        ),
      ),
    );
  }
}
