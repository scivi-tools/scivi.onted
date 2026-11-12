# SciVi.OntEd

A lightweight editor for the `ONT` ontologies of the
[SciVi platform](https://ebooks.iospress.nl/doi/10.3233/FAIA220363).
See [docs/PLANNING.md](docs/PLANNING.md) for the requirements and the architecture.

## Running from source

Requires Node.js 20.19 or newer.

```sh
npm install
npm run dev        # start the editor with hot reload
```

`npm install` also downloads the Electron binary for your platform (the `postinstall` script):
since Electron 44, the `electron` package no longer does this by itself, and `electron-vite` 5
expects the binary to be present.

Other scripts:

| Command             | What it does                                         |
|---------------------|------------------------------------------------------|
| `npm test`          | run the unit tests (Vitest)                          |
| `npm run typecheck` | type-check everything (including the `.vue` files)   |
| `npm run build`     | build into `out/`                                    |
| `npm start`         | run the built app                                    |

## Installing the application

`npm run dist` builds the application for the system it runs on (`npm run dist:mac`, `npm run dist:linux`
for a specific one), into `dist/`.

* **macOS:** open `dist/SciVi.OntEd-<version>-<arch>.dmg` and drag SciVi.OntEd to Applications.
  The application is not signed with a developer certificate (only ad-hoc), which is fine on the Mac it was
  built on. A copy built elsewhere is blocked by macOS at first; allow it in System Settings > Privacy & Security,
  or run `xattr -dr com.apple.quarantine /Applications/SciVi.OntEd.app`.
* **Linux:** copy `dist/SciVi.OntEd.AppImage` to `~/Applications/` and make it executable (`chmod +x`).

SciVi.OntEd registers itself as the default application for `.ont` files, so they open with a double click in
Finder, with "Open With", or by dropping them on the Dock icon. If another application had been chosen for
`.ont` files before, choose SciVi.OntEd in Finder's Get Info > Open with > Change All.
Files can also be dropped onto any open SciVi.OntEd window.

## Command line

`scripts/onted` opens ontologies from the command line: `onted a.ont b.ont` (in new windows or tabs of the running
application; files that are open already are brought to the front). Put it on your `PATH`, e.g.:

```sh
ln -s "$PWD/scripts/onted" /usr/local/bin/onted    # or into ~/bin, if that is on your PATH
```

On macOS, it uses the installed application. On Linux, it uses `~/Applications/SciVi.OntEd.AppImage`
(or the AppImage named by the `ONTED_APPIMAGE` environment variable).

## Configuration

`config/onted.config.json` holds the names of the system nodes (drawn in light yellow)
and the colours of the relations. Missing keys fall back to the built-in defaults.

It is built into the application. To change the settings of an installed application, put an
`onted.config.json` into `~/Library/Application Support/SciVi.OntEd/` (macOS) or `~/.config/SciVi.OntEd/`
(Linux): its keys override the built-in ones (relation colours one by one).

## Project layout

```
src/core/               the model, ONT reading/writing, commands with undo/redo, validation
                        (plain TypeScript: no DOM, no Vue, no Electron)
src/editor/             the UI (Vue 3): the canvas, the panels, the command registry
src/platform/types.ts   the interface the editor needs from its host
src/platform/electron/  the Electron implementation: main process, preload script, native menu
config/                 the editor configuration
resources/              the application icon (icon.svg is the source of icon.png)
scripts/onted           the command-line launcher
tests/                  unit tests
docs/                   planning, sample ontologies
```

## License

SciVi.OntEd is free software, licensed under the
[GNU General Public License v3.0 or later](LICENSE).
