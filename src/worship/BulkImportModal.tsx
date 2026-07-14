import SongImportFullprocess from "../../others/SongImportFullprocess";

interface BulkImportModalProps {
  onClose: () => void;
  onImported: () => void;
}

export function BulkImportModal({ onClose, onImported }: BulkImportModalProps) {
  return (
    <SongImportFullprocess
      mode="file"
      onClose={onClose}
      onImported={onImported}
    />
  );
}
