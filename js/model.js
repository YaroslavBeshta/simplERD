/**
 * @file Create, edit, copy, and delete tables and relationships.
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
function forgetTable(name) {
  delete state.tables[name];
  state.relationships = state.relationships.filter(
    (r) => r.table1 !== name && r.table2 !== name,
  );
  for (const t of Object.values(state.tables)) {
    for (const c of t.columns) {
      if (c.isFk && c.refTable === name) {
        c.isFk = false;
        c.refTable = null;
        c.refCol = null;
      }
    }
  }
}

function deleteTables(names) {
  const existing = names.filter((name) => state.tables[name]);
  if (!existing.length) return;
  pushUndo();
  for (const name of existing) forgetTable(name);
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
  if (!sel) return [];
  if (sel.kind === "table" && state.tables[sel.name]) return [sel.name];
  if (sel.kind === "multi" && Array.isArray(sel.names))
    return sel.names.filter((name) => state.tables[name]);
  return [];
}

/**
 * @returns {string[]} Ids of the currently selected canvas notes.
 */
function selectedNoteIds() {
  if (!sel) return [];
  if (sel.kind === "note" && findNote(sel.id)) return [sel.id];
  if (sel.kind === "multi" && Array.isArray(sel.noteIds))
    return sel.noteIds.filter((id) => findNote(id));
  return [];
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
  const names = [];
  for (const name of tableNames || []) {
    if (state.tables[name] && names.indexOf(name) === -1) names.push(name);
  }
  const notes = [];
  for (const id of noteIds || []) {
    if (findNote(id) && notes.indexOf(id) === -1) notes.push(id);
  }
  if (!names.length && !notes.length) sel = null;
  else if (names.length === 1 && !notes.length)
    sel = { kind: "table", name: names[0] };
  else if (!names.length && notes.length === 1)
    sel = { kind: "note", id: notes[0] };
  else sel = { kind: "multi", names: names, noteIds: notes };
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
  for (const name of tables) forgetTable(name);
  state.canvasNotes = (state.canvasNotes || []).filter(
    (n) => noteIds.indexOf(n.id) === -1,
  );
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
 * @param {number} x0
 * @param {number} y0
 * @param {number} x1
 * @param {number} y1
 * @returns {{x:number, y:number, w:number, h:number}}
 */
function selectionRect(x0, y0, x1, y1) {
  return {
    x: Math.min(x0, x1),
    y: Math.min(y0, y1),
    w: Math.abs(x1 - x0),
    h: Math.abs(y1 - y0),
  };
}

/**
 * Tables whose boxes overlap a scene rectangle.
 * @param {{x:number, y:number, w:number, h:number}} box
 * @returns {string[]}
 */
function rectOverlaps(x, y, w, h, box) {
  return x < box.x + box.w && x + w > box.x && y < box.y + box.h && y + h > box.y;
}

function tablesInRect(box) {
  const names = [];
  for (const name of Object.keys(state.tables)) {
    const t = state.tables[name];
    if (rectOverlaps(t.x, t.y, t.width, tableHeight(t), box)) names.push(name);
  }
  return names;
}

/**
 * Canvas notes whose boxes overlap a scene rectangle.
 * @param {{x:number, y:number, w:number, h:number}} box
 * @returns {string[]}
 */
function notesInRect(box) {
  const ids = [];
  for (const n of state.canvasNotes || []) {
    const w = Math.max(MIN_NOTE_W, n.width || DEFAULT_NOTE_W);
    const h = Math.max(MIN_NOTE_H, n.height || DEFAULT_NOTE_H);
    if (rectOverlaps(n.x, n.y, w, h, box)) ids.push(n.id);
  }
  return ids;
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
  state.relationships = state.relationships.filter((x) => relKey(x) !== key);
  const t = state.tables[r.table1];
  const c = t && getCol(t, r.fkCol);
  if (c && c.refTable === r.table2 && c.refCol === r.pkCol) {
    c.isFk = false;
    c.refTable = null;
    c.refCol = null;
  }
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
  const t = deepCopy(clipboard);
  t.name = uniqueTableName(t.name);
  if (pos) {
    t.x = snap(pos.x);
    t.y = snap(pos.y);
  } else {
    t.x = snap(t.x + GRID);
    t.y = snap(t.y + GRID);
  }
  // keep FK references only when the target still resolves
  for (const c of t.columns) {
    if (!c.isFk) continue;
    const target = state.tables[c.refTable];
    const pk = target && getCol(target, c.refCol);
    if (target && pk && pk.isPk) {
      state.relationships.push({
        table1: t.name,
        fkCol: c.name,
        table2: c.refTable,
        pkCol: c.refCol,
        type: c.fkType || "N:1",
        verticalX: null,
      });
    } else {
      c.isFk = false;
      c.refTable = null;
      c.refCol = null;
    }
  }
  state.tables[t.name] = t;
  sel = { kind: "table", name: t.name };
  update();
  toast(`${verb || "Pasted"} as "${t.name}"`);
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
  const isNew = origName == null;
  let t;
  if (isNew) {
    t = {
      name: model.name,
      x: snap(model.x || 60),
      y: snap(model.y || 60),
      width: DEFAULT_TABLE_WIDTH,
      bodyColor: model.bodyColor,
      headerColor: model.headerColor,
      comment: model.comment == null ? "" : String(model.comment),
      columns: [],
    };
  } else {
    t = state.tables[origName];
    t.bodyColor = model.bodyColor;
    t.headerColor = model.headerColor;
    t.comment = model.comment == null ? "" : String(model.comment);
  }

  // --- column rename map & removed columns ---
  const renames = {};
  for (const mc of model.columns) {
    if (mc.origName && mc.origName !== mc.name) renames[mc.origName] = mc.name;
  }
  const keptOrig = new Set(
    model.columns.filter((mc) => mc.origName).map((mc) => mc.origName),
  );
  const removed = isNew
    ? []
    : t.columns.filter((c) => !keptOrig.has(c.name)).map((c) => c.name);
  const lostPk = isNew
    ? []
    : t.columns
        .filter((c) => c.isPk && keptOrig.has(c.name))
        .filter((c) => {
          const mc = model.columns.find((m) => m.origName === c.name);
          return mc && !mc.isPk;
        })
        .map((c) => renames[c.name] || c.name);

  // --- rebuild columns ---
  t.columns = model.columns.map((mc) => ({
    name: mc.name,
    dataType: mc.dataType || "TEXT",
    isPk: !!mc.isPk,
    isFk: !!mc.isFk,
    refTable: mc.isFk ? mc.refTable : null,
    refCol: mc.isFk ? mc.refCol : null,
    fkType: mc.fkType || "N:1",
  }));

  // --- table rename ---
  const newName = model.name;
  if (!isNew && newName !== origName) {
    delete state.tables[origName];
    t.name = newName;
    for (const r of state.relationships) {
      if (r.table1 === origName) r.table1 = newName;
      if (r.table2 === origName) r.table2 = newName;
    }
    for (const ot of Object.values(state.tables)) {
      for (const c of ot.columns)
        if (c.refTable === origName) c.refTable = newName;
    }
    for (const c of t.columns)
      if (c.refTable === origName) c.refTable = newName;
  }
  state.tables[newName] = t;

  // --- propagate column renames (this table as PK target) ---
  for (const [oldC, newC] of Object.entries(renames)) {
    for (const r of state.relationships) {
      if (r.table2 === newName && r.pkCol === oldC) r.pkCol = newC;
      if (r.table1 === newName && r.fkCol === oldC) r.fkCol = newC;
    }
    for (const ot of Object.values(state.tables)) {
      for (const c of ot.columns) {
        if (c.isFk && c.refTable === newName && c.refCol === oldC)
          c.refCol = newC;
      }
    }
  }

  // --- drop relationships to removed / demoted PK columns ---
  const badPk = new Set([...removed, ...lostPk]);
  if (badPk.size) {
    state.relationships = state.relationships.filter((r) => {
      if (r.table2 === newName && badPk.has(r.pkCol)) {
        const ft = state.tables[r.table1];
        const fc = ft && getCol(ft, r.fkCol);
        if (fc && fc.refTable === newName) {
          fc.isFk = false;
          fc.refTable = null;
          fc.refCol = null;
        }
        return false;
      }
      return true;
    });
    for (const ot of Object.values(state.tables)) {
      for (const c of ot.columns) {
        if (c.isFk && c.refTable === newName && badPk.has(c.refCol)) {
          c.isFk = false;
          c.refTable = null;
          c.refCol = null;
        }
      }
    }
  }

  // --- rebuild FK-side relationships for this table ---
  const oldRels = state.relationships.filter((r) => r.table1 === newName);
  state.relationships = state.relationships.filter((r) => r.table1 !== newName);
  for (const c of t.columns) {
    if (!(c.isFk && c.refTable && c.refCol)) continue;
    const target = state.tables[c.refTable];
    const pk = target && getCol(target, c.refCol);
    if (!target || !pk || !pk.isPk) {
      c.isFk = false;
      c.refTable = null;
      c.refCol = null;
      continue;
    }
    const prev = oldRels.find(
      (r) =>
        r.fkCol === c.name && r.table2 === c.refTable && r.pkCol === c.refCol,
    );
    state.relationships.push({
      table1: newName,
      fkCol: c.name,
      table2: c.refTable,
      pkCol: c.refCol,
      type: c.fkType || "N:1",
      verticalX: prev ? prev.verticalX : null,
    });
  }

  if (sel && sel.kind === "table" && sel.name === origName)
    sel = { kind: "table", name: newName };
  if (isNew) sel = { kind: "table", name: newName };
  update();
}
