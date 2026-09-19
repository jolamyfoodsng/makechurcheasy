import 'dart:async';

import 'package:flutter/material.dart';
import 'auth_service.dart';
import 'desktop_service.dart';
import 'api_service.dart';
import 'websocket_service.dart';
import 'mobile_preferences.dart';

/// Simple InheritedWidget-based service locator.
/// Wrap MaterialApp with MCEProvider to make services available throughout the tree.
class MCEProvider extends StatefulWidget {
  final Widget child;

  const MCEProvider({super.key, required this.child});

  @override
  State<MCEProvider> createState() => MCEProviderState();

  static MCEProviderState of(BuildContext context) {
    final state = context.findAncestorStateOfType<MCEProviderState>();
    assert(state != null, 'No MCEProvider found in context');
    return state!;
  }
}

class MCEProviderState extends State<MCEProvider> {
  late final AuthService authService;
  late final DesktopService desktopService;
  late final ApiService apiService;
  late final WebSocketService webSocketService;
  late final MobilePreferences mobilePreferences;

  @override
  void initState() {
    super.initState();
    authService = AuthService();
    desktopService = DesktopService();
    apiService = ApiService(
      authService: authService,
      desktopService: desktopService,
    );
    webSocketService = WebSocketService(desktopService: desktopService);
    mobilePreferences = MobilePreferences();
    unawaited(mobilePreferences.load());
  }

  @override
  void dispose() {
    webSocketService.dispose();
    authService.dispose();
    desktopService.dispose();
    mobilePreferences.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return _MCEProviderScope(state: this, child: widget.child);
  }
}

class _MCEProviderScope extends InheritedWidget {
  final MCEProviderState state;

  const _MCEProviderScope({required this.state, required super.child});

  @override
  bool updateShouldNotify(_MCEProviderScope oldWidget) => false;
}

extension MCEProviderExtension on BuildContext {
  AuthService get authService => MCEProvider.of(this).authService;
  DesktopService get desktopService => MCEProvider.of(this).desktopService;
  ApiService get apiService => MCEProvider.of(this).apiService;
  WebSocketService get webSocketService =>
      MCEProvider.of(this).webSocketService;
  MobilePreferences get mobilePreferences =>
      MCEProvider.of(this).mobilePreferences;
}
