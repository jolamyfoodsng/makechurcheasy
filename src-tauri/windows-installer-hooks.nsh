!macro NSIS_HOOK_POSTINSTALL
  SetOutPath "$INSTDIR"
  CopyFiles /SILENT "$INSTDIR\\resources\\windows-runtime\\*.dll" "$INSTDIR"
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  Delete "$INSTDIR\\ggml-base.dll"
  Delete "$INSTDIR\\ggml-cpu.dll"
  Delete "$INSTDIR\\ggml.dll"
  Delete "$INSTDIR\\llama.dll"
!macroend
