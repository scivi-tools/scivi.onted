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
* `nodes` - array of nodes (terms). Each node contains the following:
    * `attributes` - dictionary of arbitrary attributes.
      Unlike classical ontologies, `ONT` allows to attach arbitrary attributes to any term.
      This function is actively used in SciVi,
      so the editor should provide conventient tools to view and edit this dictionary.
    * `id` - ID (number) of the term.
    * `name` - string name of the term.
      The name can be arbitrary string, may also contain spaces, special characters, and unicode characters/
    * `namespace` - namespace of the term. For SciVi, it should always be `https://scivi.tools/`.
      In SciVi, this field is basically ignored and is stored here for compatibility only.
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
    * `namespace` - namespace of the relation. For SciVi, it should always be `https://scivi.tools/`.
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
      So, wherever the editor handles the relation names, it should restrict the set to these 7.
* `visualize_ont_path` - irrelevant for SciVi, should always be enmty and should not be displayed in the editor.

# Required Editor Functionality

## General View

The editor should allow to open and save `ONT`-formatted ontologies.

It should display the ontology as a graph, where the terms are depicted as graph nodes
(preferably, drawn as rectangle boxes with the text: the terms' names), and relations displayed as arrows.

## Relations

As the set of relations in SciVi is strictly limited to 7, the arrows don't can have individual colours with the legend
displayed somewhere on the screen. So, the descriptions on top of the arrows can be omitted not to clutter the image.

There is already a colour convention used in the SciVi papers:
1. `is_a` - #0000FF.
2. `a_part_of` - #FEAE00.
3. `has` - #C80000.
4. `is_instance` - #FF00FF.
5. `is_used` - #B51700.
6. `is_hosted` - #56C1FF.
7. `base_type` - #B2B2B2.
8. `language` - #FF9400.

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

All the interactions should be also reachable via the main menu and right-click menu.

## Attributes Editing

Some decision should be taken on how to access and edit the attributes of nodes.
Maybe an editing box that opens on top of the node by something like `Ctrl + Doubleclick`.

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

## Handling Arrow Intersections

In general case, the arrow intersections are inevitable, as ontologies are often non-planar.
To increase the visibility, that would be great to draw some kind of "tunnels" when the arrows intersect, when
underlaying arrow remains straight, but the intersecting one has a little arc in the intersection point,
so they are visually distinguishable.

# Technologies to Use

It has to be decided, which drawing API and which graph drawing library (if any) to use.
The SciVi ontologies are normally small: no more than 100 nodes (and normally much less, 20-30).
So, SVG-based rendering would be more than enough.
In very rare cases, the combined ontology can be viewed, which will contain 1000+ nodes.
But even that one seems to be teatable by SVG.

Drawing arrows is trickier because of the desired intersection handling. But the number of arrows will normally also
stay within docents, rarely going up to 100+.

# Code of Conduct

1. The design and architectural decisions should be discussed with Kon before applied.
2. This document can be modified and should be kept up-to-date while the plan and implementation evolve.
