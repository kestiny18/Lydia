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
Name: "{group}\Start Lydia"; Filename: "{app}\lydia-start.cmd"
Name: "{group}\Stop Lydia"; Filename: "{app}\lydia-stop.cmd"
Name: "{group}\Uninstall Lydia"; Filename: "{uninstallexe}"

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "Lydia"; ValueData: """{app}\lydia.cmd"" start"; Flags: uninsdeletevalue

[Run]
Filename: "{app}\lydia.cmd"; Parameters: "start"; Flags: postinstall runhidden skipifsilent
Filename: "{app}\lydia-dashboard.cmd"; Flags: postinstall skipifsilent shellexec

[UninstallRun]
Filename: "{app}\lydia.cmd"; Parameters: "stop"; Flags: runhidden
