# EasyWorship Database Export Instructions

This guide provides step-by-step instructions for extracting `SongWords.db` (and `Songs.db`) from an EasyWorship 6 or 7 installation on a Windows laptop so it can be imported into **MakeChurchEasy**.

---

## Option 1: AI Prompt for Windows Machine

If you are using an AI assistant (like ChatGPT, Claude, Cursor, or Antigravity) on your Windows laptop, copy and paste this prompt:

```text
Please locate my EasyWorship 6/7 song databases on this Windows laptop and package them into a zip file on my Desktop named 'EasyWorship_Export.zip'.

Look in the following locations:
1. C:\Users\Public\Documents\Softouch\EasyWorship\Default\v6.1\Databases\Data\
2. C:\ProgramData\Softouch\EasyWorship.v7\Profiles\

I specifically need:
- SongWords.db (holds lyrics, slides, and RTF formatting)
- Songs.db (holds metadata, titles, authors, CCLI numbers)

If there are any .ewpck (Song Packages) or .ewsx (Schedule) files in those directories, include them as well.
Once gathered, compress all found files into 'EasyWorship_Export.zip' on my Desktop.
```

---

## Option 2: 1-Click PowerShell Command (Automated Windows Copy)

If you are on the Windows laptop, open **PowerShell** (search for `PowerShell` in the Windows Start menu) and paste this single command:

```powershell
$dest = "$env:USERPROFILE\Desktop\EasyWorship_Export"
New-Item -ItemType Directory -Force -Path $dest | Out-Null
$src = "C:\Users\Public\Documents\Softouch\Easyworship\Default\v6.1\Databases\Data"

if (Test-Path $src) {
    Copy-Item "$src\SongWords.db" -Destination $dest -ErrorAction SilentlyContinue
    Copy-Item "$src\Songs.db" -Destination $dest -ErrorAction SilentlyContinue
    Compress-Archive -Path "$dest\*" -DestinationPath "$env:USERPROFILE\Desktop\EasyWorship_Export.zip" -Force
    Write-Host "SUCCESS! EasyWorship_Export.zip created on your Desktop." -ForegroundColor Green
} else {
    Write-Host "Searching drive for EasyWorship files..." -ForegroundColor Yellow
    Get-ChildItem -Path "C:\Users\Public\Documents\Softouch" -Include "SongWords.db","Songs.db" -Recurse | Copy-Item -Destination $dest
    Compress-Archive -Path "$dest\*" -DestinationPath "$env:USERPROFILE\Desktop\EasyWorship_Export.zip" -Force
    Write-Host "SUCCESS! Found files and created EasyWorship_Export.zip on Desktop." -ForegroundColor Green
}
```

---

## Option 3: Manual File Locations (Copy to Flash Drive / Cloud)

If copying manually, navigate to this folder on the Windows PC:

```text
C:\Users\Public\Documents\Softouch\Easyworship\Default\v6.1\Databases\Data\
```

Copy these two files:
1. `SongWords.db` (Primary file needed for lyrics & slide formatting)
2. `Songs.db` (Song metadata)

---

## Next Steps

Once you have `SongWords.db` from the Windows laptop:
1. Copy `SongWords.db` into the **MakeChurchEasy** project folder (next to the existing `Songs.db`).
2. We will run the EasyWorship parser test to verify every song, section (`Verse 1`, `Chorus`, `Bridge`), author, and slide break imports cleanly into MakeChurchEasy.
