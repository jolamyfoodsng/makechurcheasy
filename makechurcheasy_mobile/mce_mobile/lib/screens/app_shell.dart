import 'package:flutter/material.dart';
import '../theme/mce_theme.dart';
import '../services/mce_provider.dart';
import '../models/desktop_models.dart';
import 'scenes_screen.dart';
import 'bible_screen.dart';
import 'worship_screen.dart';
import 'ministry_screen.dart';
import 'media_screen.dart';
import 'automation_screen.dart';
import 'desktop_offline_screen.dart';
import 'login_screen.dart';

class AppShell extends StatefulWidget {
  const AppShell({super.key});

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  int _currentTabIndex = 0;

  static const _tabNames = ['Scenes', 'Bible', 'Worship', 'Ministry', 'Media', 'Automation'];
  static const _tabIcons = [
    Icons.dashboard_outlined,
    Icons.menu_book_outlined,
    Icons.music_note_outlined,
    Icons.groups_outlined,
    Icons.perm_media_outlined,
    Icons.bolt_outlined,
  ];
  static const _tabActiveIcons = [
    Icons.dashboard,
    Icons.menu_book,
    Icons.music_note,
    Icons.groups,
    Icons.perm_media,
    Icons.bolt,
  ];

  @override
  void initState() {
    super.initState();
    // Listen for desktop connection status changes
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.desktopService.addListener(_onDesktopStatusChanged);
    });
  }

  void _onDesktopStatusChanged() {
    if (!mounted) return;
    final desktop = context.desktopService;
    if (desktop.connection?.status == ConnectionStatus.disconnected) {
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => const DesktopOfflineScreen()),
      );
    }
  }

  @override
  void dispose() {
    // Safe to call removeListener even if not added
    try {
      context.desktopService.removeListener(_onDesktopStatusChanged);
    } catch (_) {}
    super.dispose();
  }

  Widget _buildHeader() {
    final user = context.authService.user;
    final desktop = context.desktopService;
    final isConnected = desktop.isConnected;
    final initials = user?.initials ?? '??';

    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: MCESpacing.lg,
        vertical: MCESpacing.md,
      ),
      decoration: const BoxDecoration(
        color: MCEColors.surface,
        border: Border(bottom: BorderSide(color: MCEColors.border)),
      ),
      child: SafeArea(
        bottom: false,
        child: Row(
          children: [
            // Title
            const Expanded(
              child: Text(
                'MakeChurchEasy',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: MCEColors.textPrimary,
                ),
              ),
            ),

            // Connection status indicator
            Container(
              padding: const EdgeInsets.symmetric(
                horizontal: 8,
                vertical: 4,
              ),
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
                      color: isConnected
                          ? MCEColors.success
                          : MCEColors.danger,
                      shape: BoxShape.circle,
                    ),
                  ),
                  const SizedBox(width: 4),
                  Text(
                    isConnected ? 'Connected' : 'Offline',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: isConnected
                          ? MCEColors.success
                          : MCEColors.danger,
                      letterSpacing: 0.5,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: MCESpacing.md),

            // Profile avatar with user initials
            GestureDetector(
              onTap: () => _showProfileMenu(),
              child: Container(
                width: 36,
                height: 36,
                decoration: const BoxDecoration(
                  color: MCEColors.primaryBlue,
                  shape: BoxShape.circle,
                ),
                child: Center(
                  child: Text(
                    initials,
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: Colors.white,
                    ),
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
    final user = context.authService.user;

    showModalBottomSheet(
      context: context,
      backgroundColor: MCEColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(MCERadius.lg)),
      ),
      builder: (_) => Padding(
        padding: const EdgeInsets.all(MCESpacing.xxl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // User info
            Row(
              children: [
                CircleAvatar(
                  radius: 24,
                  backgroundColor: MCEColors.primaryBlue,
                  child: Text(
                    user?.initials ?? '??',
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      color: Colors.white,
                    ),
                  ),
                ),
                const SizedBox(width: MCESpacing.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        user?.name ?? 'User',
                        style: MCETypography.bodyBold,
                      ),
                      Text(
                        user?.email ?? '',
                        style: MCETypography.caption.copyWith(
                          color: MCEColors.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: MCESpacing.xxl),
            const Divider(color: MCEColors.border),
            const SizedBox(height: MCESpacing.md),

            // Sign out
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.logout, color: MCEColors.danger),
              title: const Text(
                'Sign Out',
                style: TextStyle(color: MCEColors.danger),
              ),
              onTap: () async {
                Navigator.of(context).pop();
                await context.authService.clearAuth();
                await context.desktopService.disconnect();
                if (!mounted) return;
                Navigator.of(context).pushReplacement(
                  MaterialPageRoute(builder: (_) => const LoginScreen()),
                );
              },
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildBody() {
    return switch (_currentTabIndex) {
      0 => const ScenesScreen(),
      1 => const BibleScreen(),
      2 => const WorshipScreen(),
      3 => const MinistryScreen(),
      4 => const MediaScreen(),
      5 => const AutomationScreen(),
      _ => const ScenesScreen(),
    };
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(
        children: [
          _buildHeader(),
          Expanded(child: _buildBody()),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _currentTabIndex,
        onDestinationSelected: (index) {
          setState(() => _currentTabIndex = index);
        },
        destinations: List.generate(6, (i) {
          final isActive = _currentTabIndex == i;
          return NavigationDestination(
            icon: Icon(
              isActive ? _tabActiveIcons[i] : _tabIcons[i],
              color: isActive ? MCEColors.primaryBlue : MCEColors.textSecondary,
            ),
            label: _tabNames[i],
          );
        }),
      ),
    );
  }
}
