import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'theme/app_theme.dart';
import 'screens/pairing_screen.dart';
import 'screens/qr_scan_screen.dart';
import 'screens/home_screen.dart';
import 'screens/bible_screen.dart';
import 'screens/worship_screen.dart';
import 'screens/remote_screen.dart';
import 'screens/lower_third_screen.dart';
import 'providers/connection_provider.dart';
import 'services/websocket_service.dart' as ws;

class MakeChurchEasyApp extends ConsumerWidget {
  const MakeChurchEasyApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = GoRouter(
      initialLocation: '/',
      redirect: (context, state) {
        final isConnected = ref.read(connectionProvider).isConnected;
        final isPairingRoute = state.matchedLocation == '/';
        final isQrScan = state.matchedLocation == '/qr-scan';
        final isSplash = state.matchedLocation == '/splash';
        if (!isConnected && !isPairingRoute && !isQrScan && !isSplash) return '/';
        if (isConnected && isPairingRoute) return '/home';
        return null;
      },
      routes: [
        GoRoute(
          path: '/',
          builder: (context, state) => const PairingScreen(),
        ),
        GoRoute(
          path: '/splash',
          builder: (context, state) => const _AutoConnectSplash(),
        ),
        GoRoute(
          path: '/qr-scan',
          pageBuilder: (context, state) => const MaterialPage(
            fullscreenDialog: true,
            child: QrScanScreen(),
          ),
        ),
        ShellRoute(
          builder: (context, state, child) => MainShell(child: child),
          routes: [
            GoRoute(path: '/home', builder: (context, state) => const HomeScreen()),
            GoRoute(path: '/bible', builder: (context, state) => const BibleScreen()),
            GoRoute(path: '/worship', builder: (context, state) => const WorshipScreen()),
            GoRoute(path: '/remote', builder: (context, state) => const RemoteScreen()),
            GoRoute(path: '/lower-third', builder: (context, state) => const LowerThirdScreen()),
          ],
        ),
      ],
    );

    return MaterialApp.router(
      title: 'MCE Companion',
      theme: AppTheme.dark,
      routerConfig: router,
      debugShowCheckedModeBanner: false,
    );
  }
}

/// Splash screen that attempts auto-reconnect on startup.
/// If stored URL+token exist, tries to reconnect silently.
/// Falls back to pairing screen if auto-connect fails.
class _AutoConnectSplash extends ConsumerStatefulWidget {
  const _AutoConnectSplash();

  @override
  ConsumerState<_AutoConnectSplash> createState() => _AutoConnectSplashState();
}

class _AutoConnectSplashState extends ConsumerState<_AutoConnectSplash> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _tryAutoConnect());
  }

  Future<void> _tryAutoConnect() async {
    final conn = ref.read(connectionProvider);
    final url = conn.serverUrl;
    final token = conn.token;

    // No stored credentials → go to pairing screen
    if (url == null || token == null) {
      if (mounted) context.go('/');
      return;
    }

    // Try reconnecting with stored credentials
    try {
      final wsNotifier = ref.read(ws.wsServiceProvider.notifier);
      wsNotifier.connect(url, token);

      // Wait up to 4 seconds for auth_ok
      for (var i = 0; i < 16; i++) {
        await Future.delayed(const Duration(milliseconds: 250));
        if (wsNotifier.connectionState == ws.ConnectionState.connected) break;
      }

      if (!mounted) return;

      if (wsNotifier.connectionState == ws.ConnectionState.connected) {
        ref.read(connectionProvider.notifier).setConnected(true);
        context.go('/home');
      } else {
        // Auto-connect failed → go to pairing screen
        context.go('/');
      }
    } catch (_) {
      if (mounted) context.go('/');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.surface,
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.phone_android,
              size: 64,
              color: AppTheme.primaryBlue,
            ),
            const SizedBox(height: 24),
            Text(
              'MCE Companion',
              style: Theme.of(context).textTheme.headlineMedium,
            ),
            const SizedBox(height: 16),
            const SizedBox(
              width: 24,
              height: 24,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
            const SizedBox(height: 12),
            Text(
              'Connecting...',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: AppTheme.textMuted,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class MainShell extends StatelessWidget {
  final Widget child;
  const MainShell({super.key, required this.child});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: child,
      bottomNavigationBar: NavigationBar(
        selectedIndex: _getIndex(context),
        onDestinationSelected: (i) => _onTap(context, i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home), label: 'Home'),
          NavigationDestination(icon: Icon(Icons.menu_book_outlined), selectedIcon: Icon(Icons.menu_book), label: 'Bible'),
          NavigationDestination(icon: Icon(Icons.music_note_outlined), selectedIcon: Icon(Icons.music_note), label: 'Worship'),
          NavigationDestination(icon: Icon(Icons.touch_app_outlined), selectedIcon: Icon(Icons.touch_app), label: 'Remote'),
          NavigationDestination(icon: Icon(Icons.subtitles_outlined), selectedIcon: Icon(Icons.subtitles), label: 'Lower Third'),
        ],
      ),
    );
  }

  int _getIndex(BuildContext context) {
    final path = GoRouterState.of(context).matchedLocation;
    if (path.startsWith('/bible')) return 1;
    if (path.startsWith('/worship')) return 2;
    if (path.startsWith('/remote')) return 3;
    if (path.startsWith('/lower-third')) return 4;
    return 0;
  }

  void _onTap(BuildContext context, int index) {
    const routes = ['/home', '/bible', '/worship', '/remote', '/lower-third'];
    context.go(routes[index]);
  }
}
