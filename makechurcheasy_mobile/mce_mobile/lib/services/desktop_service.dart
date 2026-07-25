import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../models/desktop_models.dart';

const int _discoveryPort = 9999;
const _multicastChannel = MethodChannel('com.makechurcheasy/multicast');

class DesktopService extends ChangeNotifier {
  final FlutterSecureStorage _storage = const FlutterSecureStorage();

  DesktopConnection? _connection;
  bool _isLoading = false;

  DesktopConnection? get connection => _connection;
  bool get isConnected => _connection?.isConnected ?? false;
  bool get isConnecting => _connection?.isConnecting ?? false;
  bool get isLoading => _isLoading;
  DesktopInfo? get currentDesktop => _connection?.info;
  String? get pairingToken => _connection?.pairingToken;

  static const _connectionKey = 'mce_desktop_connection';

  // ── UDP Discovery ───────────────────────────────────────────────────────

  /// Listen for UDP broadcast beacons on port 9999 for up to [duration].
  /// Returns discovered desktops (deduplicated by IP).
  Stream<DesktopInfo> discoverDesktops({
    Duration duration = const Duration(seconds: 8),
  }) async* {
    final controller = StreamController<DesktopInfo>();
    final seen = <String>{};

    // Acquire multicast lock on Android for reliable broadcast reception.
    try {
      await _multicastChannel.invokeMethod('acquireMulticastLock');
    } on PlatformException {
      // Non-Android platforms will throw — that's fine, multicast lock is
      // an Android-only concept.
    }

    try {
      final socket = await RawDatagramSocket.bind(
        InternetAddress.anyIPv4,
        _discoveryPort,
        reuseAddress: true,
      );

      socket.broadcastEnabled = true;

      final timer = Timer(duration, () {
        socket.close();
        if (!controller.isClosed) controller.close();
      });

      socket.listen(
        (RawSocketEvent event) {
          if (event == RawSocketEvent.read) {
            final datagram = socket.receive();
            if (datagram == null) return;

            try {
              final text = utf8.decode(datagram.data);
              final json = jsonDecode(text) as Map<String, dynamic>;
              final beacon = UdpBeacon.fromJson(json);

              if (beacon.service != 'makechurcheasy') return;

              final senderIp = datagram.address.address;
              if (seen.contains(senderIp)) return;
              seen.add(senderIp);

              controller.add(DesktopInfo(
                desktopId: senderIp,
                ip: senderIp,
                wsPort: beacon.port,
              ));
            } catch (_) {
              // Malformed beacon, ignore
            }
          }
        },
        onDone: () {
          timer.cancel();
          socket.close();
          if (!controller.isClosed) controller.close();
        },
      );
    } catch (e) {
      debugPrint('[DesktopService] UDP bind failed: $e');
      if (!controller.isClosed) controller.close();
    } finally {
      // Release multicast lock when discovery finishes.
      try {
        await _multicastChannel.invokeMethod('releaseMulticastLock');
      } on PlatformException {
        // Non-Android — ignore.
      }
    }

    yield* controller.stream;
  }

  // ── Connection Lifecycle ────────────────────────────────────────────────

  /// Begin pairing from QR scan data.
  /// This only stores the connection state — actual auth happens over WebSocket.
  Future<bool> startPairing(DesktopPairingData pairingData) async {
    _isLoading = true;
    notifyListeners();

    try {
      _connection = DesktopConnection(
        info: DesktopInfo(
          desktopId: pairingData.ip,
          ip: pairingData.ip,
          wsPort: pairingData.wsPort,
          apiPort: pairingData.apiPort,
        ),
        status: ConnectionStatus.authenticating,
        pairingToken: pairingData.pairingToken,
      );

      await _saveConnection();
      _isLoading = false;
      notifyListeners();
      return true;
    } catch (e) {
      _isLoading = false;
      notifyListeners();
      return false;
    }
  }

  /// Begin manual connection.
  Future<bool> connectManual({
    required String ip,
    required int wsPort,
    required int apiPort,
    required String token,
  }) {
    final pairingData = DesktopPairingData(
      ip: ip,
      wsPort: wsPort,
      apiPort: apiPort,
      pairingToken: token,
    );
    return startPairing(pairingData);
  }

  /// Called by WebSocketService after receiving auth_ok.
  Future<void> markConnected({
    DesktopInfo? info,
  }) async {
    _connection = _connection!.copyWith(
      info: info ?? _connection!.info,
      status: ConnectionStatus.connected,
      connectedAt: DateTime.now(),
    );
    await _saveConnection();
    notifyListeners();
  }

  /// Called by WebSocketService after receiving auth_failed.
  Future<void> markFailed({String? reason}) async {
    _connection = _connection!.copyWith(
      status: ConnectionStatus.failed,
      failureReason: reason,
    );
    await _saveConnection();
    notifyListeners();
  }

  /// Restore saved connection from secure storage.
  Future<bool> restoreConnection() async {
    try {
      final json = await _storage.read(key: _connectionKey);
      if (json == null) return false;

      final data = jsonDecode(json) as Map<String, dynamic>;
      final info = DesktopInfo.fromJson(data['info'] as Map<String, dynamic>);
      final token = data['pairingToken'] as String?;

      if (token == null) return false;

      _connection = DesktopConnection(
        info: info,
        status: ConnectionStatus.disconnected,
        pairingToken: token,
      );

      notifyListeners();
      return true;
    } catch (e) {
      return false;
    }
  }

  /// Disconnect from desktop and clear stored connection.
  Future<void> disconnect() async {
    _connection = null;
    await _storage.delete(key: _connectionKey);
    notifyListeners();
  }

  // ── Private ─────────────────────────────────────────────────────────────

  Future<void> _saveConnection() async {
    if (_connection == null) return;
    final data = {
      'info': _connection!.info.toJson(),
      'pairingToken': _connection!.pairingToken,
    };
    await _storage.write(key: _connectionKey, value: jsonEncode(data));
  }
}
