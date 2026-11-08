' ============================================================
'  md-view.vbs  --  Open a .md file, render it to HTML, show it
'
'  Usage:  wscript.exe md-view.vbs "C:\path\to\file.md"
'
'  Behaviour:
'    1. Compute the sibling .html path (same name, .html extension)
'    2. If the .html is missing or older than the .md -> run node to convert
'    3. Open the .html with the default browser
'
'  Debug:  set MDVIEW_DEBUG=1 to write a log to %TEMP%\md-view.log
'
'  IMPORTANT: this script is intentionally ASCII-ONLY.
'  wscript reads a BOM-less .vbs as ANSI/GBK, so non-ASCII literals
'  (e.g. Chinese) corrupt the parse and pop a modal syntax-error box.
'  Do NOT add non-ASCII text here.
' ============================================================

Option Explicit

Dim Q, NEWLINE
Q = Chr(34)          ' double quote - avoids brittle quote escaping
NEWLINE = vbCrLf

' ---------------- configuration ----------------
Dim NODE_EXE, CONV_JS
NODE_EXE = "E:\Node\node.exe"
CONV_JS  = "C:\Users\lenovo\.dsh\skills\md-view\md2html.js"
' -----------------------------------------------

Dim args, mdPath, htmlPath, dotPos
Dim fso, sh, cmd, needConv, rc, logPath, debugOn

Set args = WScript.Arguments
Set fso  = CreateObject("Scripting.FileSystemObject")
Set sh   = CreateObject("WScript.Shell")

logPath = sh.ExpandEnvironmentStrings("%TEMP%") & "\md-view.log"
debugOn = (sh.ExpandEnvironmentStrings("%MDVIEW_DEBUG%") = "1")

Sub LogIt(msg)
    If debugOn Then
        Dim f
        Set f = fso.OpenTextFile(logPath, 8, True, -1)   ' -1 = Unicode, keeps CJK paths readable
        f.WriteLine Now & "  " & msg
        f.Close
    End If
End Sub

' ---------------- argument check ----------------
If args.Count = 0 Then
    MsgBox "No input file." & NEWLINE & NEWLINE & _
           "Drag a .md file onto this script, or set it as the default " & _
           "program for .md files.", 64, "md-view"
    WScript.Quit 0
End If

mdPath = args(0)
LogIt "start, arg = " & mdPath

If Not fso.FileExists(mdPath) Then
    MsgBox "File not found:" & NEWLINE & mdPath, 16, "md-view"
    WScript.Quit 1
End If

' ---------------- 1. target html path ----------------
dotPos = InStrRev(mdPath, ".")
If dotPos > 0 Then
    htmlPath = Left(mdPath, dotPos - 1) & ".html"
Else
    htmlPath = mdPath & ".html"
End If
LogIt "html target = " & htmlPath

' ---------------- 2. dependency check ----------------
If Not fso.FileExists(NODE_EXE) Then
    MsgBox "Node not found:" & NEWLINE & NODE_EXE, 16, "md-view"
    WScript.Quit 1
End If
If Not fso.FileExists(CONV_JS) Then
    MsgBox "Converter not found:" & NEWLINE & CONV_JS, 16, "md-view"
    WScript.Quit 1
End If

' ---------------- 3. incremental check ----------------
needConv = True
If fso.FileExists(htmlPath) Then
    If fso.GetFile(htmlPath).DateLastModified >= fso.GetFile(mdPath).DateLastModified Then
        needConv = False
    End If
End If
LogIt "need convert = " & needConv

' ---------------- 4. convert ----------------
If needConv Then
    cmd = Q & NODE_EXE & Q & " " & Q & CONV_JS & Q & " " & Q & mdPath & Q & " " & Q & htmlPath & Q
    LogIt "exec = " & cmd
    rc = sh.Run(cmd, 0, True)          ' 0 = hidden window, True = wait
    LogIt "exit code = " & rc
    If rc <> 0 Then
        MsgBox "Conversion failed (exit " & rc & "):" & NEWLINE & mdPath, 48, "md-view"
        WScript.Quit 1
    End If
End If

' ---------------- 5. open the html ----------------
If Not fso.FileExists(htmlPath) Then
    MsgBox "HTML still missing after conversion:" & NEWLINE & htmlPath, 16, "md-view"
    WScript.Quit 1
End If
LogIt "open = " & htmlPath
sh.Run Q & htmlPath & Q, 0, False

WScript.Quit 0
