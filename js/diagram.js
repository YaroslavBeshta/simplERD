/**
 * @file Pure diagram updates. Each function takes a diagram and returns a new one.
 * The diagram passed in is never modified.
 */
"use strict";

/**
 * Fill in fields older saves may omit.
 * @param {DiagramState} diagram
 * @returns {DiagramState}
 */
function normalizedDiagram(diagram) {
  return {
    tables: diagram.tables || {},
    relationships: diagram.relationships || [],
    canvasNotes: Array.isArray(diagram.canvasNotes) ? diagram.canvasNotes : [],
    canvasW: diagram.canvasW,
    canvasH: diagram.canvasH,
    notes: typeof diagram.notes === "string" ? diagram.notes : "",
  };
}

/**
 * @param {string[]} taken
 * @param {string} base
 * @returns {string}
 */
function uniqueName(taken, base) {
  const names = new Set(taken);
  if (!names.has(base)) return base;
  let n = base + "_copy";
  let i = 2;
  while (names.has(n)) n = base + "_copy" + i++;
  return n;
}

/**
 * @param {DiagramState} diagram
 * @param {string[]} tableNames
 * @param {string[]} noteIds
 * @returns {Selection|null}
 */
function selectionFrom(diagram, tableNames, noteIds) {
  const names = [];
  for (const name of tableNames || []) {
    if (diagram.tables[name] && names.indexOf(name) === -1) names.push(name);
  }
  const notes = diagram.canvasNotes || [];
  const ids = [];
  for (const id of noteIds || []) {
    if (notes.some((n) => n.id === id) && ids.indexOf(id) === -1) ids.push(id);
  }
  if (!names.length && !ids.length) return null;
  if (names.length === 1 && !ids.length) return { kind: "table", name: names[0] };
  if (!names.length && ids.length === 1) return { kind: "note", id: ids[0] };
  return { kind: "multi", names: names, noteIds: ids };
}

/**
 * @param {DiagramState} diagram
 * @param {Selection|null} sel
 * @returns {string[]}
 */
function tableNamesInSelection(diagram, sel) {
  if (!sel) return [];
  if (sel.kind === "table" && diagram.tables[sel.name]) return [sel.name];
  if (sel.kind === "multi" && Array.isArray(sel.names))
    return sel.names.filter((name) => diagram.tables[name]);
  return [];
}

/**
 * @param {DiagramState} diagram
 * @param {Selection|null} sel
 * @returns {string[]}
 */
function noteIdsInSelection(diagram, sel) {
  if (!sel) return [];
  const notes = diagram.canvasNotes || [];
  const has = (id) => notes.some((n) => n.id === id);
  if (sel.kind === "note" && has(sel.id)) return [sel.id];
  if (sel.kind === "multi" && Array.isArray(sel.noteIds))
    return sel.noteIds.filter(has);
  return [];
}

/**
 * @param {CanvasNote[]} notes
 * @returns {string}
 */
function freshNoteId(notes) {
  const ids = new Set((notes || []).map((n) => n.id));
  let i = 1;
  while (ids.has("n" + i)) i++;
  return "n" + i;
}

/**
 * @param {DiagramState} diagram
 * @param {{x:number, y:number, w:number, h:number}} box
 * @returns {string[]}
 */
function tablesOverlapping(diagram, box) {
  const names = [];
  for (const name of Object.keys(diagram.tables)) {
    const t = diagram.tables[name];
    if (rectOverlaps(t.x, t.y, t.width, tableHeight(t), box)) names.push(name);
  }
  return names;
}

/**
 * @param {DiagramState} diagram
 * @param {{x:number, y:number, w:number, h:number}} box
 * @returns {string[]}
 */
function notesOverlapping(diagram, box) {
  const ids = [];
  for (const n of diagram.canvasNotes || []) {
    const w = Math.max(MIN_NOTE_W, n.width || DEFAULT_NOTE_W);
    const h = Math.max(MIN_NOTE_H, n.height || DEFAULT_NOTE_H);
    if (rectOverlaps(n.x, n.y, w, h, box)) ids.push(n.id);
  }
  return ids;
}

/**
 * @param {Table} table
 * @param {string} refName
 * @returns {Table}
 */
function tableWithoutRefs(table, refName) {
  if (!table.columns.some((c) => c.isFk && c.refTable === refName)) return table;
  return {
    ...table,
    columns: table.columns.map((c) =>
      c.isFk && c.refTable === refName
        ? { ...c, isFk: false, refTable: null, refCol: null }
        : c,
    ),
  };
}

