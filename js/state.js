/**
 * @file Open diagram, viewport, selection, clipboard, and preferences.
 *
 * @typedef {object} Column
 * @property {string} name
 * @property {string} dataType
 * @property {boolean} isPk
 * @property {boolean} isFk
 * @property {string|null} refTable
 * @property {string|null} refCol
 * @property {string} fkType
 *
 * @typedef {object} Table
 * @property {string} name
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} [height] Drawn height when the table is taller than its columns.
 * @property {string|null} bodyColor
 * @property {string|null} headerColor
 * @property {string} comment
 * @property {Column[]} columns
 *
 * @typedef {object} Relationship
 * @property {string} table1 Foreign-key table.
 * @property {string} fkCol
 * @property {string} table2 Primary-key table.
 * @property {string} pkCol
 * @property {string} type Cardinality such as "N:1".
 * @property {number|null} verticalX Manual route, or null for the automatic route.
 *
 * @typedef {object} CanvasNote
 * @property {string} id
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 * @property {string} color
 * @property {string} text
 *
 * @typedef {object} DiagramState
 * @property {Object<string, Table>} tables
 * @property {Relationship[]} relationships
 * @property {CanvasNote[]} canvasNotes
 * @property {number} canvasW
 * @property {number} canvasH
 * @property {string} notes Long-form notes shown in the side panel.
 *
 * @typedef {object} Selection
 * @property {"table"|"rel"|"note"|"multi"} kind
 * @property {string} [name] Table name when `kind` is "table".
 * @property {string[]} [names] Table names when `kind` is "multi".
 * @property {string[]} [noteIds] Canvas note ids when `kind` is "multi".
 * @property {string} [key] {@link relKey} when `kind` is "rel".
 * @property {string} [id] Note id when `kind` is "note".
 */
"use strict";

/**
 * @returns {DiagramState} An empty diagram with the default canvas size.
 */
function newState() {
  return {
    tables: {},
    relationships: [],
    canvasNotes: [],
    canvasW: DEFAULT_CANVAS_W,
    canvasH: DEFAULT_CANVAS_H,
    notes: "",
  };
}
var state = newState();
var view = { x: 0, y: 0, zoom: 1 };
var sel = null; // {kind:'table', name} | {kind:'rel', key}
var clipboard = null; // deep-copied table
var undoStack = [],
  redoStack = [];
var savedSnapshot = JSON.stringify(state);
var fileName = null; // display name of current file
var fileHandle = null; // FileSystemFileHandle when available
var prefs = {
  theme: "light",
  dataTypes: DEFAULT_COLUMN_DATA_TYPES.slice(),
  showCardText: true,
  showCardSymbols: true,
  themeDefaults: {}, // per-theme default table colors, e.g. {light:{header,body}}
};
