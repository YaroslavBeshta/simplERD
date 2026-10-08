/**
 * @file Effects for creating, editing, copying, and deleting tables.
 * Diagram changes go through the pure functions in diagram.js.
 */
"use strict";

/**
 * Remove a table, its relationships, and foreign keys that pointed at it.
 * @param {string} name
 * @returns {void}
 */
function deleteTable(name) {
  deleteTables([name]);
}

/**
 * Remove several tables in one undo step, with their relationships.
 * @param {string[]} names
 * @returns {void}
 */
function deleteTables(names) {
  const existing = names.filter((name) => state.tables[name]);
  if (!existing.length) return;
  pushUndo();
  state = withoutTables(state, existing);
  sel = null;
  update();
  toast(
    existing.length === 1
      ? `Table "${existing[0]}" deleted`
      : `${existing.length} tables deleted`,
  );
}

/**
 * @returns {string[]} Names of the currently selected tables.
 */
function selectedTableNames() {
  return tableNamesInSelection(state, sel);
}

/**
 * @returns {string[]} Ids of the currently selected canvas notes.
 */
function selectedNoteIds() {
  return noteIdsInSelection(state, sel);
}

/**
 * @param {string} id
 * @returns {boolean}
 */
function isNoteSelected(id) {
  return selectedNoteIds().indexOf(id) !== -1;
}

/**
 * @param {string} name
 * @returns {boolean}
 */
function isTableSelected(name) {
  return selectedTableNames().indexOf(name) !== -1;
}

/**
 * Select tables and canvas notes together.
 * One item stays a normal table or note selection so edit and copy still apply.
 * @param {string[]} tableNames
 * @param {string[]} noteIds
 * @returns {void}
 */
function setCanvasSelection(tableNames, noteIds) {
  sel = selectionFrom(state, tableNames, noteIds);
}

/**
 * Delete every selected table and canvas note in one undo step.
 * @returns {boolean} True when something was selected.
 */
function deleteSelectedCanvas() {
  const tables = selectedTableNames();
  const noteIds = selectedNoteIds();
  if (!tables.length && !noteIds.length) return false;
  if (!noteIds.length) {
    deleteTables(tables);
    return true;
  }
  if (!tables.length && noteIds.length === 1) {
    deleteNote(noteIds[0]);
    return true;
  }
  pushUndo();
  state = withoutNotes(withoutTables(state, tables), noteIds);
  sel = null;
  update();
  const parts = [];
  if (tables.length)
    parts.push(`${tables.length} table${tables.length === 1 ? "" : "s"}`);
  if (noteIds.length)
    parts.push(`${noteIds.length} note${noteIds.length === 1 ? "" : "s"}`);
  toast(`Deleted ${parts.join(" and ")}`);
  return true;
}

/**
 * Tables whose boxes overlap a scene rectangle.
 * @param {{x:number, y:number, w:number, h:number}} box
 * @returns {string[]}
 */
function tablesInRect(box) {
  return tablesOverlapping(state, box);
}

/**
 * Canvas notes whose boxes overlap a scene rectangle.
 * @param {{x:number, y:number, w:number, h:number}} box
 * @returns {string[]}
 */
function notesInRect(box) {
  return notesOverlapping(state, box);
}

/**
 * Remove a relationship and clear the foreign-key flag on its source column.
 * @param {string} key Value from {@link relKey}.
 * @returns {void}
 */
function deleteRelationship(key) {
  const r = state.relationships.find((r) => relKey(r) === key);
  if (!r) return;
  pushUndo();
  state = withoutRelationship(state, key);
  if (sel && sel.kind === "rel" && sel.key === key) sel = null;
  update();
  toast("Relationship deleted");
}

/**
 * Copy the selected table onto the internal clipboard.
 * @returns {void}
 */
function copySelectedTable() {
  if (!(sel && sel.kind === "table")) return;
  const t = state.tables[sel.name];
  if (!t) return;
  clipboard = deepCopy(t);
  toast(`Copied "${t.name}"`);
}

/**
 * Paste the clipboard as a new table.
 * @param {{x:number,y:number}} [pos] Scene position. Defaults to a grid offset.
 * @param {string} [verb] Toast verb. Defaults to "Pasted".
 * @returns {void}
 */
function pasteTable(pos, verb) {
  if (!clipboard) return;
  pushUndo();
  const pasted = withPastedTable(state, clipboard, pos);
  state = pasted.diagram;
  sel = { kind: "table", name: pasted.name };
  update();
  toast(`${verb || "Pasted"} as "${pasted.name}"`);
}

/**
 * Add a copy of a table, offset on the canvas, without changing the clipboard.
 * @param {string} name
 * @returns {void}
 */
function duplicateTable(name) {
  const src = state.tables[name];
  if (!src) return;
  const saved = clipboard;
  clipboard = deepCopy(src);
  pasteTable(null, "Duplicated");
  clipboard = saved;
}

/**
 * Create or update a table from the table dialog.
 * `origName == null` creates a table. Column `origName` tracks renames.
 * @param {string|null} origName
 * @param {{name:string, headerColor:string, bodyColor:string, comment?:string, x?:number, y?:number, columns:object[]}} model
 * @returns {void}
 */
function applyTableEdits(origName, model) {
  pushUndo();
  const edited = withTableEdits(state, origName, model, sel);
  state = edited.diagram;
  sel = edited.selection;
  update();
}