/**
 * @param {DiagramState} diagram
 * @param {string[]} names
 * @returns {DiagramState}
 */
function withoutTables(diagram, names) {
  const drop = names.filter((name) => diagram.tables[name]);
  if (!drop.length) return diagram;
  const gone = new Set(drop);
  const tables = {};
  for (const [name, table] of Object.entries(diagram.tables)) {
    if (gone.has(name)) continue;
    let next = table;
    for (const removed of gone) next = tableWithoutRefs(next, removed);
    tables[name] = next;
  }
  return {
    ...diagram,
    tables,
    relationships: diagram.relationships.filter(
      (r) => !gone.has(r.table1) && !gone.has(r.table2),
    ),
  };
}

/**
 * @param {DiagramState} diagram
 * @param {string[]} ids
 * @returns {DiagramState}
 */
function withoutNotes(diagram, ids) {
  const drop = new Set(ids);
  if (!drop.size) return diagram;
  return {
    ...diagram,
    canvasNotes: (diagram.canvasNotes || []).filter((n) => !drop.has(n.id)),
  };
}

/**
 * @param {Table} table
 * @param {string} colName
 * @param {object} patch
 * @returns {Table}
 */
function tableWithColumn(table, colName, patch) {
  if (!table) return table;
  return {
    ...table,
    columns: table.columns.map((c) =>
      c.name === colName ? { ...c, ...patch } : c,
    ),
  };
}

/**
 * @param {DiagramState} diagram
 * @param {string} key
 * @returns {DiagramState}
 */
function withoutRelationship(diagram, key) {
  const rel = diagram.relationships.find((r) => relKey(r) === key);
  if (!rel) return diagram;
  let tables = diagram.tables;
  const table = tables[rel.table1];
  const col = table && getCol(table, rel.fkCol);
  if (col && col.refTable === rel.table2 && col.refCol === rel.pkCol) {
    tables = {
      ...tables,
      [rel.table1]: tableWithColumn(table, rel.fkCol, {
        isFk: false,
        refTable: null,
        refCol: null,
      }),
    };
  }
  return {
    ...diagram,
    tables,
    relationships: diagram.relationships.filter((r) => relKey(r) !== key),
  };
}

/**
 * @param {DiagramState} diagram
 * @param {string} key
 * @param {number|null} verticalX
 * @returns {DiagramState}
 */
function withRelationshipRoute(diagram, key, verticalX) {
  return {
    ...diagram,
    relationships: diagram.relationships.map((r) =>
      relKey(r) === key ? { ...r, verticalX: verticalX } : r,
    ),
  };
}

/**
 * @param {DiagramState} diagram
 * @param {Relationship} rel
 * @param {string} type
 * @returns {DiagramState}
 */
function withRelationshipType(diagram, rel, type) {
  const key = relKey(rel);
  const table = diagram.tables[rel.table1];
  return {
    ...diagram,
    tables: table
      ? {
          ...diagram.tables,
          [rel.table1]: tableWithColumn(table, rel.fkCol, { fkType: type }),
        }
      : diagram.tables,
    relationships: diagram.relationships.map((r) =>
      relKey(r) === key ? { ...r, type: type } : r,
    ),
  };
}

/**
 * @param {DiagramState} diagram
 * @param {{table1:string, fkCol:string, table2:string, pkCol:string, type:string, dataType?:string}} spec
 * @returns {{diagram: DiagramState, key: string}}
 */
function withNewRelationship(diagram, spec) {
  const table = diagram.tables[spec.table1];
  const patch = {
    isFk: true,
    refTable: spec.table2,
    refCol: spec.pkCol,
    fkType: spec.type,
  };
  if (spec.dataType) patch.dataType = spec.dataType;
  const rel = {
    table1: spec.table1,
    fkCol: spec.fkCol,
    table2: spec.table2,
    pkCol: spec.pkCol,
    type: spec.type,
    verticalX: null,
  };
  return {
    diagram: {
      ...diagram,
      tables: {
        ...diagram.tables,
        [spec.table1]: tableWithColumn(table, spec.fkCol, patch),
      },
      relationships: diagram.relationships.concat(rel),
    },
    key: relKey(rel),
  };
}

/**
 * @param {DiagramState} diagram
 * @param {object} drag Group-move record with starting positions.
 * @param {{x:number, y:number}} pt
 * @returns {DiagramState}
 */
