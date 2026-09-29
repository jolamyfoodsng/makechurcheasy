!macro NSIS_HOOK_POSTINSTALL
  SetOutPath "$INSTDIR"
  ; Install WebView2 runtime if not already present
  DetailPrint "Checking WebView2 runtime..."
  ExecWait '"$INSTDIR\\resources\\windows-runtime\\WebView2Bootstrapper.exe" /silent /install'
  ; Copy whisper DLLs to app directory
  CopyFiles /SILENT "$INSTDIR\\resources\\windows-runtime\\*.dll" "$INSTDIR"
  ; Clean up bootstrapper — not needed at runtime
  ; Register makechurcheasy and mce URL protocols
  WriteRegStr HKCR "makechurcheasy" "" "URL:MakeChurchEasy Protocol"
  WriteRegStr HKCR "makechurcheasy" "URL Protocol" ""
  WriteRegStr HKCR "makechurcheasy\shell\open\command" "" '"$INSTDIR\MakeChurchEasy.exe" "%1"'
  WriteRegStr HKCR "mce" "" "URL:MakeChurchEasy Protocol"
  WriteRegStr HKCR "mce" "URL Protocol" ""
  WriteRegStr HKCR "mce\shell\open\command" "" '"$INSTDIR\MakeChurchEasy.exe" "%1"'
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  DeleteRegKey HKCR "makechurcheasy"
  DeleteRegKey HKCR "mce"
  Delete "$INSTDIR\ggml-base.dll"
  Delete "$INSTDIR\ggml-cpu.dll"
  Delete "$INSTDIR\ggml.dll"
  Delete "$INSTDIR\llama.dll"
!macroend
