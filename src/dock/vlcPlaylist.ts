/**
 * Convert local media paths into the playlist item shape expected by OBS's
 * native VLC source.
 *
 * OBS reads the media location from the `value` property. Keeping this
 * serializer separate prevents UI media metadata from leaking into the OBS
 * protocol payload.
 */
export interface DockVlcPlaylistItem {
  hidden: boolean;
  selected: boolean;
  value: string;
}

export function buildVlcPlaylistItems(
  paths: readonly string[],
): DockVlcPlaylistItem[] {
  return paths
    .filter((path) => path.trim().length > 0)
    .map((path) => ({
      hidden: false,
      selected: false,
      value: path,
    }));
}
