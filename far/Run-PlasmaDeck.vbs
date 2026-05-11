Option Explicit

' PlasmaDeck app-like one-click launcher (Windows)
' - Runs the .cmd launcher hidden (no console window)
' - The .cmd will install dependencies if needed, build, start server, and open browser

Dim shell, cmdPath, workingDir
Set shell = CreateObject("WScript.Shell")

workingDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
cmdPath = Chr(34) & workingDir & "\Run-PlasmaDeck.cmd" & Chr(34)

' 0 = hidden window, False = don't wait
' If nothing opens, try running Run-PlasmaDeck.cmd directly to see console output.
shell.Run "cmd.exe /c " & cmdPath, 0, False

