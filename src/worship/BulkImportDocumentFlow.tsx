import SongImportFullprocess from "../../others/SongImportFullprocess";

interface BulkImportDocumentFlowProps {
  onClose: () => void;
  onImported: () => void;
}

export function BulkImportDocumentFlow({ onClose, onImported }: BulkImportDocumentFlowProps) {
  return (
    <SongImportFullprocess
      onClose={onClose}
      onImported={onImported}
    />
  );
}