function withGroupMove(diagram, drag, pt) {
  const dx = snap(pt.x - drag.offX) - drag.originX;
  const dy = snap(pt.y - drag.offY) - drag.originY;
  const tables = { ...diagram.tables };
  for (const item of drag.tables) {
    const table = tables[item.name];
    if (!table) continue;
    tables[item.name] = { ...table, x: item.x + dx, y: item.y + dy };
  }
  const movedNotes = new Map(drag.notes.map((item) => [item.id, item]));
  return {
    ...diagram,
    tables,
    canvasNotes: (diagram.canvasNotes || []).map((note) => {
      const item = movedNotes.get(note.id);
      return item ? { ...note, x: item.x + dx, y: item.y + dy } : note;
    }),
  };
}

/**
 * @param {DiagramState} diagram
 * @param {string} name
 * @param {{x:number, y:number, width:number, height:number}} box
 * @returns {DiagramState}
 */
function withTableBox(diagram, name, box) {
  const table = diagram.tables[name];
  if (!table) return diagram;
  return {
    ...diagram,
    tables: {
      ...diagram.tables,
      [name]: {
        ...table,
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
      },
    },
  };
}

/**
 * @param {DiagramState} diagram
 * @param {string} id
 * @param {{x:number, y:number, width:number, height:number}} box
 * @returns {DiagramState}
 */
function withNoteBox(diagram, id, box) {
  return {
    ...diagram,
    canvasNotes: (diagram.canvasNotes || []).map((note) =>
      note.id === id
        ? {
            ...note,
            x: box.x,
            y: box.y,
            width: box.width,
            height: box.height,
          }
        : note,
    ),
  };
}

/**
 * @param {DiagramState} diagram
 * @param {string} id
 * @param {number} x
 * @param {number} y
 * @returns {DiagramState}
 */
function withNotePos(diagram, id, x, y) {
  return {
    ...diagram,
    canvasNotes: (diagram.canvasNotes || []).map((note) =>
      note.id === id ? { ...note, x: x, y: y } : note,
    ),
  };
}

/**
 * @param {DiagramState} diagram
 * @param {CanvasNote} note
 * @returns {DiagramState}
 */
function withAddedNote(diagram, note) {
  return {
    ...diagram,
    canvasNotes: (diagram.canvasNotes || []).concat(note),
  };
}

/**
 * @param {DiagramState} diagram
 * @param {string} id
 * @param {object} fields
 * @returns {DiagramState}
 */
function withNoteFields(diagram, id, fields) {
  return {
    ...diagram,
    canvasNotes: (diagram.canvasNotes || []).map((note) =>
      note.id === id ? { ...note, ...fields } : note,
    ),
  };
}

/**
 * @param {DiagramState} diagram
 * @param {string} notes
 * @returns {DiagramState}
 */
function withDiagramNotes(diagram, notes) {
  return { ...diagram, notes: notes };
}

/**
 * @param {DiagramState} diagram
 * @param {Table} source Clipboard table. Not modified.
 * @param {{x:number, y:number}} [pos]
 * @returns {{diagram: DiagramState, name: string}}
 */
function withPastedTable(diagram, source, pos) {
  const table = deepCopy(source);
  table.name = uniqueName(Object.keys(diagram.tables), table.name);
  if (pos) {
    table.x = snap(pos.x);
    table.y = snap(pos.y);
  } else {
    table.x = snap(table.x + GRID);
    table.y = snap(table.y + GRID);
  }
  const rels = [];
  table.columns = table.columns.map((col) => {
    if (!col.isFk) return col;
    const target = diagram.tables[col.refTable];
    const pk = target && getCol(target, col.refCol);
    if (target && pk && pk.isPk) {
      rels.push({
        table1: table.name,
        fkCol: col.name,
        table2: col.refTable,
        pkCol: col.refCol,
        type: col.fkType || "N:1",
        verticalX: null,
      });
      return col;
    }
    return { ...col, isFk: false, refTable: null, refCol: null };
  });
  return {
    diagram: {
      ...diagram,
      tables: { ...diagram.tables, [table.name]: table },
      relationships: diagram.relationships.concat(rels),
    },
    name: table.name,
  };
}

/**
 * Apply a table-dialog edit on a private copy of the diagram.
 * @param {DiagramState} diagram
 * @param {string|null} origName
 * @param {object} model
 * @param {Selection|null} currentSel
 * @returns {{diagram: DiagramState, selection: Selection|null}}
 */
