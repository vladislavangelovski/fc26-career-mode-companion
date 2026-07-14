!include "nsDialogs.nsh"

!ifndef BUILD_UNINSTALLER
Var DesktopShortcutCheckbox
Var DesktopShortcutChoice

!macro customInit
  StrCpy $DesktopShortcutChoice ${BST_CHECKED}
!macroend

!macro customPageAfterChangeDir
  Page custom DesktopShortcutPage DesktopShortcutPageLeave
!macroend

Function DesktopShortcutPage
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 24u "Choose whether Setup should add a shortcut for FC 26 Career Analyst."
  Pop $0
  ${NSD_CreateCheckbox} 0 32u 100% 12u "Create a Desktop shortcut"
  Pop $DesktopShortcutCheckbox
  ${NSD_Check} $DesktopShortcutCheckbox
  nsDialogs::Show
FunctionEnd

Function DesktopShortcutPageLeave
  ${NSD_GetState} $DesktopShortcutCheckbox $DesktopShortcutChoice
FunctionEnd

!macro customInstall
  ${If} $DesktopShortcutChoice != ${BST_CHECKED}
    Delete "$newDesktopLink"
  ${EndIf}
!macroend
!endif
