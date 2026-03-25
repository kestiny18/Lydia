#define MyAppName "Lydia"
#define MyAppVersion GetEnv("LYDIA_VERSION")
#if MyAppVersion == ""
  #define MyAppVersion "0.1.2"
#endif

[Setup]
AppId={{0F3C7444-C6F0-47A5-B480-6D8C297A50CE}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher=Lydia
DefaultDirName={localappdata}\Programs\Lydia
DefaultGroupName=Lydia
OutputDir=out
OutputBaseFilename=Lydia-Setup-{#MyAppVersion}
Compression=lzma
SolidCompression=yes
PrivilegesRequired=lowest
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
DisableProgramGroupPage=yes
UninstallDisplayIcon={app}\lydia-dashboard.cmd
IconFile=app.ico

[Files]
Source: "..\..\.release\windows\bundle\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Open Lydia"; Filename: "{app}\lydia-dashboard.cmd"
Name: "{group}\Lydia Tray"; Filename: "{app}\lydia-tray.cmd"
Name: "{group}\Start Lydia"; Filename: "{app}\lydia-start.cmd"
Name: "{group}\Stop Lydia"; Filename: "{app}\lydia-stop.cmd"
Name: "{group}\Uninstall Lydia"; Filename: "{uninstallexe}"
Name: "{commondesktop}\Lydia"; Filename: "{app}\lydia-dashboard.cmd"

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "Lydia"; ValueData: """{sys}\WindowsPowerShell\v1.0\powershell.exe"" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\lydia-tray.ps1"""; Flags: uninsdeletevalue

[Run]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\lydia-tray.ps1"" -OpenDashboard"; Flags: postinstall runhidden skipifsilent

[UninstallRun]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\lydia-tray.ps1"" -Shutdown"; Flags: runhidden
Filename: "{app}\lydia.cmd"; Parameters: "stop"; Flags: runhidden

[Code]
function PowerShellExe(): string;
begin
  Result := ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe');
end;

procedure ForceTerminateExistingLydia();
var
  ResultCode: Integer;
begin
  // Run the dedicated kill script (handles graceful shutdown, taskkill /T tree
  // kill, and orphaned node.exe cleanup — all via -File to avoid escaping issues).
  if FileExists(ExpandConstant('{app}\lydia-kill.ps1')) then
  begin
    Exec(
      PowerShellExe(),
      '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + ExpandConstant('{app}\lydia-kill.ps1') + '"',
      '',
      SW_HIDE,
      ewWaitUntilTerminated,
      ResultCode
    );
  end;
end;

procedure ShutdownExistingLydia();
begin
  ForceTerminateExistingLydia();
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssInstall then
  begin
    ShutdownExistingLydia();
  end;
end;
