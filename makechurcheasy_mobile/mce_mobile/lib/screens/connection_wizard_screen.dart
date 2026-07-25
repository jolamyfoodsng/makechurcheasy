import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import '../theme/mce_theme.dart';
import '../widgets/mce_button.dart';
import '../models/desktop_models.dart';
import '../services/mce_provider.dart';
import '../services/websocket_service.dart';
import 'connection_success_screen.dart';

class ConnectionWizardScreen extends StatefulWidget {
  const ConnectionWizardScreen({super.key});

  @override
  State<ConnectionWizardScreen> createState() => _ConnectionWizardScreenState();
}

class _ConnectionWizardScreenState extends State<ConnectionWizardScreen> {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: MCEColors.background,
      appBar: AppBar(
        backgroundColor: MCEColors.background,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: MCEColors.textPrimary),
          onPressed: () => Navigator.of(context).pop(),
        ),
      ),
      body: Padding(
        padding: const EdgeInsets.symmetric(horizontal: MCESpacing.xxl),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: MCESpacing.lg),

            const Text(
              'Connect to Desktop',
              style: MCETypography.sectionTitle,
            ),
            const SizedBox(height: MCESpacing.sm),
            Text(
              'How would you like to connect to\nyour church computer?',
              style: MCETypography.body.copyWith(
                color: MCEColors.textSecondary,
                height: 1.5,
              ),
            ),
            const SizedBox(height: MCESpacing.xxl * 2),

            // QR Scan
            _ConnectionOption(
              icon: Icons.qr_code_scanner,
              iconColor: MCEColors.primaryBlue,
              title: 'Scan QR Code',
              subtitle: 'Point your camera at the QR code on your desktop app',
              onTap: _openQRScanner,
            ),
            const SizedBox(height: MCESpacing.lg),

            // Auto-detect via UDP
            _ConnectionOption(
              icon: Icons.wifi_find,
              iconColor: MCEColors.success,
              title: 'Find Desktop Automatically',
              subtitle: 'Search your local network via UDP broadcast beacons',
              onTap: _autoDetect,
            ),
            const SizedBox(height: MCESpacing.lg),

            // Manual
            _ConnectionOption(
              icon: Icons.edit,
              iconColor: MCEColors.accentOrange,
              title: 'Manual Setup',
              subtitle: 'Enter the IP address and pairing code from your desktop',
              onTap: _showManualSetup,
            ),

            const Spacer(),

            Center(
              child: TextButton(
                onPressed: () {},
                child: Text(
                  'Need help? View setup guide',
                  style: MCETypography.body.copyWith(
                    color: MCEColors.primaryBlue,
                  ),
                ),
              ),
            ),
            const SizedBox(height: MCESpacing.xl),
          ],
        ),
      ),
    );
  }

  // ── QR Scanner ──────────────────────────────────────────────────────────

  void _openQRScanner() {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const _QRScannerScreen()),
    );
  }

  // ── Auto-detect via UDP ─────────────────────────────────────────────────

  void _autoDetect() async {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (_) => const _SearchingDialog(),
    );

    final desktops = <DesktopInfo>[];
    final desktop = context.desktopService;

    try {
      await for (final info in desktop.discoverDesktops(
        duration: const Duration(seconds: 8),
      )) {
        desktops.add(info);
      }
    } catch (_) {}

    if (!mounted) return;
    Navigator.of(context).pop(); // dismiss searching dialog

    if (desktops.isEmpty) {
      _showDiscoveryFailed();
      return;
    }

    if (desktops.length == 1) {
      _showManualSetupForDesktop(desktops.first);
    } else {
      _showDesktopPicker(desktops);
    }
  }

  void _showDesktopPicker(List<DesktopInfo> desktops) {
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: MCEColors.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(MCERadius.lg),
        ),
        title: const Text('Desktops Found', style: MCETypography.bodyBold),
        content: SizedBox(
          width: double.maxFinite,
          child: ListView.separated(
            shrinkWrap: true,
            itemCount: desktops.length,
            separatorBuilder: (_, __) => const Divider(height: 1),
            itemBuilder: (_, i) {
              final d = desktops[i];
              return ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.computer, color: MCEColors.primaryBlue),
                title: Text(
                  d.name ?? d.computerName ?? d.ip ?? 'Desktop',
                  style: MCETypography.bodyBold,
                ),
                subtitle: Text(
                  '${d.ip}:${d.wsPort ?? 8765}',
                  style: MCETypography.caption.copyWith(
                    color: MCEColors.textSecondary,
                  ),
                ),
                onTap: () {
                  Navigator.of(context).pop();
                  _showManualSetupForDesktop(d);
                },
              );
            },
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: Text(
              'Cancel',
              style: MCETypography.body.copyWith(
                color: MCEColors.textSecondary,
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _showManualSetupForDesktop(DesktopInfo desktopInfo) {
    final codeController = TextEditingController();

    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: MCEColors.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(MCERadius.lg),
        ),
        title: const Text('Enter Pairing Code', style: MCETypography.bodyBold),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Enter the 6-character pairing code shown on your desktop app.',
              style: MCETypography.body.copyWith(
                color: MCEColors.textSecondary,
              ),
            ),
            const SizedBox(height: MCESpacing.sm),
            Text(
              'Desktop: ${desktopInfo.ip}:${desktopInfo.wsPort ?? 8765}',
              style: MCETypography.caption.copyWith(
                color: MCEColors.textSecondary,
              ),
            ),
            const SizedBox(height: MCESpacing.lg),
            Container(
              height: 48,
              padding: const EdgeInsets.symmetric(horizontal: MCESpacing.md),
              decoration: BoxDecoration(
                color: MCEColors.elevated,
                borderRadius: BorderRadius.circular(MCERadius.md),
                border: Border.all(color: MCEColors.border),
              ),
              child: TextField(
                controller: codeController,
                style: MCETypography.bodyBold.copyWith(
                  fontSize: 18,
                  letterSpacing: 4,
                ),
                textAlign: TextAlign.center,
                textCapitalization: TextCapitalization.characters,
                decoration: InputDecoration(
                  hintText: 'ABC123',
                  hintStyle: MCETypography.body.copyWith(
                    color: MCEColors.textTertiary,
                  ),
                  border: InputBorder.none,
                ),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: Text(
              'Cancel',
              style: MCETypography.body.copyWith(
                color: MCEColors.textSecondary,
              ),
            ),
          ),
          ElevatedButton(
            onPressed: () {
              final code = codeController.text.trim();
              Navigator.of(context).pop();
              if (code.isEmpty) {
                _showError('Please enter a pairing code.');
                return;
              }
              _connectWithPairingData(DesktopPairingData(
                ip: desktopInfo.ip!,
                wsPort: desktopInfo.wsPort ?? 8765,
                apiPort: desktopInfo.apiPort ?? 45678,
                pairingToken: code,
              ));
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: MCEColors.primaryBlue,
              foregroundColor: Colors.white,
            ),
            child: const Text('Connect'),
          ),
        ],
      ),
    );
  }

  // ── Manual Setup ────────────────────────────────────────────────────────

  void _showManualSetup() {
    final ipController = TextEditingController();
    final wsPortController = TextEditingController(text: '8765');
    final apiPortController = TextEditingController(text: '45678');
    final codeController = TextEditingController();

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: MCEColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(MCERadius.lg)),
      ),
      builder: (_) => Padding(
        padding: EdgeInsets.only(
          left: MCESpacing.xxl,
          right: MCESpacing.xxl,
          top: MCESpacing.xxl,
          bottom: MediaQuery.of(context).viewInsets.bottom + MCESpacing.xxl,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Manual Connection', style: MCETypography.sectionTitle),
            const SizedBox(height: MCESpacing.lg),
            _buildTextField(
              'IP Address',
              'e.g. 192.168.1.100 or 10.0.2.2',
              ipController,
            ),
            const SizedBox(height: MCESpacing.md),
            _buildTextField('WebSocket Port', '8765', wsPortController),
            const SizedBox(height: MCESpacing.md),
            _buildTextField('API Port', '45678', apiPortController),
            const SizedBox(height: MCESpacing.md),
            _buildTextField(
              'Pairing Code',
              '6-character code from desktop',
              codeController,
            ),
            const SizedBox(height: MCESpacing.xxl),
            SizedBox(
              width: double.infinity,
              height: 52,
              child: MCEButton.primary(
                label: 'Connect',
                icon: Icons.link,
                onPressed: () {
                  final ip = ipController.text.trim();
                  final wsPort =
                      int.tryParse(wsPortController.text.trim()) ?? 8765;
                  final apiPort =
                      int.tryParse(apiPortController.text.trim()) ?? 45678;
                  final code = codeController.text.trim();
                  Navigator.of(context).pop();

                  if (ip.isEmpty || code.isEmpty) {
                    _showError('IP address and pairing code are required.');
                    return;
                  }

                  _connectWithPairingData(DesktopPairingData(
                    ip: ip,
                    wsPort: wsPort,
                    apiPort: apiPort,
                    pairingToken: code,
                  ));
                },
              ),
            ),
            const SizedBox(height: MCESpacing.xxl),
          ],
        ),
      ),
    );
  }

  // ── Core connection flow ────────────────────────────────────────────────

  /// Store pairing data, open WebSocket, authenticate via WS protocol.
  /// Listens for auth_ok / auth_failed events with a 10s timeout.
  Future<void> _connectWithPairingData(DesktopPairingData data) async {
    if (!mounted) return;

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (_) => const _ConnectingDialog(),
    );

    final desktop = context.desktopService;
    final wsService = context.webSocketService;

    final pairingStarted = await desktop.startPairing(data);
    if (!pairingStarted) {
      if (!mounted) return;
      Navigator.of(context).pop();
      _showError('Failed to initialize pairing. Please try again.');
      return;
    }

    wsService.connect();

    // Wait for auth result via WebSocket event stream, with 10s timeout.
    final completer = Completer<WebSocketEventType>();
    late StreamSubscription<WebSocketEvent> sub;

    sub = wsService.events.listen((event) {
      if (event.type == WebSocketEventType.authenticated ||
          event.type == WebSocketEventType.authFailed) {
        if (!completer.isCompleted) completer.complete(event.type);
      }
    });

    final result = await completer.future.timeout(
      const Duration(seconds: 10),
      onTimeout: () => WebSocketEventType.error,
    );

    await sub.cancel();

    if (!mounted) return;
    Navigator.of(context).pop(); // dismiss connecting dialog

    switch (result) {
      case WebSocketEventType.authenticated:
        _navigateTo(const ConnectionSuccessScreen());
        break;
      case WebSocketEventType.authFailed:
        _showError(
          'Authentication failed. Please check your pairing code and try again.',
        );
        break;
      case WebSocketEventType.error:
      default:
        _showError(
          'Could not connect to desktop. Is it running on the same network?',
        );
        break;
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  void _showError(String message) {
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: MCEColors.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(MCERadius.lg),
        ),
        title: const Text('Connection Failed', style: MCETypography.bodyBold),
        content: Text(
          message,
          style: MCETypography.body.copyWith(color: MCEColors.textSecondary),
        ),
        actions: [
          ElevatedButton(
            onPressed: () => Navigator.of(context).pop(),
            style: ElevatedButton.styleFrom(
              backgroundColor: MCEColors.primaryBlue,
              foregroundColor: Colors.white,
            ),
            child: const Text('OK'),
          ),
        ],
      ),
    );
  }

  void _showDiscoveryFailed() {
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: MCEColors.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(MCERadius.lg),
        ),
        title: const Text('Desktop Not Found', style: MCETypography.bodyBold),
        content: Text(
          'Could not find your desktop on the local network.\n\n'
          'Make sure your desktop app is running and both devices are on '
          'the same Wi-Fi network.',
          style: MCETypography.body.copyWith(color: MCEColors.textSecondary),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('OK'),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.of(context).pop();
              _showManualSetup();
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: MCEColors.primaryBlue,
              foregroundColor: Colors.white,
            ),
            child: const Text('Enter Manually'),
          ),
        ],
      ),
    );
  }

  void _navigateTo(Widget screen) {
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(builder: (_) => screen),
    );
  }

  Widget _buildTextField(
    String label,
    String hint,
    TextEditingController controller,
  ) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: MCETypography.bodyBold),
        const SizedBox(height: MCESpacing.sm),
        Container(
          height: 48,
          padding: const EdgeInsets.symmetric(horizontal: MCESpacing.md),
          decoration: BoxDecoration(
            color: MCEColors.elevated,
            borderRadius: BorderRadius.circular(MCERadius.md),
            border: Border.all(color: MCEColors.border),
          ),
          child: TextField(
            controller: controller,
            style: MCETypography.body,
            decoration: InputDecoration(
              hintText: hint,
              hintStyle: MCETypography.body.copyWith(
                color: MCEColors.textTertiary,
              ),
              border: InputBorder.none,
              contentPadding: EdgeInsets.zero,
            ),
          ),
        ),
      ],
    );
  }
}

