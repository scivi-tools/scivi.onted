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

Other scripts:

| Command             | What it does                                         |
|---------------------|------------------------------------------------------|
| `npm test`          | run the unit tests (Vitest)                          |
| `npm run typecheck` | type-check everything (including the `.vue` files)   |
| `npm run build`     | build into `out/`                                    |
| `npm start`         | run the built app                                    |

## Configuration

`config/onted.config.json` holds the names of the system nodes (drawn in light yellow)
and the colours of the relations. Missing keys fall back to the built-in defaults.

## Project layout

```
src/core/               the model, ONT reading/writing, commands with undo/redo, validation
                        (plain TypeScript: no DOM, no Vue, no Electron)
src/editor/             the UI (Vue 3): the canvas, the panels, the command registry
src/platform/types.ts   the interface the editor needs from its host
src/platform/electron/  the Electron implementation: main process, preload script, native menu
config/                 the editor configuration
tests/                  unit tests
docs/                   planning, sample ontologies
```

## License

SciVi.OntEd is free software, licensed under the
[GNU General Public License v3.0 or later](LICENSE).
