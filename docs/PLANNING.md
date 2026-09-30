# Intro

The SciVi.OntEd is a lightweight ontology editor, a modern and more stable alternative to
[Bobrnor's Ontolis](https://github.com/bobrnor/ontolis).

This is a part of
[SciVi, the ontology-driven semantic data mining platform](https://ebooks.iospress.nl/doi/10.3233/FAIA220363).

SciVi.OntEd is *not* meant to be a universal ontology editor.
It is a tool tied to the SciVi infrastructure,
and its purpose is to make the handling of SciVi-specific ontologies as efficient as possible.

# SciVi Platform

SciVi platform is a web application that allows the user to build and execute data processing pipelines,
describing them visually as dataflow diagrams (DFDs).

A SciVi DFD is a directed graph, in which the nodes represent operators and arcs represent connections by data.

The set of operators might be completely arbitrary.
These sets are prepared by software developers and knowledge engineers,
to allow end-users to solve specific tasks in specific application domains.

SciVi itself does not provide any default set of operators.
It is just a platform that can be populated by third-party operators,
and it only provides mechanisms to arrange and execute them, as well as to transfer the data between them.

The operators can run anywhere: on the server, on the client, and even on some specific hardware like IoT devices.
SciVi manages the dataflow automatically, making it completely transparent for the user.

To be registered in SciVi, the operator has to have an ontological description.
This description can be automatically generated from the operator's source code,
but sometimes it also has to be viewed/modified (or even made from scratch) manually.
This is where SciVi.OntEd kicks in.

# Core Concept

At the current stage, SciVi.OntEd is meant to be used locally.
The main reason is that the SciVi ontologies are internal thing available to the knowledge engineer only,
and currently there is no Web interface for them.
However, this might change in the future, so the editor should be easily portable to the Web.
Also, cross-platform portability is crucial: SciVi is actively used and maintained on macOS and GNU/Linux.

With all that said, Electron seems to be the best candidate for a framework, SciVi.OntEd can be based on.
And the Electron-specific things should be clearly separated from the core,
so the potential port to the Web can go smoothly.

# Ontology Representation

SciVi.OntEd should provide functionality to view and edit ontologies stored in the `ONT` format.

`ONT` is a non-standard format invented in Bobrnor's Ontolis.
It is based on JSON and allows storing the so-called lightweight ontologies: ontologies without axioms,
containing terms (aka "nodes") and relations only.

The examples of `ONT` files are in `docs/ont-samples`.

The "classical" `ONT` contains following sections:

* `last_id` - internal information that helps to know the last ID in the ontology.
  Both nodes and relations have IDs, and these IDs are unique within the `ONT` file.
  There is no separation between nodes' and relations' IDs, that's why the `last_id` is a single number.
  The IDs are incremental, so, if a new node or a new relation is appended, its ID becomes `last_id + 1`,
  and `last_id` is incremented. If a node or a relation is deleted and its ID is not equal to `last_id`,
  the `last_id` is not touched, so, an irreversable gap in IDs appears. Otherwise, `last_id` is decremented.
  Formally, `last_id` and all the IDs are stored as JSON strings (e.g. `"30"`), and the editor keeps saving them
  as strings. But these strings are guaranteed to be parsable as integers, so internally they are handled as integers.
* `namespaces` - internal information that has absolutely no meaning in SciVi.
   For compatibility, it can always be set to
   ```
   "namespaces": {
        "default": "https://scivi.tools/",
        "owl": "http://www.w3.org/2002/07/owl",
        "rdf": "http://www.w3.org/1999/02/22-rdf-syntax-ns",
        "rdfs": "http://www.w3.org/2000/01/rdf-schema",
        "xsd": "http://www.w3.org/2001/XMLSchema"
    },
    ```
    It should not be displayed or modified by the editor.
    The namespace policy (applies to this section and to the `namespace` fields of nodes and relations):
    * Files created from scratch in the editor get `https://scivi.tools/` only (the block above).
    * Files created elsewhere keep their namespaces as they are, both in this section and in existing nodes/relations.
    * Any new node or relation created in the editor gets the `https://scivi.tools/` namespace.
    * Namespaces play no role in SciVi and are never mentioned in the editor's UI.
* `nodes` - array of nodes (terms). Each node contains the following:
    * `attributes` - dictionary of arbitrary attributes.
      Unlike classical ontologies, `ONT` allows to attach arbitrary attributes to any term.
      This function is actively used in SciVi,
      so the editor should provide conventient tools to view and edit this dictionary.
      The attribute values are typed: strings, integers, floats, and booleans occur in practice.
      The editor must preserve the types (e.g. `true` and `"true"` are different values).
    * `id` - ID of the term (stored as a string, parsed as an integer; see `last_id`).
    * `name` - string name of the term.
      The name can be arbitrary string, may also contain spaces, special characters, and unicode characters/
    * `namespace` - namespace of the term. For new terms, it is always `https://scivi.tools/`.
      In SciVi, this field is basically ignored and is stored here for compatibility only (see the namespace policy above).
    * `position_x` - X-coordinate of the graph node in the editor.
      There is no strict logic, what exactly this is: what are the units, what is the coordinate system,
      and which point of the node (either of corners or center) it attributes.
      In SciVi the browser coordinate system is assumed (0 in top-left corner),
      and the anchor point is in the top-left corner of the rect representing the node.
    * `position_y` - Y-coordinate of the graph node in the editor.
* `relations` - array of relations between nodes (terms). Each relation contains the following:
    * `attributes` - dictionary of arbitrary attributes.
      Unlike classical ontologies, `ONT` allows to attach arbitrary attributes to any relation.
      But unlike attributes of nodes, the attributes of relations are not used in SciVi.
      So, for now, this can be left always empty in any artifact created by the editor.
      Neither should it be displsyed in the editor.
    * `source_node_id` - ID of the node, from which the relation goes.
    * `destination_node_id` - ID of the node, to which the relation goes.
    * `id` - ID of the relation.
    * `namespace` - namespace of the relation. For new relations, it is always `https://scivi.tools/`
      (see the namespace policy above).
    * `name` - name of the relation. In `ONT`, it can be arbitrary string.
      But in SciVi, the set of supported relations is restricted to the following:
        1. `is_a`.
        2. `a_part_of`.
        3. `has`.
        4. `is_instance`.
        5. `is_used`.
        6. `is_hosted`.
        7. `base_type`.
        8. `language` (in the future, should be renamed to `is_written`).
      So, wherever the editor handles the relation names, it should restrict the set to these 8.
      The format technically permits other names (even empty ones, which occur in some broken files),
      but the editor must never produce them. When such a relation is loaded, it should be flagged as invalid.
* `visualize_ont_path` - irrelevant for SciVi, should always be enmty and should not be displayed in the editor.

## File Formatting

All the existing `ONT` files follow the same JSON formatting (inherited from Qt's `QJsonDocument`):
keys are sorted alphabetically, indentation is 4 spaces, an empty object is written as `{`, newline, `}`
(the closing brace at the indentation of its key), and the file ends with a newline.
The editor reproduces this formatting exactly, so that loading and saving an unmodified file yields a byte-identical
result, and the diffs of modified files stay minimal (the files are normally kept under version control).

# Required Editor Functionality

## General View

The editor should allow to open and save `ONT`-formatted ontologies.

It should display the ontology as a graph, where the terms are depicted as graph nodes
(preferably, drawn as rectangle boxes with the text: the terms' names), and relations displayed as arrows.

## Relations

As the set of relations in SciVi is strictly limited to 8, the arrows don't can have individual colours with the legend
displayed somewhere on the screen. So, the descriptions on top of the arrows can be omitted not to clutter the image.

There is already a colour convention used in the SciVi papers:
1. `is_a` - #0F01F5.
2. `a_part_of` - #FF968D.
3. `has` - #B82619.
4. `is_instance` - #EA33F7.
5. `is_used` - #55BB36.
6. `is_hosted` - #73BEF9.
7. `base_type` - #929292.
8. `language` - #F09937.

## Interactions

The editor should allow creating arbitrary nodes, drag-and-drop them over the canvas, deleting them,
and adding relations between them. All these operations should be as ergonomic as possible:
* `Shift + A` to add a new node.
* `Left-Click` to select a node or a relation.
* `Double Left-Click` to rename a node.
* `Shift + Left-Click` to select more than one node.
* `Shift + 1` to link two selected nodes by `is_a`. `Shift + 2` to link by `a_part_of`, etc.
* `Delete` or `Backspace` to delete selected node(s) or relation(s).
* `Ctrl + Z` to undo the last action.
* `Ctrl + Shift + Z` to redo the last undone action.

Notes:
* On macOS, `Ctrl` in the shortcuts above means `Cmd`.
* The shortcuts are bound to the physical key positions (not to the produced characters),
  so they work regardless of the keyboard layout (e.g. `Shift + 1` should not turn into `!`).
* The direction of the relation created by `Shift + 1...8` is defined by the selection order:
  it goes from the first selected node to the second selected one.
  If more than two nodes are selected, each of the earlier-selected nodes is linked to the last-selected one.
* Rectangle-based (rubber band) selection is not required for the first release, but may be added later.

All the interactions should be also reachable via the main menu and right-click menu.

### Interaction Details (as implemented; to be reviewed)

* Shortcuts:
  * The shortcuts with `Ctrl`/`Cmd` (undo/redo, select all, file operations, fit to window) belong to the platform:
    in Electron, they are accelerators of the native main menu.
  * The single-key shortcuts (`Shift + A`, `Shift + 1...8`, `Delete`/`Backspace`, `F2`, `Enter`, `Escape`)
    are handled by the editor itself, by physical key position, and are ignored while typing in a text field.
    The main menu only shows them in the item labels: registered as menu accelerators,
    they could take these keys away from the text fields (e.g. on macOS).
  * In a text field, undo/redo/select all act on the text.
* `F2` renames the selected node (in addition to the double click); `Enter` moves the focus to the attributes;
  `Escape` clears the selection.
* `Shift + A` adds a node named "New Term" centred at the mouse pointer (or at the centre of the view)
  and immediately starts renaming it; `Escape` keeps the default name.
* Selection: a click selects a node or a relation (relations have a wider invisible hit area);
  `Shift + Click` adds/removes an element; a click on the background clears the selection.
  Dragging a selected node moves all the selected nodes; a drag is one undoable step.
* Relations can also change their type: via the inspector, the context menu, or the main menu.
  This also allows fixing the relations with invalid types found in loaded files.
* The context menu is HTML (not native), so it will also work in the Web version.

## Attributes Editing

The attributes are edited in an inspector panel docked at the side of the window
(when relations are selected, the panel shows their type instead).
When a single node is selected, the panel shows its attributes as a table of key/value pairs,
where each value has an explicit type (string, integer, float, boolean) with a type-appropriate editor.
The panel allows adding, renaming, retyping, and deleting attributes. `Ctrl + Double Left-Click` on a node
(or `Enter` when a single node is selected) moves the keyboard focus to the panel.
Attribute edits are undoable as any other action.

## System Nodes

There are two types of nodes: "custom", displayed in white, and "system" displayed in light-yellow.
The "system" nodes are those which are treated specially by SciVi.
There should be a config file with the names of those nodes. We can start with the following list:
* "Input".
* "Output".
* "Setting".

But there will be more. Whenever the user creates the node with one of those names (case-sensitive), the node should
be painted light-yellow.

## Auto-Layout

It would be great to have some rarely-used (no hotkey) auto-layout functions to layout the graph by minimising the
intersections of arrows. Not a top priority, but nice feature.

Implemented as follows (menu "Arrange", and "Auto-Layout" in the canvas context menu; one undoable step):
* Hierarchical layout (ELK "layered", minimising arrow crossings), in two orientations:
  vertical, with the arrows pointing up (as in the existing SciVi ontologies), and horizontal,
  with the arrows pointing left. The horizontal one is much more compact when a term has many children,
  since the node boxes are wider than they are tall.
* Organic layout (ELK "stress", followed by ELK's overlap removal), for graphs without a clear hierarchy.
* ELK optimises for arrows that bend around nodes, but the editor draws them straight. So for hierarchical
  layouts, several ELK variants are computed and the one with the fewest crossings and arrows through other
  nodes (as drawn by the editor) wins (only one variant above 200 nodes).
  On the samples: crossings 360 -> 265 (vertical) / 238 (horizontal); arrows through other nodes 422 -> about 50-130.
* The laid-out graph keeps its top-left corner, then the view is fitted to the window.
* ELK runs in a Web Worker created from a Blob (workers from file:// are not allowed in Electron);
  if that fails, it runs on the main thread. ELK is licensed under EPL-2.0 or GPL-3.0-or-later.

## Handling Arrow Intersections

In general case, the arrow intersections are inevitable, as ontologies are often non-planar.
To increase the visibility, that would be great to draw some kind of "tunnels" when the arrows intersect, when
underlaying arrow remains straight, but the intersecting one has a little arc in the intersection point,
so they are visually distinguishable.

Implemented as follows:
* Of two crossing arrows, the one with the larger ID jumps (so adding a relation never changes how the existing
  ones are drawn); the arcs bulge up on the screen (to the left for vertical arrows).
* No tunnels near the ends of arrows (at the nodes and under the arrowheads), between arrows sharing a node,
  or for crossings at angles below 15° (for nearly parallel arrows, a tunnel would look like a loop).
* Close crossings on the same arrow merge into one wider arc.
* The crossings are found by a sweep over the arrows' bounding boxes; in graphs with more than 300 arrows,
  the tunnels are recomputed when a drag ends rather than on every move.

# Technologies to Use

It has to be decided, which drawing API and which graph drawing library (if any) to use.
The SciVi ontologies are normally small: no more than 100 nodes (and normally much less, 20-30).
So, SVG-based rendering would be more than enough.
In very rare cases, the combined ontology can be viewed, which will contain 1000+ nodes.
But even that one seems to be teatable by SVG.

Drawing arrows is trickier because of the desired intersection handling. But the number of arrows will normally also
stay within docents, rarely going up to 100+.

# Architecture and Technology Decisions

This section records the decisions agreed so far.

## Technology Stack

* Desktop shell: [Electron](https://www.electronjs.org/). The renderer runs with context isolation;
  it talks to the main process only through a narrow API exposed by the preload script.
* Language: TypeScript (strict mode) everywhere. TypeScript 6.0 is used for now:
  `vue-tsc` (type-checking of the `.vue` files) does not support TypeScript 7 yet.
* Build tooling: [electron-vite](https://electron-vite.org/) (Vite-based).
* UI framework: [Vue 3](https://vuejs.org/) (Composition API, `<script setup lang="ts">` single-file components).
* Graph rendering: a custom SVG renderer, with [d3-zoom](https://d3js.org/d3-zoom) for panning and zooming.
  No general-purpose diagram library is used: the graphs are small, and the specific requirements
  (arrow "tunnels", the exact interaction model) are easier to meet with a renderer we fully control.
* Auto-layout: [ELK.js](https://github.com/kieler/elkjs) (layered layout with crossing minimisation),
  run in a Web Worker.
* Tests: [Vitest](https://vitest.dev/) for the core, [Playwright](https://playwright.dev/) for end-to-end tests.
* Distribution: running from source is sufficient for the first release. Packaged installers are a far-future option.

## Layers

The code is split into three layers, so that a port to the Web touches the platform layer only:

1. `core/` - plain TypeScript, no DOM, no Vue, no Electron:
   * the ontology data model;
   * `ONT` parsing and serialisation (with the exact formatting described above,
     preserving the fields the editor does not handle);
   * ID allocation following the `last_id` rules;
   * all modifications go through reversible commands, which gives undo/redo;
   * validation (e.g. unknown or empty relation names);
   * change notifications via events, so that any UI can observe the model.
2. `editor/` - the UI running in the renderer (browser environment), built with Vue:
   * the SVG canvas and its geometry (clipping arrows at the node boxes, detecting arrow intersections, drawing tunnels);
   * the inspector panel, the relation colour legend, the context menus, the status line;
   * a single command registry: every action (ID, label, shortcut, handler) is defined once
     and is used by the keyboard shortcuts, the context menus, and the main menu alike.
   The editor only reads the model and issues commands to it; the model does not depend on Vue.
3. `platform/` - a small interface for opening/saving files, confirmation dialogs, the main menu, and loading the config.
   The Electron implementation uses the main process (native dialogs, native menu, window title with the "modified" mark,
   confirmation on closing a modified document). A future Web implementation would use the File System Access API
   or upload/download.

The directories: `src/core/`, `src/editor/`, `src/platform/` (the interface in `types.ts`,
the Electron implementation in `electron/`), `tests/`.

## Configuration

The list of system node names and the relation colours are kept in a JSON config file
(`config/onted.config.json`, with built-in defaults for missing keys),
so that extending the list of system nodes requires no code changes.

## Testing Approach

* The round-trip test: every sample in `docs/ont-samples` is loaded and saved, and the result must be byte-identical
  to the original.
* Unit tests for ID allocation, the commands and undo/redo, and the geometry (arrow clipping, intersections).

# Code of Conduct

1. The design and architectural decisions should be discussed with Kon before applied.
2. This document can be modified and should be kept up-to-date while the plan and implementation evolve.
