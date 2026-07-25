/// Network discovery service — finds MakeChurchEasy desktops on the local WiFi.
///
/// Strategy:
///   1. Listen for UDP broadcast beacons from the desktop (port 9999)
///   2. Fallback: scan the local subnet for WebSocket servers on port 8765
library;

import 'dart:async';
import 'dart:convert';
import 'dart:io';

/// A desktop server discovered on the local network.
class DiscoveredServer {
  final String ip;
  final int port;
  final String serviceName;
  final DateTime discoveredAt;

  const DiscoveredServer({
    required this.ip,
    required this.port,
    required this.serviceName,
    required this.discoveredAt,
  });

  String get wsUrl => 'ws://$ip:$port';

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is DiscoveredServer && ip == other.ip && port == other.port;

  @override
  int get hashCode => ip.hashCode ^ port.hashCode;

  @override
  String toString() => 'DiscoveredServer($wsUrl, $serviceName)';
}

class NetworkDiscoveryService {
  static const int _discoveryPort = 9999;
  static const int _wsPort = 8765;
  static const Duration _scanTimeout = Duration(seconds: 5);

  RawDatagramSocket? _broadcastSocket;
  StreamSubscription<RawSocketEvent>? _broadcastSub;
  final _serversController = StreamController<DiscoveredServer>.broadcast();

  /// Stream of discovered servers (from both broadcast and scan).
  Stream<DiscoveredServer> get servers => _serversController.stream;

  /// Start listening for UDP broadcast beacons from the desktop.
  Future<void> startBroadcastListener() async {
    try {
      _broadcastSocket = await RawDatagramSocket.bind(
        InternetAddress.anyIPv4,
        _discoveryPort,
        reuseAddress: true,
      );

      _broadcastSub = _broadcastSocket!.listen((event) {
        if (event == RawSocketEvent.read) {
          final datagram = _broadcastSocket!.receive();
          if (datagram != null) {
            _handleBroadcast(datagram);
          }
        }
      });

      print('[Discovery] Listening for broadcasts on port $_discoveryPort');
    } catch (e) {
      print('[Discovery] Failed to bind broadcast listener: $e');
    }
  }

  void _handleBroadcast(Datagram datagram) {
    try {
      final msg = jsonDecode(utf8.decode(datagram.data)) as Map<String, dynamic>;
      if (msg['service'] == 'makechurcheasy') {
        final server = DiscoveredServer(
          ip: datagram.address.address,
          port: (msg['port'] as num?)?.toInt() ?? _wsPort,
          serviceName: msg['service'] as String? ?? 'MakeChurchEasy',
          discoveredAt: DateTime.now(),
        );
        _serversController.add(server);
      }
    } catch (_) {
      // Ignore malformed broadcasts
    }
  }

  /// Scan the local subnet for WebSocket servers on port 8765.
  /// Returns discovered servers as they are found.
  Future<List<DiscoveredServer>> scanSubnet() async {
    final servers = <DiscoveredServer>[];

    try {
      // Get the device's IP to determine the subnet
      final interfaces = await NetworkInterface.list(
        type: InternetAddressType.IPv4,
        includeLinkLocal: false,
      );

      for (final interface in interfaces) {
        for (final addr in interface.addresses) {
          if (addr.isLoopback) continue;

          final parts = addr.address.split('.');
          if (parts.length != 4) continue;

          final subnet = '${parts[0]}.${parts[1]}.${parts[2]}';

          // Try common gateway IPs first (faster)
          final priorityIPs = [
            '$subnet.1',   // Most common gateway
            '$subnet.254', // Common alternative
            '$subnet.100', // Common DHCP start
            '$subnet.50',  // Common static IP range
          ];

          // Scan priority IPs first (parallel, short timeout)
          final priorityFutures = priorityIPs.map((ip) => _tryConnect(ip, _wsPort));
          final priorityResults = await Future.wait(priorityFutures);

          for (var i = 0; i < priorityResults.length; i++) {
            if (priorityResults[i]) {
              servers.add(DiscoveredServer(
                ip: priorityIPs[i],
                port: _wsPort,
                serviceName: 'MakeChurchEasy',
                discoveredAt: DateTime.now(),
              ));
            }
          }

          // If no priority IPs found, scan the full subnet in batches
          if (servers.isEmpty) {
            servers.addAll(await _scanFullSubnet(subnet));
          }

          if (servers.isNotEmpty) return servers;
        }
      }
    } catch (e) {
      print('[Discovery] Subnet scan failed: $e');
    }

    return servers;
  }

  Future<List<DiscoveredServer>> _scanFullSubnet(String subnet) async {
    final servers = <DiscoveredServer>[];
    const batchSize = 30;

    for (var batch = 0; batch < 256; batch += batchSize) {
      final futures = <Future<bool>>[];

      for (var i = batch; i < batch + batchSize && i < 256; i++) {
        futures.add(_tryConnect('$subnet.$i', _wsPort));
      }

      final results = await Future.wait(futures);

      for (var i = 0; i < results.length; i++) {
        if (results[i]) {
          servers.add(DiscoveredServer(
            ip: '$subnet.${batch + i}',
            port: _wsPort,
            serviceName: 'MakeChurchEasy',
            discoveredAt: DateTime.now(),
          ));
        }
      }

      // If found something, don't scan the rest
      if (servers.isNotEmpty) break;
    }

    return servers;
  }

  /// Try to connect to a host:port with a short timeout.
  /// Returns true if the port is open (WebSocket server found).
  Future<bool> _tryConnect(String host, int port) async {
    try {
      final socket = await Socket.connect(host, port, timeout: const Duration(milliseconds: 800));
      await socket.close();
      return true;
    } catch (_) {
      return false;
    }
  }

  /// Convenience: scan subnet and return results after a timeout.
  Future<List<DiscoveredServer>> scanWithTimeout() async {
    return scanSubnet().timeout(_scanTimeout, onTimeout: () => []);
  }

  /// Stop all listeners and clean up.
  void dispose() {
    _broadcastSub?.cancel();
    _broadcastSocket?.close();
    _serversController.close();
  }
}
