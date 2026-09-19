export const DEFAULT_MOBILE_WS_PORT = 8765;
export const DEFAULT_MOBILE_API_PORT = 45678;

export interface MobilePairingInfo {
  version?: number;
  ip: string;
  port?: number;
  wsPort?: number | null;
  apiPort?: number | null;
  pairingToken: string;
}

export interface MobilePairingPorts {
  wsPort: number;
  apiPort: number;
}

function isValidPort(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 65535;
}

function resolvePort(value: number | null | undefined, fallback: number): number | null {
  // An omitted field is compatible with older desktop builds. A returned 0 is
  // different: it means that service failed to bind and must not be replaced
  // with a port that may belong to another desktop instance.
  if (value === undefined) return fallback;
  return isValidPort(value) ? value : null;
}

export function resolveMobilePairingPorts(info: MobilePairingInfo): MobilePairingPorts | null {
  const wsPort = resolvePort(info.wsPort ?? info.port, DEFAULT_MOBILE_WS_PORT);
  const apiPort = resolvePort(info.apiPort, DEFAULT_MOBILE_API_PORT);
  if (wsPort === null || apiPort === null) return null;
  return { wsPort, apiPort };
}

export function buildMobilePairingPayload(info: MobilePairingInfo, desktopName?: string): string {
  const ip = info.ip.trim();
  const pairingToken = info.pairingToken.trim();
  const ports = resolveMobilePairingPorts(info);
  if (!ip || !pairingToken || !ports) return "";

  return JSON.stringify({
    version: info.version ?? 1,
    ...(desktopName?.trim() ? { desktopName: desktopName.trim() } : {}),
    ip,
    wsPort: ports.wsPort,
    apiPort: ports.apiPort,
    pairingToken,
  });
}

export function buildMobileWebUrl(info: MobilePairingInfo): string {
  const ip = info.ip.trim();
  const pairingToken = info.pairingToken.trim();
  const ports = resolveMobilePairingPorts(info);
  if (!ip || !pairingToken || !ports) return "";

  const query = new URLSearchParams({
    ip,
    wsPort: String(ports.wsPort),
    apiPort: String(ports.apiPort),
    pairingToken,
  });
  return `http://${ip}:${ports.apiPort}/mobile/?${query.toString()}`;
}
