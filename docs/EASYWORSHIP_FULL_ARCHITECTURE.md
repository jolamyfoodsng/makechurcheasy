# EasyWorship Full Storage & Media Architecture Note

This document serves as the technical reference for EasyWorship 6 & 7 media, theme, schedule, and song storage architecture for **MakeChurchEasy**.

---

## 1. Song Storage Architecture

EasyWorship splits song metadata and slide lyrics across two SQLite databases in the profile data folder:
`C:\Users\Public\Documents\Softouch\Easyworship\Default\<version>\Databases\Data\`

* **`Songs.db`** (Metadata): Contains `song` table (`rowid`, `title`, `author`, `copyright`, `administrator`, `reference_number`, `tags`).
* **`SongWords.db`** (Lyrics & Slides): Contains `word` table (`rowid`, `song_id` foreign key referencing `song.rowid`, `words` stored as Rich Text Format `{\rtf1...}`).

---

## 2. Themes Architecture

Themes in EasyWorship are structured presentation layouts:
* **Theme Definitions**: Stored in `Databases\Data\Themes.db` and `PresentationLayouts.db`.
* **Theme Media Assets**: When a theme uses a video or image background, it points to the media record in `Media.db`, referencing media files stored in `Resources\Videos\` or `Resources\Images\`.
* **Exported Theme Files**: Themes exported or saved as standalone files are placed in `Resources\Themes\`.

---

## 3. Media Assets (Videos & Images) Architecture

Loose media assets are stored directly on the file system:
* **Videos**: `C:\Users\Public\Documents\Softouch\Easyworship\Default\Resources\Videos\`
* **Images**: `C:\Users\Public\Documents\Softouch\Easyworship\Default\Resources\Images\`
* **Media Metadata Database**: `Databases\Data\Media.db` (Contains titles, original filenames, aspect ratios, thumbnails, and media tags).

---

## 4. Schedules & Packages Architecture

* **Schedule Files (`.ewsx`)**:
  * Stored at: `C:\Users\Public\Documents\Softouch\Easyworship\Default\Resources\Schedules\`
  * Container: ZIP-compressed archive container holding JSON/XML schedule definitions, embedded presentation slides, user songs, and associated background media assets (`.mp4`, `.jpg`).
* **Song Packages (`.ewpck`)**:
  * Packaged content items used to export or import collections of songs between EasyWorship profiles and machines.

---

## 5. MakeChurchEasy Import Capabilities

1. **Songs Import**: Direct SQLite join of `Songs.db` + `SongWords.db` with automatic RTF decoding and section splitting (`Verse 1`, `Chorus`, `Bridge`).
2. **Media Library Import**: Scanning `Resources\Videos\` and `Resources\Images\` to index background videos and images directly into MakeChurchEasy's Worship Media Library.
3. **Schedule Import**: Unzipping `.ewsx` archives to extract embedded songs, slides, and background video/image assets.
