# vscode-escript

`vscode-escript` helps developers write, understand and improve Escript code for
POL shards by providing:

 - code completion
 - compile errors and warnings
 - signature help
 - go-to-definition
 - hover information
 - debugger

## Setup

This extension requires no additional software, as POL's Escript analytics are
included in the extension.

### Project setup

After installing the extension, open a POL distribution via "Open Folder".
Ensure that the folder selected contains `pol.cfg` and `scripts/ecompile.cfg`
files.

### Extension Configuration

The extension contains various options that alter the behavior of its analytics,
documentation features, and other behaviors. Search for "Escript" inside the
VSCode Preferences panel to find the current configuration options.

## Language Features

### Code completion

Suggestions will appear as you type names. Because vscode-escript uses POL's
Escript parser parser, code completion has access to precise information of
symbols, such as variables, module functions, and user functions.

![Code-completion](doc-assets/code-completion.png)

### Compiler errors and warnings

Code errors are shown as you type (both as red squiggle underlines, and in the
"Problems" panel). These are the same as produced by the Escript compiler.

![Problems](doc-assets/problems.png)

### Signature help

When typing `(` or `,`, the extension will show documentation for functions, as
well as the active parameter.

![Signature-help](doc-assets/signature-help.gif)

### Hover information

escript-vscode can describe almost any entity if you hover the mouse (or press
Ctrl-KI).

![Hover](doc-assets/hover.png)

### Debugger

POL 100.2.0 includes a Debug Adapter Protocol (DAP) server which the
vscode-escript extension can connect to for interactive debugging. New scripts
can be launched, and already-running scripts can be attached to. The debugger
supports the following features:

- execution flow (pause, continue, step in/out/over)
- breakpoints
- evaluating identifiers and simple expressions (eg. member access `who.name`)
  via Debug Console and Watch pane
- showing in-scope variables, setting variables in Variables pane
- changing current scope by using the Call Stack pane

![Debugger](doc-assets/debugger.png)

## Troubleshooting/bugs

The extension uses a built-in version of the Escript compiler, and may crash
when processing invalid sources (eg. when actively typing). Disabling the
extension option `escript.continueAnalysisOnError` can assist with crashes on
erroneous sources at the expense of some functionality, as the extension will
not process an invalid source.

If the EScript Language Server crashes, it can be restarted by reloading the
window (Command Palette > Developer: Reload Window).

If you've found a bug in this extension, please file it at
https://github.com/polserver/vscode-escript/issues.

## Running the Extension via Debugging

- Run `npm install && npm build` in this folder. This installs all necessary
  node modules in both the client and server folder
- Open VS Code on this folder.
- Press Ctrl+Shift+B to compile the client.
- Switch to the Debug viewlet.
- Select `Launch Client` from the drop down.
- Run the launch config.
- In the new Visual Studio Code [Extension Development Host], open a POL distro
  folder that contains `pol.cfg` and `scripts/ecompile.cfg`.
- Check the "ECompile Language Server" channel in the Output pane.
