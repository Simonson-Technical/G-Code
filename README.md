# G-Code (Multi-Channel)

A VS Code extension for editing G-code on multi-channel CNC machines, such as Swiss-type and mill-turn lathes where code for several channels (paths) needs to be compared and edited simultaneously.

## Features

- **Syntax highlighting by word type**: axes, G/M codes, tool calls, spindle, feedrate, and arc parameters each get their own color so programs are easier to scan.
- **Multi-channel splitting**: a configurable pattern enables multiple channels to be shown side by side and compared.
- **Sync code matching**: toggle matching and highlighting of wait/sync codes between channels so you can see where channels hand off to each other.

## Supported files

Registered for the `g-code` language:

`.nc` `.ncf` `.prg` `.min` `.ssb`

The extension's behavior is limited to the extensions listed in the `g-code.fileExtensions` setting (default: `.nc`, `.ncf`, `.prg`).

## Requirements

- VS Code 1.75 or newer

## Installation

<!-- TODO: replace with Marketplace install steps once published -->

## Usage

Open a file with one of the supported extensions. The language mode should switch to **G-Code** automatically; if not, pick it from the language selector in the status bar.

### Commands

| Command | Description |
| --- | --- |
| `G-Code: Enable Sync View` | Opens the multi-channel sync view |
| `G-Code: Enable Sync Code Matching` | Turns on highlighting of sync codes across channels |
| `G-Code: Disable Sync Code Matching` | Turns it off |

These appear as buttons in the editor title bar when a G-Code file is active.

### Enable Sync View

This command opens a file picker that finds files in the working directory only. If you cannot find a file, make sure you have the correct directory(folder) open in VSCode. It also only matches files with the correct file extension(s).

If your machine accepts code structured in a single file and splits channels at the machine control, you must have a split marker setup in your configuration file. The default is setup for Citizen controls.

Select either a single file to split, or one file per control channel.

If you are selecting multiple files, make sure you select them in order matching the channels on your machine control.

### Enable Sync Matching

This command turns on highlighting for syncing or wait codes for your machine control. It will parse the files in your split view and highlight clean and dirty codes across channels.

Command is not available without an active Sync View session.

The default configuration is setup for Mitsubishi style wait codes. Edit configuration files for your machine(s).

### Disable Sync Matching

Turns off highlighting.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `g-code.splitMarker` | `\$[2-3]` | Regex used to split a program into channels |
| `g-code.syncPattern` | `(![1-3]?)+L\d+` | Regex used to identify channel synchronization codes |
| `g-code.channelLabels` | `{ "1": "!1", "2": "!2", "3": "!3" }` | Maps a channel number to its wait-code pattern |
| `g-code.fileExtensions` | `[".nc", ".ncf", ".prg"]` | File extensions the extension operates on |

Adjust `splitMarker`, `syncPattern`, and `channelLabels` to match your control's channel and wait-code conventions.

## Editing settings

You can change settings through the Settings UI or by editing settings.json directly.

### Option 1: Settings UI

Open Settings: File > Preferences > Settings (Code > Settings > Settings on macOS), or press Ctrl+, (Cmd+, on macOS).

Type G-Code in the search bar, or expand Extensions > G-Code in the left sidebar.

Edit the value. Text and list settings can be changed in place.

g-code.channelLabels is an object, so the UI shows an Edit in settings.json link instead of a field. Click it to continue in JSON.

### Option 2: settings.json

Open the Command Palette (Ctrl+Shift+P / Cmd+Shift+P).

Run one of:

Preferences: Open User Settings (JSON) to apply the setting everywhere on your machine.

Preferences: Open Workspace Settings (JSON) to apply it only to the current project. This is saved in .vscode/settings.json, so it can be committed and shared with a team.

Add or change the g-code.* keys, then save.

Workspace settings override user settings, which override the extension defaults. If a setting does not seem to take effect, run Developer: Reload Window from the Command Palette.

## Highlight colors

Token scopes are colored by default as follows. You can override any of them in your own `editor.tokenColorCustomizations`.

| Element | Scope | Color |
| --- | --- | --- |
| X axis | `x-axis.g-code` | `#61AFEF` |
| Y axis | `y-axis.g-code` | `#E5C07B` |
| Z axis | `z-axis.g-code` | `#E06C75` |
| A axis | `a-axis.g-code` | `#D9648F` |
| B axis | `b-axis.g-code` | `#56B6C2` |
| C axis | `c-axis.g-code` | `#98C379` |
| Radius (R) | `radius.g-code` | `#E88AB8` |
| Arc I / J / K | `radI` / `radJ` / `radK.g-code` | `#4B8BD6` / `#D4A349` / `#C8505B` |
| G codes | `gcode.g-code` | `#6FB06A` |
| M codes | `mcode.g-code` | `#A9A1E8` |
| Tool | `tool.g-code` | `#E8B923` |
| Spindle | `spindle.g-code` | `#C4A484` |
| Feedrate | `feedrate.g-code` | `#C678DD` |
| Block comments | `comment.block.g-code` | `#7F848E` |

## Status

Early development (v0.0.1). Issues and feedback are welcome.

## About

Built by [Simonson Technical](https://github.com/Simonson-Technical), a consultancy focused on process development, troubleshooting, and NPI for CNC Swiss-type and mill-turn machinery.

## License

[MIT](LICENSE)