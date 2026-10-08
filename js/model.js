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
  pushUndo();
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
  if (sel && sel.kind === "table" && sel.name === name) sel = null;
  update();
  toast(`Table "${name}" deleted`);
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
 * @param {{name:string, headerColor:string, bodyColor:string, x?:number, y?:number, columns:object[]}} model
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
      columns: [],
    };
  } else {
    t = state.tables[origName];
    t.bodyColor = model.bodyColor;
    t.headerColor = model.headerColor;
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
