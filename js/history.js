/**
 * @file Undo, redo, and browser persistence.
 * Stack math is pure. localStorage writes stay in this file.
 */
"use strict";

/**
 * @param {string[]} undoStack
 * @param {string[]} redoStack
 * @param {string} snapshot
 * @returns {{undoStack: string[], redoStack: string[]}}
 */
function withUndoSnapshot(undoStack, redoStack, snapshot) {
  const undo = undoStack.concat(snapshot);
  return {
    undoStack: undo.length > MAX_UNDO ? undo.slice(undo.length - MAX_UNDO) : undo,
    redoStack: [],
  };
}

/**
 * @param {string[]} undoStack
 * @param {string[]} redoStack
 * @param {string} snapshot
 * @returns {{undoStack: string[], redoStack: string[], restored: string}|null}
 */
function undoStep(undoStack, redoStack, snapshot) {
  if (!undoStack.length) return null;
  return {
    undoStack: undoStack.slice(0, -1),
    redoStack: redoStack.concat(snapshot),
    restored: undoStack[undoStack.length - 1],
  };
}

/**
 * @param {string[]} undoStack
 * @param {string[]} redoStack
 * @param {string} snapshot
 * @returns {{undoStack: string[], redoStack: string[], restored: string}|null}
 */
function redoStep(undoStack, redoStack, snapshot) {
  if (!redoStack.length) return null;
  return {
    undoStack: undoStack.concat(snapshot),
    redoStack: redoStack.slice(0, -1),
    restored: redoStack[redoStack.length - 1],
  };
}

/**
 * Snapshot the diagram so the next edit can be undone.
 * @returns {void}
 */
function pushUndo() {
  const next = withUndoSnapshot(undoStack, redoStack, JSON.stringify(state));
  undoStack = next.undoStack;
  redoStack = next.redoStack;
}

/**
 * Restore the previous diagram snapshot.
 * @returns {void}
 */
function undo() {
  const step = undoStep(undoStack, redoStack, JSON.stringify(state));
  if (!step) return;
  undoStack = step.undoStack;
  redoStack = step.redoStack;
  state = JSON.parse(step.restored);
  sel = null;
  update();
}

/**
 * Reapply a snapshot undone by {@link undo}.
 * @returns {void}
 */
function redo() {
  const step = redoStep(undoStack, redoStack, JSON.stringify(state));
  if (!step) return;
  undoStack = step.undoStack;
  redoStack = step.redoStack;
  state = JSON.parse(step.restored);
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

/**
 * @returns {{state: DiagramState, fileName: string|null}|null} The last autosave, when it has tables.
 */
function storedAutosave() {
  try {
    const saved = JSON.parse(localStorage.getItem(LS_AUTOSAVE) || "null");
    if (saved && saved.state && Object.keys(saved.state.tables || {}).length)
      return saved;
  } catch (e) {}
  return null;
}
