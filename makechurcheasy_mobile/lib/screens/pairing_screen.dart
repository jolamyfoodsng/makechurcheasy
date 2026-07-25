import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../theme/app_theme.dart';
import '../providers/connection_provider.dart';
import '../services/network_discovery_service.dart';
import '../services/websocket_service.dart' as ws;

class PairingScreen extends ConsumerStatefulWidget {
  const PairingScreen({super.key});

  @override
  ConsumerState<PairingScreen> createState() => _PairingScreenState();
}

class _PairingScreenState extends ConsumerState<PairingScreen> {
  final _urlController = TextEditingController();
  final _tokenController = TextEditingController();
  bool _isConnecting = false;
  String? _error;

  // Discovery state
  final _discovery = NetworkDiscoveryService();
  final List<DiscoveredServer> _discoveredServers = [];
  bool _isScanning = false;
  bool _broadcastListening = false;
  StreamSubscription<DiscoveredServer>? _serverSub;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final conn = ref.read(connectionProvider);
      if (conn.serverUrl != null) _urlController.text = conn.serverUrl!;
      if (conn.token != null) _tokenController.text = conn.token!;

      // Start auto-discovery
      _startDiscovery();
    });
  }

  @override
  void dispose() {
    _urlController.dispose();
    _tokenController.dispose();
    _serverSub?.cancel();
    _discovery.dispose();
    super.dispose();
  }

  Future<void> _startDiscovery() async {
    // Start listening for UDP broadcasts
    await _discovery.startBroadcastListener();
    _broadcastListening = true;

    // Listen for discovered servers
    _serverSub = _discovery.servers.listen((server) {
      if (!mounted) return;
      setState(() {
        if (!_discoveredServers.contains(server)) {
          _discoveredServers.insert(0, server);
        }
      });
    });
  }

  Future<void> _scanWifi() async {
    if (_isScanning) return;

    setState(() {
      _isScanning = true;
      _error = null;
    });

    try {
      final servers = await _discovery.scanWithTimeout();
      if (!mounted) return;

      setState(() {
        for (final server in servers) {
          if (!_discoveredServers.contains(server)) {
            _discoveredServers.add(server);
          }
        }
        _isScanning = false;
      });

      if (_discoveredServers.isEmpty) {
        setState(() => _error = 'No desktop found on this WiFi network');
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _isScanning = false;
        _error = 'Network scan failed — try entering details manually';
      });
    }
  }

  Future<void> _connectToServer(DiscoveredServer server) async {
    final token = _tokenController.text.trim();

    if (token.isEmpty) {
      // No token yet — pre-fill URL and prompt for token
      setState(() {
        _urlController.text = server.wsUrl;
        _error = 'Enter the pairing token shown on your desktop';
      });
      return;
    }

    _urlController.text = server.wsUrl;
    _connect();
  }

  Future<void> _scanQr() async {
    final result = await context.push<String>('/qr-scan');
    if (result != null) _parseQrResult(result);
  }

  void _parseQrResult(String data) {
    try {
      final uri = Uri.parse(data);
      final host = uri.host;
      final port = uri.port;
      final token = uri.queryParameters['token'] ?? '';

      final wsUrl = 'ws://$host:$port';
      _urlController.text = wsUrl;
      _tokenController.text = token;
      _connect();
    } catch (e) {
      setState(() => _error = 'Invalid QR code — try entering details manually');
    }
  }

  Future<void> _connect() async {
    final url = _urlController.text.trim();
    final token = _tokenController.text.trim();

    if (url.isEmpty || token.isEmpty) {
      setState(() => _error = 'Enter server URL and pairing token');
      return;
    }

    setState(() {
      _isConnecting = true;
      _error = null;
    });

    try {
      await ref.read(connectionProvider.notifier).savePairing(url, token);

      final wsNotifier = ref.read(ws.wsServiceProvider.notifier);
      wsNotifier.connect(url, token);

      // Wait for auth_ok to arrive (connectionState changes to 'connected')
      for (var i = 0; i < 20; i++) {
        await Future.delayed(const Duration(milliseconds: 250));
        if (wsNotifier.connectionState == ws.ConnectionState.connected) break;
      }

      if (!mounted) return;

      if (wsNotifier.connectionState == ws.ConnectionState.connected) {
        ref.read(connectionProvider.notifier).setConnected(true);
        context.go('/home');
      } else {
        setState(() {
          _error = 'Connection failed — verify URL and token';
          _isConnecting = false;
        });
      }
    } catch (e) {
      setState(() {
        _error = 'Connection failed — check your network';
        _isConnecting = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Pair with Desktop')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 24),
              Icon(
                Icons.phone_android,
                size: 64,
                color: AppTheme.primaryBlue,
              ),
              const SizedBox(height: 16),
              Text(
                'Connect to MakeChurchEasy',
                style: Theme.of(context).textTheme.headlineMedium,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
              Text(
                'Scan the QR code, or let the app find your desktop automatically.',
                style: Theme.of(context).textTheme.bodyMedium,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 32),

              // ── Auto-discovery section ──
              if (_discoveredServers.isNotEmpty || _isScanning || _broadcastListening)
                _buildDiscoverySection(),

              if (_discoveredServers.isNotEmpty || _isScanning)
                const SizedBox(height: 24),

              // ── QR Code button ──
              SizedBox(
                height: 56,
                child: ElevatedButton.icon(
                  onPressed: _isConnecting ? null : _scanQr,
                  icon: const Icon(Icons.qr_code_scanner, size: 24),
                  label: const Text('Scan QR Code'),
                ),
              ),
              const SizedBox(height: 24),

              // ── Divider ──
              Row(
                children: [
                  const Expanded(child: Divider()),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    child: Text('OR', style: Theme.of(context).textTheme.bodySmall),
                  ),
                  const Expanded(child: Divider()),
                ],
              ),
              const SizedBox(height: 24),

              // ── Manual entry ──
              TextField(
                controller: _urlController,
                decoration: const InputDecoration(hintText: 'ws://192.168.1.100:8765'),
                keyboardType: TextInputType.url,
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _tokenController,
                decoration: const InputDecoration(hintText: 'Enter pairing token'),
              ),
              const SizedBox(height: 24),

              if (_error != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 16),
                  child: Row(
                    children: [
                      const Icon(Icons.error_outline, color: AppTheme.error, size: 16),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          _error!,
                          style: const TextStyle(color: AppTheme.error, fontSize: 13),
                        ),
                      ),
                    ],
                  ),
                ),

              SizedBox(
                height: 56,
                child: ElevatedButton(
                  onPressed: _isConnecting ? null : _connect,
                  child: _isConnecting
                      ? const SizedBox(
                          height: 20,
                          width: 20,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                        )
                      : const Text('Connect to Desktop'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildDiscoverySection() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppTheme.primaryBlue.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppTheme.primaryBlue.withValues(alpha: 0.2)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Icon(Icons.wifi, size: 18, color: AppTheme.primaryBlue),
              const SizedBox(width: 8),
              Text(
                'WiFi Discovery',
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  color: AppTheme.primaryBlue,
                ),
              ),
              const Spacer(),
              if (_isScanning)
                const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              else
                TextButton.icon(
                  onPressed: _scanWifi,
                  icon: const Icon(Icons.refresh, size: 16),
                  label: const Text('Scan'),
                ),
            ],
          ),
          if (_broadcastListening && _discoveredServers.isEmpty && !_isScanning)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(
                'Listening for desktop on this network...',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: AppTheme.textMuted,
                ),
              ),
            ),
          if (_discoveredServers.isNotEmpty) ...[
            const SizedBox(height: 12),
            ...(_discoveredServers.map((server) => _buildServerTile(server))),
          ],
        ],
      ),
    );
  }

  Widget _buildServerTile(DiscoveredServer server) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: _isConnecting ? null : () => _connectToServer(server),
          borderRadius: BorderRadius.circular(8),
          child: Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: AppTheme.surface,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: AppTheme.border),
            ),
            child: Row(
              children: [
                Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    color: AppTheme.success.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Icon(Icons.computer, size: 20, color: AppTheme.success),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Desktop Found',
                        style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      Text(
                        server.wsUrl,
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: AppTheme.textMuted,
                        ),
                      ),
                    ],
                  ),
                ),
                Icon(
                  Icons.chevron_right,
                  color: AppTheme.textMuted,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
