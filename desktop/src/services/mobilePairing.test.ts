import { describe, expect, it } from "vitest";

import {
  buildMobilePairingPayload,
  buildMobileWebUrl,
  DEFAULT_MOBILE_API_PORT,
  DEFAULT_MOBILE_WS_PORT,
  resolveMobilePairingPorts,
  type MobilePairingInfo,
} from "./mobilePairing";

const validInfo: MobilePairingInfo = {
  ip: "192.168.100.47",
  port: 43121,
  apiPort: 43122,
  pairingToken: "AXBJFL",
};

describe("mobile pairing ports", () => {
  it("uses the runtime ports returned by the desktop server", () => {
    expect(resolveMobilePairingPorts(validInfo)).toEqual({ wsPort: 43121, apiPort: 43122 });
    expect(buildMobileWebUrl(validInfo)).toBe(
      "http://192.168.100.47:43122/mobile/?ip=192.168.100.47&wsPort=43121&apiPort=43122&pairingToken=AXBJFL",
    );
  });

  it("keeps backwards-compatible defaults only for omitted fields", () => {
    const legacyInfo: MobilePairingInfo = {
      ip: validInfo.ip,
      pairingToken: validInfo.pairingToken,
    };
    expect(resolveMobilePairingPorts(legacyInfo)).toEqual({
      wsPort: DEFAULT_MOBILE_WS_PORT,
      apiPort: DEFAULT_MOBILE_API_PORT,
    });
  });

  it("does not turn a failed service port of zero into a browser URL", () => {
    expect(buildMobileWebUrl({ ...validInfo, apiPort: 0 })).toBe("");
    expect(buildMobilePairingPayload({ ...validInfo, port: 0 })).toBe("");
  });
});