// ── QR Scanner Screen ──────────────────────────────────────────────────────

class _QRScannerScreen extends StatefulWidget {
  const _QRScannerScreen();

  @override
  State<_QRScannerScreen> createState() => _QRScannerScreenState();
}

class _QRScannerScreenState extends State<_QRScannerScreen> {
  MobileScannerController? _scannerController;
  bool _isProcessing = false;

  @override
  void initState() {
    super.initState();
    _scannerController = MobileScannerController(
      detectionSpeed: DetectionSpeed.normal,
      facing: CameraFacing.back,
    );
  }

  @override
  void dispose() {
    _scannerController?.dispose();
    super.dispose();
  }

  void _onDetect(BarcodeCapture capture) {
    if (_isProcessing) return;
    final barcode = capture.barcodes.firstOrNull;
    if (barcode == null || barcode.rawValue == null) return;

    setState(() => _isProcessing = true);

    try {
      final raw = barcode.rawValue!;
      if (!raw.startsWith('{')) {
        _showError('Could not parse QR code. Please try again or use manual setup.');
        return;
      }

      final json = jsonDecode(raw) as Map<String, dynamic>;
      final data = DesktopPairingData.fromJson(json);

      _connectWithPairingData(data);
    } catch (e) {
      _showError('Invalid QR code. Please try again.');
    }
  }

