/**
 * ForcedUpdateGate.tsx — decides whether the forced-update modal is on screen.
 *
 * Before the final day the modal is a reminder: it can be closed and comes back
 * at milestones. In the last 30 minutes (and after the deadline) it can no
 * longer be closed, so the user has to update. The gate re-evaluates on a
 * timer, so the lock appears on time even if the settings poll is slow.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import ForcedUpdateOverlay from "./ForcedUpdateOverlay";
import {
  getForcedUpdateModalRequestCount,
  getLiveCountdown,
  recordOverlayDismiss,
  shouldReshowOverlay,
  subscribeForcedUpdateModalRequests,
  type ForcedUpdateState,
} from "../services/forcedUpdateService";

interface ForcedUpdateGateProps {
  state: ForcedUpdateState;
}

export default function ForcedUpdateGate({ state }: ForcedUpdateGateProps) {
  const [, setTick] = useState(0);

  // Clicking the countdown in the top bar opens the modal on request, even if
  // the user closed it earlier.
  const requests = useSyncExternalStore(
    subscribeForcedUpdateModalRequests,
    getForcedUpdateModalRequestCount,
    () => 0,
  );
  const seenRequests = useRef(requests);
  const [openedByUser, setOpenedByUser] = useState(false);
  useEffect(() => {
    if (requests !== seenRequests.current) {
      seenRequests.current = requests;
      setOpenedByUser(true);
    }
  }, [requests]);

  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 15_000);
    return () => window.clearInterval(id);
  }, []);

  if (!state.active) return null;

  const live = getLiveCountdown(state);
  const locked = live.modalLocked;
  if (!locked && !openedByUser && !shouldReshowOverlay(live.hoursRemaining)) return null;

  return (
    <ForcedUpdateOverlay
      state={{
        ...state,
        blocked: state.blocked || live.expired,
        hoursRemaining: live.hoursRemaining,
      }}
      finalDay={live.finalDay && !live.expired}
      onDismiss={
        locked
          ? undefined
          : () => {
              recordOverlayDismiss(live.hoursRemaining ?? 0);
              setOpenedByUser(false);
              setTick((n) => n + 1);
            }
      }
    />
  );
}
