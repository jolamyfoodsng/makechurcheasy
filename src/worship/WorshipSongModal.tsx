import type { Song } from "./types";
import WorshipSongEditor from "./WorshipSongEditor";

interface WorshipSongModalProps {
  song?: Song;
  onClose: () => void;
  onSave: () => void;
}

export default function WorshipSongModal({ song, onClose, onSave }: WorshipSongModalProps) {
  return (
    <WorshipSongEditor
      song={song}
      onClose={onClose}
      onSave={onSave}
    />
  );
}
