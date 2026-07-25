/**
 * UpgradeModal.tsx — Thin re-export of NewUpgradeModal.
 *
 * The actual component lives in desktop/others/NewUpgradeModal.tsx.
 * This file exists so consumers can import from "../components/UpgradeModal".
 */
import NewUpgradeModal from "../../others/NewUpgradeModal";

export type { NewUpgradeModalProps as UpgradeModalProps } from "../../others/NewUpgradeModal";
export { NewUpgradeModal as UpgradeModal };
export default NewUpgradeModal;
