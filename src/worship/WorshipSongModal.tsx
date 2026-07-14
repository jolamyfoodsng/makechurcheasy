import SongImportFullprocess from "../../others/SongImportFullprocess";
import type { Song } from "./types";
import WorshipSongEditor from "./WorshipSongEditor";

interface WorshipSongModalProps {
  song?: Song;
  onClose: () => void;
  onSave: () => void;
}

export default function WorshipSongModal({ song, onClose, onSave }: WorshipSongModalProps) {
  if (!song) {
    return (
      <SongImportFullprocess
        mode="manual"
        onClose={onClose}
        onImported={onSave}
      />
    );
  }

  return (
    <WorshipSongEditor
      song={song}
      onClose={onClose}
      onSave={onSave}
    />
  );
}
