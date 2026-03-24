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

[Files]
Source: "..\..\.release\windows\bundle\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Open Lydia"; Filename: "{app}\lydia-dashboard.cmd"
Name: "{group}\Lydia Tray"; Filename: "{app}\lydia-tray.cmd"
Name: "{group}\Start Lydia"; Filename: "{app}\lydia-start.cmd"
Name: "{group}\Stop Lydia"; Filename: "{app}\lydia-stop.cmd"
Name: "{group}\Uninstall Lydia"; Filename: "{uninstallexe}"

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

procedure ExecPowerShell(const Script: string);
var
  ResultCode: Integer;
begin
  Exec(
    PowerShellExe(),
    '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "' + Script + '"',
    '',
    SW_HIDE,
    ewWaitUntilTerminated,
    ResultCode
  );
end;

procedure ForceTerminateExistingLydia();
var
  AppPath: string;
  EscapedAppPath: string;
begin
  AppPath := ExpandConstant('{app}');
  EscapedAppPath := StringChangeEx(AppPath, '''', '''''', True);

  ExecPowerShell(
    '$app = ''' + EscapedAppPath + '''; ' +
    '$procs = Get-CimInstance Win32_Process | Where-Object { ' +
      '(($_.ExecutablePath -ne $null) -and $_.ExecutablePath.StartsWith($app, [System.StringComparison]::OrdinalIgnoreCase)) ' +
      '-or ' +
      '(($_.CommandLine -ne $null) -and $_.CommandLine.IndexOf($app, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) ' +
    '}; ' +
    'foreach ($p in $procs) { try { Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop } catch {} }'
  );
end;

procedure ShutdownExistingLydia();
var
  ResultCode: Integer;
begin
  if FileExists(ExpandConstant('{app}\lydia-tray.ps1')) then
  begin
    Exec(
      PowerShellExe(),
      '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + ExpandConstant('{app}\lydia-tray.ps1') + '" -Shutdown',
      '',
      SW_HIDE,
      ewWaitUntilTerminated,
      ResultCode
    );
  end;

  if FileExists(ExpandConstant('{app}\lydia.cmd')) then
  begin
    Exec(
      ExpandConstant('{app}\lydia.cmd'),
      'stop',
      '',
      SW_HIDE,
      ewWaitUntilTerminated,
      ResultCode
    );
  end;

  Sleep(1500);
  ForceTerminateExistingLydia();
  Sleep(1000);
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssInstall then
  begin
    ShutdownExistingLydia();
  end;
end;
