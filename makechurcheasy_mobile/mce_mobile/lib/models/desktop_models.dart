/// Information about a discovered or paired desktop.
class DesktopInfo {
  final String desktopId;
  final String? name;
  final String? ip;
  final int? wsPort;
  final int? apiPort;
  final String? obsVersion;
  final String? computerName;
  final String? church;

  const DesktopInfo({
    required this.desktopId,
    this.name,
    this.ip,
    this.wsPort,
    this.apiPort,
    this.obsVersion,
    this.computerName,
    this.church,
  });

  factory DesktopInfo.fromJson(Map<String, dynamic> json) {
    return DesktopInfo(
      desktopId: json['desktopId'] as String,
      name: json['name'] as String?,
      ip: json['ip'] as String?,
      wsPort: json['wsPort'] as int?,
      apiPort: json['apiPort'] as int?,
      obsVersion: json['obsVersion'] as String?,
      computerName: json['computerName'] as String?,
      church: json['church'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
        'desktopId': desktopId,
        if (name != null) 'name': name,
        if (ip != null) 'ip': ip,
        if (wsPort != null) 'wsPort': wsPort,
        if (apiPort != null) 'apiPort': apiPort,
        if (obsVersion != null) 'obsVersion': obsVersion,
        if (computerName != null) 'computerName': computerName,
        if (church != null) 'church': church,
      };

  /// Backward compat — the generic `port` maps to wsPort.
  int? get port => wsPort;
}

/// Data parsed from a desktop QR code.
///
/// Desktop QR format: {"ip":"...","wsPort":8765,"apiPort":45678,"pairingToken":"ABC123"}
class DesktopPairingData {
  final String ip;
  final int wsPort;
  final int apiPort;
  final String pairingToken;

  const DesktopPairingData({
    required this.ip,
    required this.wsPort,
    required this.apiPort,
    required this.pairingToken,
  });

  factory DesktopPairingData.fromJson(Map<String, dynamic> json) {
    return DesktopPairingData(
      ip: json['ip'] as String,
      wsPort: json['wsPort'] as int? ?? 8765,
      apiPort: json['apiPort'] as int? ?? 45678,
      pairingToken: json['pairingToken'] as String,
    );
  }

  Map<String, dynamic> toJson() => {
        'ip': ip,
        'wsPort': wsPort,
        'apiPort': apiPort,
        'pairingToken': pairingToken,
      };
}

/// UDP beacon payload broadcast by the desktop on port 9999.
class UdpBeacon {
  final String service;
  final int port;
  final String? version;

  const UdpBeacon({
    required this.service,
    required this.port,
    this.version,
  });

  factory UdpBeacon.fromJson(Map<String, dynamic> json) {
    return UdpBeacon(
      service: json['service'] as String? ?? '',
      port: json['port'] as int? ?? 8765,
      version: json['version'] as String?,
    );
  }
}

enum ConnectionStatus {
  disconnected,
  connecting,
  authenticating,
  connected,
  failed,
}

class DesktopConnection {
  final DesktopInfo info;
  final ConnectionStatus status;
  final String? pairingToken;
  final DateTime? connectedAt;
  final String? failureReason;

  const DesktopConnection({
    required this.info,
    this.status = ConnectionStatus.disconnected,
    this.pairingToken,
    this.connectedAt,
    this.failureReason,
  });

  DesktopConnection copyWith({
    DesktopInfo? info,
    ConnectionStatus? status,
    String? pairingToken,
    DateTime? connectedAt,
    String? failureReason,
  }) {
    return DesktopConnection(
      info: info ?? this.info,
      status: status ?? this.status,
      pairingToken: pairingToken ?? this.pairingToken,
      connectedAt: connectedAt ?? this.connectedAt,
      failureReason: failureReason ?? this.failureReason,
    );
  }

  bool get isConnected => status == ConnectionStatus.connected;
  bool get isConnecting =>
      status == ConnectionStatus.connecting ||
      status == ConnectionStatus.authenticating;
  bool get isDisconnected => status == ConnectionStatus.disconnected;
  bool get isFailed => status == ConnectionStatus.failed;
}
