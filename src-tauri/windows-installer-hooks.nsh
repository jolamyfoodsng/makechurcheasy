!macro NSIS_HOOK_POSTINSTALL
  SetOutPath "$INSTDIR"
  ; Install WebView2 runtime if not already present
  DetailPrint "Checking WebView2 runtime..."
  ExecWait '"$INSTDIR\\resources\\windows-runtime\\WebView2Bootstrapper.exe" /silent /install'
  ; Copy whisper DLLs to app directory
  CopyFiles /SILENT "$INSTDIR\\resources\\windows-runtime\\*.dll" "$INSTDIR"
  ; Clean up bootstrapper — not needed at runtime
  Delete "$INSTDIR\\resources\\windows-runtime\\WebView2Bootstrapper.exe"
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  Delete "$INSTDIR\\ggml-base.dll"
  Delete "$INSTDIR\\ggml-cpu.dll"
  Delete "$INSTDIR\\ggml.dll"
  Delete "$INSTDIR\\llama.dll"
!macroend