  Future<void> _connectWithPairingData(DesktopPairingData data) async {
    if (!mounted) return;

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (_) => const _ConnectingDialog(),
    );

    final desktop = context.desktopService;
    final wsService = context.webSocketService;

    final pairingStarted = await desktop.startPairing(data);
    if (!pairingStarted) {
      if (!mounted) return;
      Navigator.of(context).pop();
      _showError('Failed to initialize pairing. Please try again.');
      return;
    }

    wsService.connect();

    final completer = Completer<WebSocketEventType>();
    late StreamSubscription<WebSocketEvent> sub;

    sub = wsService.events.listen((event) {
      if (event.type == WebSocketEventType.authenticated ||
          event.type == WebSocketEventType.authFailed) {
        if (!completer.isCompleted) completer.complete(event.type);
      }
    });

    final result = await completer.future.timeout(
      const Duration(seconds: 10),
      onTimeout: () => WebSocketEventType.error,
    );

    await sub.cancel();

    if (!mounted) return;
    Navigator.of(context).pop(); // dismiss connecting dialog

    switch (result) {
      case WebSocketEventType.authenticated:
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(builder: (_) => const ConnectionSuccessScreen()),
        );
        break;
      case WebSocketEventType.authFailed:
        _showError(
          'Authentication failed. Please check your pairing code and try again.',
        );
        break;
      case WebSocketEventType.error:
      default:
        _showError(
          'Could not connect to desktop. Is it running on the same network?',
        );
        break;
    }
  }

  void _showError(String message) {
    setState(() => _isProcessing = false);
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: MCEColors.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(MCERadius.lg),
        ),
        title: const Text('Error', style: MCETypography.bodyBold),
        content: Text(
          message,
          style: MCETypography.body.copyWith(color: MCEColors.textSecondary),
        ),
        actions: [
          ElevatedButton(
            onPressed: () => Navigator.of(context).pop(),
            style: ElevatedButton.styleFrom(
              backgroundColor: MCEColors.primaryBlue,
              foregroundColor: Colors.white,
            ),
            child: const Text('OK'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Colors.white),
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: const Text(
          'Scan QR Code',
          style: TextStyle(color: Colors.white),
        ),
        centerTitle: true,
      ),
      body: Stack(
        children: [
          MobileScanner(
            controller: _scannerController,
            onDetect: _onDetect,
          ),

          // Overlay scan area
          Center(
            child: Container(
              width: 250,
              height: 250,
              decoration: BoxDecoration(
                border: Border.all(
                  color: MCEColors.primaryBlue,
                  width: 3,
                ),
                borderRadius: BorderRadius.circular(MCERadius.lg),
              ),
            ),
          ),

          // Instructions
          Positioned(
            bottom: 100,
            left: 0,
            right: 0,
            child: Center(
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: MCESpacing.lg,
                  vertical: MCESpacing.md,
                ),
                decoration: BoxDecoration(
                  color: Colors.black.withValues(alpha: 0.7),
                  borderRadius: BorderRadius.circular(MCERadius.md),
                ),
                child: const Text(
                  'Point camera at QR code on your desktop',
                  style: TextStyle(color: Colors.white, fontSize: 14),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Shared Widgets ──────────────────────────────────────────────────────────

class _ConnectionOption extends StatelessWidget {
  final IconData icon;
  final Color iconColor;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  const _ConnectionOption({
    required this.icon,
    required this.iconColor,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(MCESpacing.lg),
        decoration: BoxDecoration(
          color: MCEColors.surface,
          borderRadius: BorderRadius.circular(MCERadius.lg),
          border: Border.all(color: MCEColors.border),
        ),
        child: Row(
          children: [
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                color: iconColor.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(MCERadius.md),
              ),
              child: Icon(icon, color: iconColor, size: 24),
            ),
            const SizedBox(width: MCESpacing.lg),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: MCETypography.bodyBold),
                  const SizedBox(height: 2),
                  Text(
                    subtitle,
                    style: MCETypography.caption.copyWith(
                      color: MCEColors.textSecondary,
                    ),
                  ),
                ],
              ),
            ),
            const Icon(
              Icons.chevron_right,
              color: MCEColors.textSecondary,
              size: 20,
            ),
          ],
        ),
      ),
    );
  }
}

