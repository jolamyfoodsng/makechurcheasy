/**
 * useOBSButton — React hook for OBS action buttons
 *
 * Per OBS_SYNC_ARCHITECTURE.md and STYLE_DESIGN.md:
 *   - Buttons should represent OBS state
 *   - Always communicate outcomes (not actions)
 *   - Push → "Push To OBS"
 *   - Update → "Update In OBS"
 *   - Clear → "Remove From OBS"
 *
 * This hook determines the correct button label, variant, and state
 * based on whether resources exist in OBS.
 */

import { useState, useEffect, useCallback } from "react";
import {
  obsSyncService,
  type VerseCastResource,
} from "../services/obsSyncService";
import { obsService } from "../services/obsService";

export type ButtonAction = "push" | "update" | "remove" | "sync" | "repair";

export interface OBSButtonState {
  /** The action that should be performed */
  action: ButtonAction;
  /** Button label following STYLE_DESIGN.md copy rules */
  label: string;
  /** Button variant: primary, secondary, danger */
  variant: "primary" | "secondary" | "danger";
  /** Whether the button should be disabled */
  disabled: boolean;
  /** Whether the button is loading */
  loading: boolean;
  /** Status badge text */
  statusText: string;
  /** Status badge variant */
  statusVariant: "success" | "warning" | "error" | "info" | "neutral";
  /** Tooltip text */
  tooltip: string;
}

interface UseOBSButtonOptions {
  /** Module to check for resources */
  module: VerseCastResource["module"];
  /** Optional: specific resource name to check */
  resourceName?: string;
  /** Optional: resource type to check */
  resourceType?: "scene" | "input";
}

/**
 * Hook that returns the correct button state based on OBS sync state.
 *
 * @example
 * ```tsx
 * const { buttonState, loading } = useOBSButton({
 *   module: "multiview",
 *   resourceName: "MV: My Layout",
 *   resourceType: "scene",
 * });
 *
 * return (
 *   <button
 *     onClick={handleClick}
 *     disabled={buttonState.disabled || loading}
 *   >
 *     {buttonState.label}
 *   </button>
 * );
 * ```
 */
export function useOBSButton(options: UseOBSButtonOptions): {
  buttonState: OBSButtonState;
  loading: boolean;
  refresh: () => Promise<void>;
} {
  const { module, resourceName, resourceType = "scene" } = options;

  const [resourceExists, setResourceExists] = useState<boolean | null>(null);
  const [isSynced, setIsSynced] = useState(false);

  // Check if resource exists in OBS
  const checkResource = useCallback(async () => {
    if (!obsService.isConnected) {
      setResourceExists(null);
      return;
    }

    if (resourceName) {
      const result = await obsSyncService.validateResource(resourceName, resourceType);
      setResourceExists(result.exists);
    } else {
      const hasResources = await obsSyncService.hasModuleResources(module);
      setResourceExists(hasResources);
    }
  }, [module, resourceName, resourceType]);

  // Check on mount and when sync happens
  useEffect(() => {
    checkResource();

    const unsubscribe = obsSyncService.onSync(() => {
      checkResource();
      setIsSynced(obsSyncService.syncStatus === "synced");
    });

    return unsubscribe;
  }, [checkResource]);

  // Determine button state
  const buttonState: OBSButtonState = (() => {
    if (!obsService.isConnected) {
      return {
        action: "push",
        label: "Connect To OBS",
        variant: "primary",
        disabled: false,
        loading: false,
        statusText: "OBS Disconnected",
        statusVariant: "neutral",
        tooltip: "Connect to OBS first",
      };
    }

    if (resourceExists === null) {
      return {
        action: "push",
        label: "Check OBS",
        variant: "secondary",
        disabled: true,
        loading: true,
        statusText: "Checking...",
        statusVariant: "info",
        tooltip: "Checking OBS state...",
      };
    }

    if (resourceExists) {
      return {
        action: "update",
        label: "Update In OBS",
        variant: "secondary",
        disabled: false,
        loading: false,
        statusText: isSynced ? "Synced" : "In OBS",
        statusVariant: "success",
        tooltip: "Update existing resource in OBS",
      };
    }

    return {
      action: "push",
      label: "Push To OBS",
      variant: "primary",
      disabled: false,
      loading: false,
      statusText: "Not in OBS",
      statusVariant: "neutral",
      tooltip: "Create resource in OBS",
    };
  })();

  return {
    buttonState,
    loading: false,
    refresh: checkResource,
  };
}

/**
 * useOBSRemoveButton — Hook for remove/clear buttons
 *
 * Returns the correct button state for removing resources from OBS.
 */
export function useOBSRemoveButton(options: UseOBSButtonOptions): {
  buttonState: OBSButtonState;
  loading: boolean;
  refresh: () => Promise<void>;
} {
  const { module, resourceName, resourceType = "scene" } = options;

  const [resourceExists, setResourceExists] = useState<boolean | null>(null);

  const checkResource = useCallback(async () => {
    if (!obsService.isConnected) {
      setResourceExists(null);
      return;
    }

    if (resourceName) {
      const result = await obsSyncService.validateResource(resourceName, resourceType);
      setResourceExists(result.exists);
    } else {
      const hasResources = await obsSyncService.hasModuleResources(module);
      setResourceExists(hasResources);
    }
  }, [module, resourceName, resourceType]);

  useEffect(() => {
    checkResource();

    const unsubscribe = obsSyncService.onSync(() => {
      checkResource();
    });

    return unsubscribe;
  }, [checkResource]);

  const buttonState: OBSButtonState = (() => {
    if (!obsService.isConnected) {
      return {
        action: "remove",
        label: "Remove From OBS",
        variant: "danger",
        disabled: true,
        loading: false,
        statusText: "OBS Disconnected",
        statusVariant: "neutral",
        tooltip: "Connect to OBS first",
      };
    }

    if (resourceExists) {
      return {
        action: "remove",
        label: "Remove From OBS",
        variant: "danger",
        disabled: false,
        loading: false,
        statusText: "In OBS",
        statusVariant: "warning",
        tooltip: "Remove resource from OBS",
      };
    }

    return {
      action: "remove",
      label: "Remove From OBS",
      variant: "danger",
      disabled: true,
      loading: false,
      statusText: "Not in OBS",
      statusVariant: "neutral",
      tooltip: "No resource to remove",
    };
  })();

  return {
    buttonState,
    loading: false,
    refresh: checkResource,
  };
}
