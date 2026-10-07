Unicode true
!include "MUI2.nsh"
Name "Context Anywhere Setup"
OutFile "${DIST}\Context-Anywhere-Setup-${VERSION}-x64.exe"
InstallDir "$LOCALAPPDATA\Programs\Context Anywhere Setup"
InstallDirRegKey HKCU "Software\ContextAnywhereSetup" "InstallPath"
RequestExecutionLevel user
SetCompressor /SOLID lzma
BrandingText "Context Anywhere"
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\ContextAnywhere.exe"
!define MUI_FINISHPAGE_RUN_TEXT "打开 Context Anywhere 安装向导"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "${DIST}\LICENSE.txt"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "SimpChinese"
!insertmacro MUI_LANGUAGE "English"
Section "Install"
  SetOutPath "$INSTDIR"
  File "${DIST}\ContextAnywhere.exe"
  File "${DIST}\LICENSE.txt"
  File "${DIST}\README.txt"
  File "${DIST}\THIRD-PARTY-NOTICES.txt"
  File /r "${DIST}\app"
  File /r "${DIST}\runtime"
  File /r "${DIST}\payload"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  CreateDirectory "$SMPROGRAMS\Context Anywhere"
  CreateShortcut "$SMPROGRAMS\Context Anywhere\安装向导.lnk" "$INSTDIR\ContextAnywhere.exe"
  WriteRegStr HKCU "Software\ContextAnywhereSetup" "InstallPath" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ContextAnywhereSetup" "DisplayName" "Context Anywhere Setup"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ContextAnywhereSetup" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ContextAnywhereSetup" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ContextAnywhereSetup" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ContextAnywhereSetup" "NoRepair" 1
SectionEnd
Section "Uninstall"
  ; Only files installed by this package. Preserve cloud data, vaults and encrypted deployment receipt.
  Delete "$INSTDIR\ContextAnywhere.exe"
  Delete "$INSTDIR\LICENSE.txt"
  Delete "$INSTDIR\README.txt"
  Delete "$INSTDIR\THIRD-PARTY-NOTICES.txt"
  RMDir /r "$INSTDIR\app"
  RMDir /r "$INSTDIR\runtime"
  RMDir /r "$INSTDIR\payload"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
  Delete "$SMPROGRAMS\Context Anywhere\安装向导.lnk"
  RMDir "$SMPROGRAMS\Context Anywhere"
  DeleteRegKey HKCU "Software\ContextAnywhereSetup"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ContextAnywhereSetup"
SectionEnd
