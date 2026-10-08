/**
 * @file Undo, redo, and browser persistence for the diagram and preferences.
 */
"use strict";

/**
 * Snapshot the diagram so the next edit can be undone.
 * @returns {void}
 */
function pushUndo() {
  undoStack.push(JSON.stringify(state));
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  redoStack.length = 0;
}

/**
 * Restore the previous diagram snapshot.
 * @returns {void}
 */
function undo() {
  if (!undoStack.length) return;
  redoStack.push(JSON.stringify(state));
  state = JSON.parse(undoStack.pop());
  sel = null;
  update();
}

/**
 * Reapply a snapshot undone by {@link undo}.
 * @returns {void}
 */
function redo() {
  if (!redoStack.length) return;
  undoStack.push(JSON.stringify(state));
  state = JSON.parse(redoStack.pop());
  sel = null;
  update();
}

/**
 * @returns {boolean} True when the diagram differs from the last save.
 */
function isDirty() {
  return JSON.stringify(state) !== savedSnapshot;
}

/* ---------------------------- Persistence ------------------------------- */
var autosaveTimer = null;
/**
 * Write the diagram to localStorage shortly after an edit.
 * @returns {void}
 */
function autosave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    try {
      localStorage.setItem(LS_AUTOSAVE, JSON.stringify({ state, fileName }));
    } catch (e) {}
  }, 400);
}

/**
 * Persist theme and editor preferences.
 * @returns {void}
 */
function savePrefs() {
  try {
    localStorage.setItem(LS_PREFS, JSON.stringify(prefs));
  } catch (e) {}
}

/**
 * Restore preferences saved by {@link savePrefs}.
 * @returns {void}
 */
function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(LS_PREFS) || "null");
    if (p && typeof p === "object") Object.assign(prefs, p);
    if (!Array.isArray(prefs.dataTypes) || !prefs.dataTypes.length)
      prefs.dataTypes = DEFAULT_COLUMN_DATA_TYPES.slice();
  } catch (e) {}
}