class _ConnectingDialog extends StatelessWidget {
  const _ConnectingDialog();

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: MCEColors.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(MCERadius.lg),
      ),
      child: Padding(
        padding: const EdgeInsets.all(MCESpacing.xxl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(
              width: 48,
              height: 48,
              child: CircularProgressIndicator(
                color: MCEColors.primaryBlue,
                strokeWidth: 3,
              ),
            ),
            const SizedBox(height: MCESpacing.lg),
            const Text('Connecting...', style: MCETypography.bodyBold),
            const SizedBox(height: MCESpacing.sm),
            Text(
              'Authenticating via WebSocket...',
              style: MCETypography.caption.copyWith(
                color: MCEColors.textSecondary,
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}

class _SearchingDialog extends StatelessWidget {
  const _SearchingDialog();

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: MCEColors.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(MCERadius.lg),
      ),
      child: Padding(
        padding: const EdgeInsets.all(MCESpacing.xxl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(
              width: 48,
              height: 48,
              child: CircularProgressIndicator(
                color: MCEColors.success,
                strokeWidth: 3,
              ),
            ),
            const SizedBox(height: MCESpacing.lg),
            const Text('Searching...', style: MCETypography.bodyBold),
            const SizedBox(height: MCESpacing.sm),
            Text(
              'Listening for UDP broadcast beacons on port 9999...',
              style: MCETypography.caption.copyWith(
                color: MCEColors.textSecondary,
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}
