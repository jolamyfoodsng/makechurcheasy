/**
 * SettingsModalSlot — where the Settings dialog is drawn.
 *
 * App's routes decide WHEN Settings is open (SettingsOverlayContext); the app shell
 * renders this slot inside its providers, because Settings needs them (e.g. the Bible store).
 */
import { createContext, Suspense, useContext } from "react";
import { safeLazy } from "../utils/safeLazy";
import LoadingScreen from "./LoadingScreen";

const SettingsModal = safeLazy(() => import("./SettingsModal"));
const MVSettings = safeLazy(() => import("../multiview/pages/MVSettings").then(({ MVSettings: Component }) => ({ default: Component })));

export const SettingsOverlayContext = createContext<{ open: boolean; close: () => void }>({ open: false, close: () => undefined });

export default function SettingsModalSlot() {
  const { open, close } = useContext(SettingsOverlayContext);
  if (!open) return null;
  return (
    <Suspense fallback={null}>
      <SettingsModal onClose={close}>
        <Suspense fallback={<LoadingScreen variant="page" label="Loading settings…" />}>
          <MVSettings />
        </Suspense>
      </SettingsModal>
    </Suspense>
  );
}
