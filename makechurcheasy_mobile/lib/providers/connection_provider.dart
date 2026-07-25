/// Connection provider — tracks pairing state and connection status.
///
/// Stores server URL + token in secure storage, and exposes the
/// current connection state for routing decisions.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class ConnectionInfo {
  final String? serverUrl;
  final String? token;
  final bool isConnected;

  const ConnectionInfo({this.serverUrl, this.token, this.isConnected = false});

  ConnectionInfo copyWith({String? serverUrl, String? token, bool? isConnected}) {
    return ConnectionInfo(
      serverUrl: serverUrl ?? this.serverUrl,
      token: token ?? this.token,
      isConnected: isConnected ?? this.isConnected,
    );
  }
}

class ConnectionNotifier extends StateNotifier<ConnectionInfo> {
  ConnectionNotifier() : super(const ConnectionInfo()) {
    _loadStored();
  }

  static const _storage = FlutterSecureStorage();
  static const _urlKey = 'mce_ws_url';
  static const _tokenKey = 'mce_ws_token';

  Future<void> _loadStored() async {
    final url = await _storage.read(key: _urlKey);
    final token = await _storage.read(key: _tokenKey);
    if (url != null && token != null) {
      state = ConnectionInfo(serverUrl: url, token: token);
    }
  }

  Future<void> savePairing(String url, String token) async {
    await _storage.write(key: _urlKey, value: url);
    await _storage.write(key: _tokenKey, value: token);
    state = ConnectionInfo(serverUrl: url, token: token);
  }

  void setConnected(bool connected) {
    state = state.copyWith(isConnected: connected);
  }

  Future<void> disconnect() async {
    await _storage.delete(key: _urlKey);
    await _storage.delete(key: _tokenKey);
    state = const ConnectionInfo();
  }
}

final connectionProvider = StateNotifierProvider<ConnectionNotifier, ConnectionInfo>(
  (ref) => ConnectionNotifier(),
);
