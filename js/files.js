/**
 * @file Open, save, and import `.erd` and `.sql` files.
 */
"use strict";

/**
 * Trigger a browser download for a text file.
 * @param {string} name
 * @param {string} text
 * @param {string} [mime]
 * @returns {void}
 */
function downloadFile(name, text, mime) {
  const blob = new Blob([text], { type: mime || "text/plain;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/**
 * Write the diagram to the current file, or prompt when there is no handle.
 * @param {boolean} forcePicker Always show the save picker.
 * @returns {Promise<boolean>} False when the user cancels the picker.
 */
async function saveFile(forcePicker) {
  const text = exportERDText();
  const suggested = fileName || "diagram.erd";
  if (window.showSaveFilePicker) {
    try {
      if (!fileHandle || forcePicker) {
        fileHandle = await window.showSaveFilePicker({
          suggestedName: suggested,
          types: [{ description: "ERD diagram", accept: { "text/csv": [".erd"] } }]
        });
      }
      const w = await fileHandle.createWritable();
      await w.write(text);
      await w.close();
      fileName = fileHandle.name;
    } catch (e) {
      if (e && e.name === "AbortError") return false;
      // fall back to download
      downloadFile(suggested, text, "text/csv;charset=utf-8");
      fileName = suggested;
    }
  } else {
    downloadFile(suggested, text, "text/csv;charset=utf-8");
    fileName = suggested;
  }
  savedSnapshot = JSON.stringify(state);
  update();
  toast(`Saved ${fileName}`);
  return true;
}

/**
 * Replace the open diagram with a parsed `.erd` file.
 * @param {string} text
 * @param {string} [name] Display file name.
 * @returns {void}
 */
function loadERDFromText(text, name) {
  try {
    const st = importERDText(text);
    undoStack.length = 0; redoStack.length = 0;
    state = st;
    savedSnapshot = JSON.stringify(state);
    fileName = name || null;
    sel = null;
    update();
    fitToContent();
    const nNotes = (state.canvasNotes || []).length;
    toast(`Imported ${Object.keys(state.tables).length} tables, ${state.relationships.length} relationships` +
          (nNotes ? `, ${nNotes} note${nNotes === 1 ? "" : "s"}` : ""));
  } catch (e) {
    console.error(e);
    toast("Could not read that .erd file");
  }
}

/**
 * Replace the open diagram with tables parsed from SQL.
 * @param {string} text
 * @param {string} [name]
 * @returns {void}
 */
function loadSQLFromText(text, name) {
  try {
    const st = importSQLText(text);
    if (!Object.keys(st.tables).length) { toast("No CREATE TABLE statements found in that SQL"); return; }
    undoStack.length = 0; redoStack.length = 0;
    state = st;
    savedSnapshot = ""; // imported SQL is not a saved .erd
    fileName = null;
    fileHandle = null;
    sel = null;
    update();
    fitToContent();
    toast(`Imported ${Object.keys(state.tables).length} tables from SQL`);
  } catch (e) {
    console.error(e);
    toast("Could not parse that SQL file");
  }
}

/**
 * Prompt for an `.erd` file and load it.
 * @returns {Promise<void>}
 */
async function openERDFile() {
  if (!(await ensureSavedThen())) return;
  if (window.showOpenFilePicker) {
    try {
      const [h] = await window.showOpenFilePicker({
        types: [{ description: "ERD diagram", accept: { "text/csv": [".erd", ".csv"] } }]
      });
      const f = await h.getFile();
      fileHandle = h;
      loadERDFromText(await f.text(), f.name);
      return;
    } catch (e) {
      if (e && e.name === "AbortError") return;
    }
  }
  $("fileInputERD").click();
}

/**
 * Prompt for a `.sql` file and import it.
 * @returns {Promise<void>}
 */
async function openSQLFile() {
  if (!(await ensureSavedThen())) return;
  $("fileInputSQL").click();
}

/**
 * Replace the open diagram with an empty one, after a save prompt.
 * @returns {Promise<void>}
 */
async function newDiagram() {
  if (!(await ensureSavedThen())) return;
  pushUndo();
  state = newState();
  savedSnapshot = JSON.stringify(state);
  fileName = null;
  fileHandle = null;
  sel = null;
  view = { x: 0, y: 0, zoom: 1 };
  update();
}

/**
 * Download the current diagram as a `.sql` file.
 * @returns {void}
 */
function exportSQLFile() {
  if (!Object.keys(state.tables).length) { toast("Nothing to export"); return; }
  const base = (fileName || "diagram").replace(/\.erd$/i, "");
  downloadFile(base + ".sql", generateSQL(state), "text/plain;charset=utf-8");
  toast("SQL exported");
}