function withTableEdits(diagram, origName, model, currentSel) {
  const draft = deepCopy(diagram);
  const isNew = origName == null;
  let table;
  if (isNew) {
    table = {
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
    table = draft.tables[origName];
    table.bodyColor = model.bodyColor;
    table.headerColor = model.headerColor;
    table.comment = model.comment == null ? "" : String(model.comment);
  }

  const renames = {};
  for (const mc of model.columns) {
    if (mc.origName && mc.origName !== mc.name) renames[mc.origName] = mc.name;
  }
  const keptOrig = new Set(
    model.columns.filter((mc) => mc.origName).map((mc) => mc.origName),
  );
  const removed = isNew
    ? []
    : table.columns.filter((c) => !keptOrig.has(c.name)).map((c) => c.name);
  const lostPk = isNew
    ? []
    : table.columns
        .filter((c) => c.isPk && keptOrig.has(c.name))
        .filter((c) => {
          const mc = model.columns.find((m) => m.origName === c.name);
          return mc && !mc.isPk;
        })
        .map((c) => renames[c.name] || c.name);

  table.columns = model.columns.map((mc) => ({
    name: mc.name,
    dataType: mc.dataType || "TEXT",
    isPk: !!mc.isPk,
    isFk: !!mc.isFk,
    refTable: mc.isFk ? mc.refTable : null,
    refCol: mc.isFk ? mc.refCol : null,
    fkType: mc.fkType || "N:1",
    note: mc.note == null ? "" : String(mc.note).trim(),
  }));

  const newName = model.name;
  if (!isNew && newName !== origName) {
    delete draft.tables[origName];
    table.name = newName;
    for (const rel of draft.relationships) {
      if (rel.table1 === origName) rel.table1 = newName;
      if (rel.table2 === origName) rel.table2 = newName;
    }
    for (const other of Object.values(draft.tables)) {
      for (const col of other.columns)
        if (col.refTable === origName) col.refTable = newName;
    }
    for (const col of table.columns)
      if (col.refTable === origName) col.refTable = newName;
  }
  draft.tables[newName] = table;

  for (const [oldC, newC] of Object.entries(renames)) {
    for (const rel of draft.relationships) {
      if (rel.table2 === newName && rel.pkCol === oldC) rel.pkCol = newC;
      if (rel.table1 === newName && rel.fkCol === oldC) rel.fkCol = newC;
    }
    for (const other of Object.values(draft.tables)) {
      for (const col of other.columns) {
        if (col.isFk && col.refTable === newName && col.refCol === oldC)
          col.refCol = newC;
      }
    }
  }

  const badPk = new Set([...removed, ...lostPk]);
  if (badPk.size) {
    draft.relationships = draft.relationships.filter((rel) => {
      if (rel.table2 === newName && badPk.has(rel.pkCol)) {
        const ft = draft.tables[rel.table1];
        const fc = ft && getCol(ft, rel.fkCol);
        if (fc && fc.refTable === newName) {
          fc.isFk = false;
          fc.refTable = null;
          fc.refCol = null;
        }
        return false;
      }
      return true;
    });
    for (const other of Object.values(draft.tables)) {
      for (const col of other.columns) {
        if (col.isFk && col.refTable === newName && badPk.has(col.refCol)) {
          col.isFk = false;
          col.refTable = null;
          col.refCol = null;
        }
      }
    }
  }

  const oldRels = draft.relationships.filter((rel) => rel.table1 === newName);
  draft.relationships = draft.relationships.filter((rel) => rel.table1 !== newName);
  for (const col of table.columns) {
    if (!(col.isFk && col.refTable && col.refCol)) continue;
    const target = draft.tables[col.refTable];
    const pk = target && getCol(target, col.refCol);
    if (!target || !pk || !pk.isPk) {
      col.isFk = false;
      col.refTable = null;
      col.refCol = null;
      continue;
    }
    const prev = oldRels.find(
      (rel) =>
        rel.fkCol === col.name &&
        rel.table2 === col.refTable &&
        rel.pkCol === col.refCol,
    );
    draft.relationships.push({
      table1: newName,
      fkCol: col.name,
      table2: col.refTable,
      pkCol: col.refCol,
      type: col.fkType || "N:1",
      verticalX: prev ? prev.verticalX : null,
    });
  }

  let selection = currentSel;
  if (currentSel && currentSel.kind === "table" && currentSel.name === origName)
    selection = { kind: "table", name: newName };
  if (isNew) selection = { kind: "table", name: newName };
  return { diagram: draft, selection: selection };
}
