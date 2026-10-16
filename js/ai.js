/**
 * @file Tools an assistant can call to change a diagram.
 * The page copies a prompt that lists these tools, then applies the reply.
 */
"use strict";

/**
 * Text placed in a share link and read by an assistant that opens the URL.
 * The page shows the same directions, because a fetched page does not include the URL fragment.
 */
var AI_SHARE_INSTRUCTION =
  "Do not click the simplERD page, including Add Table. Clicking cannot change the user's diagram. " +
  "The diagram is the diagram property in this JSON. " +
  "Reply with one json code block and no other text: {\"tools\":[{\"name\":\"add_table\",\"arguments\":{}}]}. " +
  "Tools: add_table {name, comment, columns:[{name, type, pk, note, references:{table, column}, relationship}]}, " +
  "update_table {name, newName, comment, x, y}, delete_table {name}, " +
  "add_column {table, name, type, pk, note, references, relationship}, " +
  "update_column {table, name, newName, type, pk, note, references, relationship}, delete_column {table, name}, " +
  "add_relationship {fromTable, fromColumn, toTable, toColumn, type}, delete_relationship {fromTable, fromColumn}, " +
  "add_note {text}, update_note {id, text}, delete_note {id}, set_notes {text}, replace_diagram {tables}. " +
  "Column type defaults to TEXT. relationship is N:1, 1:N, 1:1, or N:M. " +
  "A foreign key's target column must already be a primary key. " +
  "File fields isPk, dataType, refTable, and refCol mean pk, type, and references. " +
  "The user pastes your reply into simplERD with Share, then Apply AI reply.";

/** Tool names an assistant is allowed to call, in prompt order. */
var AI_TOOLS = [
  "add_table",
  "update_table",
  "delete_table",
  "add_column",
  "update_column",
  "delete_column",
  "add_relationship",
  "delete_relationship",
  "add_note",
  "update_note",
  "delete_note",
  "set_notes",
  "replace_diagram",
];

/**
 * @param {string} error
 * @returns {{ok:false, error:string}}
 */
function aiFail(error) {
  return { ok: false, error: error };
}

/**
 * @param {DiagramState} diagram
 * @param {string} summary
 * @param {boolean} [replaces]
 * @returns {{ok:true, diagram:DiagramState, summary:string, replaces:boolean}}
 */
function aiOk(diagram, summary, replaces) {
  return { ok: true, diagram: diagram, summary: summary, replaces: !!replaces };
}

/**
 * @param {*} value
 * @returns {string}
 */
function aiLabel(value) {
  return String(value == null ? "" : value).trim();
}

/**
 * @param {*} value
 * @returns {string|null}
 */
function aiName(value) {
  const name = aiLabel(value);
  return name ? name : null;
}

/**
 * Turn `from_table` into `fromTable` on every object key in a tool argument.
 * @param {*} value
 * @returns {*}
 */
function aiArgs(value) {
  if (Array.isArray(value)) return value.map(aiArgs);
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const key of Object.keys(value)) {
    const camel = key.replace(/_([a-z])/g, function (_, c) {
      return c.toUpperCase();
    });
    out[camel] = aiArgs(value[key]);
  }
  return out;
}

/**
 * @param {string} name
 * @returns {string}
 */
function aiToolName(name) {
  return aiLabel(name)
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[\s-]+/g, "_")
    .toLowerCase();
}

/**
 * @param {*} value
 * @returns {string|null} `#rrggbb`, or null when the value is not a color.
 */
function aiColor(value) {
  if (value == null || value === "") return "";
  const text = aiLabel(value).toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(text)) return text;
  if (/^[0-9a-f]{6}$/.test(text)) return "#" + text;
  return null;
}

/**
 * @param {*} value
 * @param {string} fallback
 * @returns {string|null} A relationship type, or null when it is unknown.
 */
function aiRelType(value, fallback) {
  const type = value == null || value === "" ? fallback : aiLabel(value);
  return REL_TYPES.indexOf(type) === -1 ? null : type;
}

/**
 * @param {DiagramState} diagram
 * @returns {{x:number, y:number}}
 */
function aiNewTablePosition(diagram) {
  const tables = Object.keys(diagram.tables || {}).map(function (name) {
    return diagram.tables[name];
  });
  if (!tables.length) return { x: 60, y: 60 };
  let right = 0;
  let top = Infinity;
  for (const table of tables) {
    right = Math.max(right, table.x + (table.width || DEFAULT_TABLE_WIDTH));
    top = Math.min(top, table.y);
  }
  const x = snap(right + 80);
  if (x <= 3200) return { x: x, y: snap(top) };
  let bottom = 0;
  for (const table of tables) bottom = Math.max(bottom, table.y + tableHeight(table));
  return { x: 60, y: snap(bottom + 80) };
}

/**
 * @param {DiagramState} diagram
 * @returns {{x:number, y:number}}
 */
function aiNewNotePosition(diagram) {
  let bottom = 40;
  for (const table of Object.keys(diagram.tables || {}).map(function (name) {
    return diagram.tables[name];
  })) {
    bottom = Math.max(bottom, table.y + tableHeight(table));
  }
  for (const note of diagram.canvasNotes || []) {
    bottom = Math.max(bottom, note.y + (note.height || DEFAULT_NOTE_H));
  }
  return { x: 60, y: snap(bottom + 40) };
}

/**
 * @param {object} spec
 * @returns {{column:Column}|{error:string}}
 */
function aiColumn(spec) {
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
    return { error: "each column must be an object" };
  }
  const name = aiName(spec.name);
  if (!name) return { error: "a column needs a name" };
  const references = spec.references;
  let isFk = false;
  let refTable = null;
  let refCol = null;
  let fkType = "N:1";
  if (references != null) {
    if (typeof references !== "object" || Array.isArray(references)) {
      return { error: 'column "' + name + '" references must be {table, column}' };
    }
    refTable = aiName(references.table);
    refCol = aiName(references.column != null ? references.column : references.col);
    if (!refTable || !refCol) {
      return { error: 'column "' + name + '" references need a table and a column' };
    }
    const relationship = aiRelType(spec.relationship, "N:1");
    if (!relationship) {
      return {
        error:
          'column "' +
          name +
          '" has unknown relationship "' +
          spec.relationship +
          '". Use ' +
          REL_TYPES.join(", "),
      };
    }
    isFk = true;
    fkType = relationship;
  }
  return {
    column: {
      name: name,
      dataType: aiLabel(spec.type || spec.dataType) || "TEXT",
      isPk: !!(spec.pk || spec.isPk),
      isFk: isFk,
      refTable: refTable,
      refCol: refCol,
      fkType: fkType,
      note: spec.note == null ? "" : String(spec.note),
    },
  };
}

/**
 * @param {Object<string, {columns:Column[]}>} tables
 * @param {Column} column
 * @returns {string|null}
 */
function aiFkError(tables, column) {
  if (!column.isFk) return null;
  const target = tables[column.refTable];
  if (!target) {
    return 'column "' + column.name + '" references missing table "' + column.refTable + '"';
  }
  const pk = target.columns.find(function (c) {
    return c.name === column.refCol;
  });
  if (!pk) {
    return (
      'column "' +
      column.name +
      '" references missing "' +
      column.refTable +
      "." +
      column.refCol +
      '"'
    );
  }
  if (!pk.isPk) {
    return '"' + column.refTable + "." + column.refCol + '" is not a primary key';
  }
  return null;
}

/**
 * @param {Table} table
 * @param {object} overrides
 * @returns {object}
 */
function aiTableModel(table, overrides) {
  return {
    name: overrides.name || table.name,
    headerColor: overrides.headerColor || table.headerColor || defaultHeaderColor(),
    bodyColor: overrides.bodyColor || table.bodyColor || defaultBodyColor(),
    comment: overrides.comment == null ? table.comment || "" : overrides.comment,
    x: table.x,
    y: table.y,
    columns: overrides.columns,
  };
}

/**
 * @param {DiagramState} diagram
 * @param {string|null} origName
 * @param {object} model
 * @returns {{ok:true, diagram:DiagramState}|{ok:false, error:string}}
 */
function aiCommitTable(diagram, origName, model) {
  const tables = {};
  for (const name of Object.keys(diagram.tables)) {
    if (name !== origName) tables[name] = diagram.tables[name];
  }
  tables[model.name] = { name: model.name, columns: model.columns };
  for (const column of model.columns) {
    const err = aiFkError(tables, column);
    if (err) return aiFail(err);
  }
  return { ok: true, diagram: withTableEdits(diagram, origName, model, null).diagram };
}

/**
 * @param {Column} column
 * @returns {object}
 */
function aiEditColumn(column) {
  return {
    origName: column.name,
    name: column.name,
    dataType: column.dataType,
    isPk: !!column.isPk,
    isFk: !!column.isFk,
    refTable: column.refTable,
    refCol: column.refCol,
    fkType: column.fkType || "N:1",
    note: column.note || "",
  };
}

/**
 * @param {DiagramState} diagram
 * @param {object} args
 * @returns {{ok:true, diagram:DiagramState, summary:string}|{ok:false, error:string}}
 */
function aiAddTable(diagram, args) {
  const name = aiName(args.name);
  if (!name) return aiFail("add_table needs a name");
  if (diagram.tables[name]) return aiFail('add_table: table "' + name + '" already exists');
  const columns = [];
  const specs = args.columns == null ? [] : args.columns;
  if (!Array.isArray(specs)) return aiFail("add_table columns must be an array");
  for (const spec of specs) {
    const parsed = aiColumn(spec);
    if (parsed.error) return aiFail("add_table: " + parsed.error);
    if (columns.some(function (c) { return c.name === parsed.column.name; })) {
      return aiFail('add_table: duplicate column "' + parsed.column.name + '"');
    }
    columns.push(parsed.column);
  }
  let headerColor = defaultHeaderColor();
  let bodyColor = defaultBodyColor();
  if (args.headerColor != null && args.headerColor !== "") {
    headerColor = aiColor(args.headerColor);
    if (!headerColor) return aiFail("add_table headerColor must be #rrggbb");
  }
  if (args.bodyColor != null && args.bodyColor !== "") {
    bodyColor = aiColor(args.bodyColor);
    if (!bodyColor) return aiFail("add_table bodyColor must be #rrggbb");
  }
  const pos = aiNewTablePosition(diagram);
  const committed = aiCommitTable(diagram, null, {
    name: name,
    headerColor: headerColor,
    bodyColor: bodyColor,
    comment: args.comment == null ? "" : String(args.comment),
    x: args.x == null ? pos.x : snap(finiteNum(args.x, pos.x)),
    y: args.y == null ? pos.y : snap(finiteNum(args.y, pos.y)),
    columns: columns.map(function (column) {
      return Object.assign({ origName: null }, column);
    }),
  });
  if (!committed.ok) return aiFail("add_table: " + committed.error);
  return aiOk(committed.diagram, 'Added table "' + name + '"');
}

/**
 * @param {DiagramState} diagram
 * @param {object} args
 * @returns {{ok:true, diagram:DiagramState, summary:string}|{ok:false, error:string}}
 */
function aiUpdateTable(diagram, args) {
  const name = aiName(args.name);
  const table = name && diagram.tables[name];
  if (!table) return aiFail('update_table: no table "' + aiLabel(args.name) + '"');
  const newName = args.newName == null ? name : aiName(args.newName);
  if (!newName) return aiFail("update_table needs a new name");
  if (newName !== name && diagram.tables[newName]) {
    return aiFail('update_table: table "' + newName + '" already exists');
  }
  let headerColor = table.headerColor || defaultHeaderColor();
  let bodyColor = table.bodyColor || defaultBodyColor();
  if (args.headerColor != null && args.headerColor !== "") {
    headerColor = aiColor(args.headerColor);
    if (!headerColor) return aiFail("update_table headerColor must be #rrggbb");
  }
  if (args.bodyColor != null && args.bodyColor !== "") {
    bodyColor = aiColor(args.bodyColor);
    if (!bodyColor) return aiFail("update_table bodyColor must be #rrggbb");
  }
  const committed = aiCommitTable(
    diagram,
    name,
    aiTableModel(table, {
      name: newName,
      headerColor: headerColor,
      bodyColor: bodyColor,
      comment: args.comment == null ? table.comment || "" : String(args.comment),
      columns: table.columns.map(aiEditColumn),
    }),
  );
  if (!committed.ok) return aiFail("update_table: " + committed.error);
  let next = committed.diagram;
  if (args.x != null || args.y != null) {
    const moved = next.tables[newName];
    next = withTableBox(next, newName, {
      x: args.x == null ? moved.x : snap(finiteNum(args.x, moved.x)),
      y: args.y == null ? moved.y : snap(finiteNum(args.y, moved.y)),
      width: moved.width,
      height: moved.height,
    });
  }
  return aiOk(next, 'Updated table "' + newName + '"');
}

/**
 * @param {DiagramState} diagram
 * @param {object} args
 * @returns {{ok:true, diagram:DiagramState, summary:string}|{ok:false, error:string}}
 */
function aiDeleteTable(diagram, args) {
  const name = aiName(args.name);
  if (!name || !diagram.tables[name]) {
    return aiFail('delete_table: no table "' + aiLabel(args.name) + '"');
  }
  return aiOk(withoutTables(diagram, [name]), 'Deleted table "' + name + '"');
}

/**
 * @param {Column} existing
 * @param {object} args
 * @returns {{column:Column}|{error:string}}
 */
function aiMergedColumn(existing, args) {
  const spec = {
    name: args.newName == null ? existing.name : args.newName,
    type: args.type || args.dataType || existing.dataType,
    pk: args.pk == null && args.isPk == null ? existing.isPk : !!(args.pk || args.isPk),
    note: args.note == null ? existing.note || "" : args.note,
  };
  if (args.references === null) {
    // Drop the foreign key.
  } else if (args.references && typeof args.references === "object") {
    spec.references = args.references;
    spec.relationship = args.relationship || existing.fkType || "N:1";
  } else if (existing.isFk && existing.refTable && existing.refCol) {
    spec.references = { table: existing.refTable, column: existing.refCol };
    spec.relationship = args.relationship || existing.fkType || "N:1";
  }
  return aiColumn(spec);
}

/**
 * @param {DiagramState} diagram
 * @param {object} args
 * @returns {{ok:true, diagram:DiagramState, summary:string}|{ok:false, error:string}}
 */
function aiAddColumn(diagram, args) {
  const tableName = aiName(args.table);
  const table = tableName && diagram.tables[tableName];
  if (!table) return aiFail('add_column: no table "' + aiLabel(args.table) + '"');
  const parsed = aiColumn(args);
  if (parsed.error) return aiFail("add_column: " + parsed.error);
  if (getCol(table, parsed.column.name)) {
    return aiFail(
      'add_column: column "' + parsed.column.name + '" already exists on "' + tableName + '"',
    );
  }
  const committed = aiCommitTable(
    diagram,
    tableName,
    aiTableModel(table, {
      columns: table.columns.map(aiEditColumn).concat([
        Object.assign({ origName: null }, parsed.column),
      ]),
    }),
  );
  if (!committed.ok) return aiFail("add_column: " + committed.error);
  return aiOk(committed.diagram, 'Added column "' + tableName + "." + parsed.column.name + '"');
}

/**
 * @param {DiagramState} diagram
 * @param {object} args
 * @returns {{ok:true, diagram:DiagramState, summary:string}|{ok:false, error:string}}
 */
function aiUpdateColumn(diagram, args) {
  const tableName = aiName(args.table);
  const columnName = aiName(args.name);
  const table = tableName && diagram.tables[tableName];
  if (!table) return aiFail('update_column: no table "' + aiLabel(args.table) + '"');
  const existing = columnName && getCol(table, columnName);
  if (!existing) {
    return aiFail('update_column: no column "' + tableName + "." + aiLabel(args.name) + '"');
  }
  const parsed = aiMergedColumn(existing, args);
  if (parsed.error) return aiFail("update_column: " + parsed.error);
  if (
    parsed.column.name !== existing.name &&
    table.columns.some(function (c) { return c.name === parsed.column.name; })
  ) {
    return aiFail('update_column: column "' + parsed.column.name + '" already exists');
  }
  const committed = aiCommitTable(
    diagram,
    tableName,
    aiTableModel(table, {
      columns: table.columns.map(function (column) {
        if (column.name !== existing.name) return aiEditColumn(column);
        return Object.assign({ origName: existing.name }, parsed.column);
      }),
    }),
  );
  if (!committed.ok) return aiFail("update_column: " + committed.error);
  return aiOk(
    committed.diagram,
    'Updated column "' + tableName + "." + parsed.column.name + '"',
  );
}

/**
 * @param {DiagramState} diagram
 * @param {object} args
 * @returns {{ok:true, diagram:DiagramState, summary:string}|{ok:false, error:string}}
 */
function aiDeleteColumn(diagram, args) {
  const tableName = aiName(args.table);
  const columnName = aiName(args.name);
  const table = tableName && diagram.tables[tableName];
  if (!table) return aiFail('delete_column: no table "' + aiLabel(args.table) + '"');
  if (!columnName || !getCol(table, columnName)) {
    return aiFail('delete_column: no column "' + tableName + "." + aiLabel(args.name) + '"');
  }
  const committed = aiCommitTable(
    diagram,
    tableName,
    aiTableModel(table, {
      columns: table.columns
        .filter(function (column) { return column.name !== columnName; })
        .map(aiEditColumn),
    }),
  );
  if (!committed.ok) return aiFail("delete_column: " + committed.error);
  return aiOk(committed.diagram, 'Deleted column "' + tableName + "." + columnName + '"');
}

/**
 * @param {DiagramState} diagram
 * @param {object} args
 * @returns {{ok:true, diagram:DiagramState, summary:string}|{ok:false, error:string}}
 */
function aiAddRelationship(diagram, args) {
  const fromTable = aiName(args.fromTable);
  const fromColumn = aiName(args.fromColumn);
  const toTable = aiName(args.toTable);
  const toColumn = aiName(args.toColumn);
  if (!fromTable || !fromColumn || !toTable || !toColumn) {
    return aiFail("add_relationship needs fromTable, fromColumn, toTable, and toColumn");
  }
  if (!diagram.tables[fromTable]) return aiFail('add_relationship: no table "' + fromTable + '"');
  if (!diagram.tables[toTable]) return aiFail('add_relationship: no table "' + toTable + '"');
  const type = aiRelType(args.type || args.relationship, "N:1");
  if (!type) {
    return aiFail(
      'add_relationship: unknown type "' +
        (args.type || args.relationship) +
        '". Use ' +
        REL_TYPES.join(", "),
    );
  }
  const pk = getCol(diagram.tables[toTable], toColumn);
  if (!pk) {
    return aiFail('add_relationship: "' + toTable + '" has no column "' + toColumn + '"');
  }
  if (!pk.isPk) {
    return aiFail('add_relationship: "' + toTable + "." + toColumn + '" is not a primary key');
  }
  const label = fromTable + "." + fromColumn + " → " + toTable + "." + toColumn;
  if (!getCol(diagram.tables[fromTable], fromColumn)) {
    const added = aiAddColumn(diagram, {
      table: fromTable,
      name: fromColumn,
      type: args.dataType || pk.dataType || "INTEGER",
      references: { table: toTable, column: toColumn },
      relationship: type,
    });
    if (!added.ok) {
      return aiFail(added.error.replace(/^add_column:/, "add_relationship:"));
    }
    return aiOk(added.diagram, "Linked " + label);
  }
  let next = diagram;
  for (const rel of diagram.relationships) {
    if (rel.table1 !== fromTable || rel.fkCol !== fromColumn) continue;
    if (rel.table2 === toTable && rel.pkCol === toColumn && (rel.type || "N:1") === type) {
      return aiOk(diagram, "Relationship " + label + " is already there");
    }
    next = withoutRelationship(next, relKey(rel));
  }
  const linked = withNewRelationship(next, {
    table1: fromTable,
    fkCol: fromColumn,
    table2: toTable,
    pkCol: toColumn,
    type: type,
    dataType: args.dataType || undefined,
  });
  return aiOk(linked.diagram, "Linked " + label);
}

/**
 * @param {DiagramState} diagram
 * @param {object} args
 * @returns {{ok:true, diagram:DiagramState, summary:string}|{ok:false, error:string}}
 */
function aiDeleteRelationship(diagram, args) {
  const fromTable = aiName(args.fromTable);
  const fromColumn = aiName(args.fromColumn);
  if (!fromTable || !fromColumn) {
    return aiFail("delete_relationship needs fromTable and fromColumn");
  }
  const toTable = args.toTable == null ? null : aiName(args.toTable);
  const toColumn = args.toColumn == null ? null : aiName(args.toColumn);
  const matches = diagram.relationships.filter(function (rel) {
    return (
      rel.table1 === fromTable &&
      rel.fkCol === fromColumn &&
      (toTable == null || rel.table2 === toTable) &&
      (toColumn == null || rel.pkCol === toColumn)
    );
  });
  if (!matches.length) {
    return aiFail("delete_relationship: no relationship from " + fromTable + "." + fromColumn);
  }
  let next = diagram;
  for (const rel of matches) next = withoutRelationship(next, relKey(rel));
  return aiOk(next, "Removed relationship from " + fromTable + "." + fromColumn);
}

/**
 * @param {DiagramState} diagram
 * @param {object} args
 * @returns {{ok:true, diagram:DiagramState, summary:string}|{ok:false, error:string}}
 */
function aiAddNote(diagram, args) {
  const text = args.text == null ? "" : String(args.text);
  if (!aiLabel(text)) return aiFail("add_note needs text");
  const pos = aiNewNotePosition(diagram);
  const note = {
    id: freshNoteId(diagram.canvasNotes),
    x: args.x == null ? pos.x : snap(finiteNum(args.x, pos.x)),
    y: args.y == null ? pos.y : snap(finiteNum(args.y, pos.y)),
    width: DEFAULT_NOTE_W,
    height: DEFAULT_NOTE_H,
    color: DEFAULT_NOTE_COLOR,
    text: text,
  };
  return aiOk(withAddedNote(diagram, note), "Added a note");
}

/**
 * @param {DiagramState} diagram
 * @param {object} args
 * @returns {{ok:true, diagram:DiagramState, summary:string}|{ok:false, error:string}}
 */
function aiUpdateNote(diagram, args) {
  const id = aiName(args.id);
  const notes = diagram.canvasNotes || [];
  if (!id || !notes.some(function (note) { return note.id === id; })) {
    return aiFail('update_note: no note "' + aiLabel(args.id) + '"');
  }
  const fields = {};
  if (args.text != null) {
    if (!aiLabel(args.text)) return aiFail("update_note text is empty");
    fields.text = String(args.text);
  }
  if (args.x != null) fields.x = snap(finiteNum(args.x, 0));
  if (args.y != null) fields.y = snap(finiteNum(args.y, 0));
  if (!Object.keys(fields).length) return aiFail("update_note needs a change");
  return aiOk(withNoteFields(diagram, id, fields), 'Updated note "' + id + '"');
}

/**
 * @param {DiagramState} diagram
 * @param {object} args
 * @returns {{ok:true, diagram:DiagramState, summary:string}|{ok:false, error:string}}
 */
function aiDeleteNote(diagram, args) {
  const id = aiName(args.id);
  const notes = diagram.canvasNotes || [];
  if (!id || !notes.some(function (note) { return note.id === id; })) {
    return aiFail('delete_note: no note "' + aiLabel(args.id) + '"');
  }
  return aiOk(withoutNotes(diagram, [id]), 'Deleted note "' + id + '"');
}

/**
 * @param {DiagramState} diagram
 * @param {object} args
 * @returns {{ok:true, diagram:DiagramState, summary:string}|{ok:false, error:string}}
 */
function aiSetNotes(diagram, args) {
  if (args.text == null) return aiFail("set_notes needs text");
  return aiOk(withDiagramNotes(diagram, String(args.text)), "Updated diagram notes");
}

/**
 * @param {*} spec
 * @param {Table|undefined} previous
 * @param {DiagramState} placed Tables already accepted, used to find a free spot.
 * @returns {{table:Table}|{error:string}}
 */
function aiTableFromSpec(spec, previous, placed) {
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
    return { error: "each table must be an object" };
  }
  const name = aiName(spec.name);
  if (!name) return { error: "a table needs a name" };
  const specs = spec.columns == null ? [] : spec.columns;
  if (!Array.isArray(specs)) return { error: 'table "' + name + '" columns must be an array' };
  const columns = [];
  for (const columnSpec of specs) {
    const parsed = aiColumn(columnSpec);
    if (parsed.error) return { error: parsed.error };
    if (columns.some(function (c) { return c.name === parsed.column.name; })) {
      return { error: 'duplicate column "' + parsed.column.name + '" on "' + name + '"' };
    }
    columns.push(parsed.column);
  }
  let headerColor = (previous && previous.headerColor) || "";
  let bodyColor = (previous && previous.bodyColor) || "";
  if (spec.headerColor != null && spec.headerColor !== "") {
    headerColor = aiColor(spec.headerColor);
    if (!headerColor) return { error: 'table "' + name + '" headerColor must be #rrggbb' };
  }
  if (spec.bodyColor != null && spec.bodyColor !== "") {
    bodyColor = aiColor(spec.bodyColor);
    if (!bodyColor) return { error: 'table "' + name + '" bodyColor must be #rrggbb' };
  }
  const pos = previous
    ? { x: previous.x, y: previous.y }
    : aiNewTablePosition(placed);
  return {
    table: {
      name: name,
      x: spec.x == null ? pos.x : snap(finiteNum(spec.x, pos.x)),
      y: spec.y == null ? pos.y : snap(finiteNum(spec.y, pos.y)),
      width: previous && previous.width ? previous.width : DEFAULT_TABLE_WIDTH,
      headerColor: headerColor || defaultHeaderColor(),
      bodyColor: bodyColor || defaultBodyColor(),
      comment: spec.comment == null ? "" : String(spec.comment),
      columns: columns,
    },
  };
}

/**
 * @param {DiagramState} previous
 * @param {object} args
 * @returns {{ok:true, diagram:DiagramState, summary:string, replaces:true}|{ok:false, error:string}}
 */
function aiReplaceDiagram(previous, args) {
  const tableSpecs = args.tables;
  if (!Array.isArray(tableSpecs)) return aiFail("replace_diagram needs a tables array");
  const st = newState();
  st.canvasW = previous.canvasW || DEFAULT_CANVAS_W;
  st.canvasH = previous.canvasH || DEFAULT_CANVAS_H;
  st.notes = args.notes == null ? previous.notes || "" : String(args.notes);
  for (const spec of tableSpecs) {
    const key = spec && aiName(spec.name);
    const built = aiTableFromSpec(spec, key ? previous.tables[key] : undefined, st);
    if (built.error) return aiFail("replace_diagram: " + built.error);
    if (st.tables[built.table.name]) {
      return aiFail('replace_diagram: duplicate table "' + built.table.name + '"');
    }
    st.tables[built.table.name] = built.table;
  }
  for (const table of Object.keys(st.tables).map(function (name) { return st.tables[name]; })) {
    for (const column of table.columns) {
      const err = aiFkError(st.tables, column);
      if (err) return aiFail("replace_diagram: " + err);
    }
  }
  st.relationships = [];
  for (const table of Object.keys(st.tables).map(function (name) { return st.tables[name]; })) {
    for (const column of table.columns) {
      if (!column.isFk) continue;
      const oldRel = (previous.relationships || []).find(function (rel) {
        return (
          rel.table1 === table.name &&
          rel.fkCol === column.name &&
          rel.table2 === column.refTable &&
          rel.pkCol === column.refCol
        );
      });
      st.relationships.push({
        table1: table.name,
        fkCol: column.name,
        table2: column.refTable,
        pkCol: column.refCol,
        type: column.fkType || "N:1",
        verticalX: oldRel ? oldRel.verticalX : null,
      });
    }
  }
  if (args.canvasNotes == null) {
    st.canvasNotes = (previous.canvasNotes || []).map(function (note) {
      return Object.assign({}, note);
    });
  } else if (!Array.isArray(args.canvasNotes)) {
    return aiFail("replace_diagram canvasNotes must be an array");
  } else {
    const notes = [];
    for (const spec of args.canvasNotes) {
      if (!spec || typeof spec !== "object") return aiFail("replace_diagram: each note must be an object");
      const text = spec.text == null ? "" : String(spec.text);
      if (!aiLabel(text)) return aiFail("replace_diagram: a note needs text");
      const id = aiName(spec.id) || freshNoteId(notes);
      if (notes.some(function (note) { return note.id === id; })) {
        return aiFail('replace_diagram: duplicate note "' + id + '"');
      }
      const pos = aiNewNotePosition({ tables: st.tables, canvasNotes: notes });
      notes.push({
        id: id,
        x: spec.x == null ? pos.x : snap(finiteNum(spec.x, pos.x)),
        y: spec.y == null ? pos.y : snap(finiteNum(spec.y, pos.y)),
        width: DEFAULT_NOTE_W,
        height: DEFAULT_NOTE_H,
        color: DEFAULT_NOTE_COLOR,
        text: text,
      });
    }
    st.canvasNotes = notes;
  }
  const count = Object.keys(st.tables).length;
  return aiOk(
    st,
    "Replaced the diagram (" + count + " table" + (count === 1 ? "" : "s") + ")",
    true,
  );
}

/**
 * @param {DiagramState} diagram
 * @param {object} args A simplERD diagram file.
 * @returns {{ok:true, diagram:DiagramState, summary:string, replaces:true}|{ok:false, error:string}}
 */
function aiLoadDiagram(diagram, args) {
  try {
    const next = diagramFromJSON(args);
    const count = Object.keys(next.tables).length;
    return aiOk(
      next,
      "Loaded a diagram (" + count + " table" + (count === 1 ? "" : "s") + ")",
      true,
    );
  } catch (e) {
    return aiFail("load_diagram: that JSON is not a simplERD diagram");
  }
}

/** @type {Object<string, function(DiagramState, object): {ok:boolean}>} */
var AI_TOOL_FNS = {
  add_table: aiAddTable,
  update_table: aiUpdateTable,
  delete_table: aiDeleteTable,
  add_column: aiAddColumn,
  update_column: aiUpdateColumn,
  delete_column: aiDeleteColumn,
  add_relationship: aiAddRelationship,
  delete_relationship: aiDeleteRelationship,
  add_note: aiAddNote,
  update_note: aiUpdateNote,
  delete_note: aiDeleteNote,
  set_notes: aiSetNotes,
  replace_diagram: aiReplaceDiagram,
  load_diagram: aiLoadDiagram,
};

/**
 * Run one tool. The diagram passed in is not modified.
 * @param {DiagramState} diagram
 * @param {string} name
 * @param {object} args
 * @returns {{ok:true, diagram:DiagramState, summary:string, replaces?:boolean}|{ok:false, error:string}}
 */
function applyAiTool(diagram, name, args) {
  const tool = aiToolName(name);
  const fn = AI_TOOL_FNS[tool];
  if (!fn) {
    return aiFail('Unknown tool "' + aiLabel(name) + '". Use ' + AI_TOOLS.join(", "));
  }
  return fn(normalizedDiagram(diagram), aiArgs(args || {}));
}

/**
 * Run tool calls in order. Nothing is changed when one call fails.
 * @param {DiagramState} diagram
 * @param {{name:string, arguments?:object}[]} calls
 * @returns {{ok:true, diagram:DiagramState, summary:string, replaces:boolean}|{ok:false, error:string}}
 */
function applyAiTools(diagram, calls) {
  if (!Array.isArray(calls) || !calls.length) return aiFail("No tool calls to run");
  let next = normalizedDiagram(diagram);
  const summaries = [];
  let replaces = false;
  for (const call of calls) {
    const step = applyAiTool(next, call && call.name, call && call.arguments);
    if (!step.ok) return step;
    next = step.diagram;
    replaces = replaces || !!step.replaces;
    summaries.push(step.summary);
  }
  return { ok: true, diagram: next, summary: summaries.join(" · "), replaces: replaces };
}

/**
 * @param {object} item
 * @returns {{name:string, arguments:object}|null}
 */
function aiNormalizeCall(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  const name = aiToolName(item.name || item.tool);
  if (!name) return null;
  const args = item.arguments != null ? item.arguments : item.args != null ? item.args : item.parameters;
  if (args == null) return { name: name, arguments: {} };
  if (typeof args !== "object" || Array.isArray(args)) return null;
  return { name: name, arguments: args };
}

/**
 * @param {*} data
 * @returns {{name:string, arguments:object}[]|null}
 */
function aiCallsFrom(data) {
  if (Array.isArray(data)) return data.map(aiNormalizeCall);
  if (!data || typeof data !== "object") return null;
  if (Array.isArray(data.tools)) return data.tools.map(aiNormalizeCall);
  if (Array.isArray(data.tool_calls) || Array.isArray(data.toolCalls)) {
    return (data.tool_calls || data.toolCalls).map(aiNormalizeCall);
  }
  if ((data.name || data.tool) && (data.arguments || data.args || data.parameters)) {
    return [aiNormalizeCall(data)];
  }
  if (data.format === DIAGRAM_FORMAT && Array.isArray(data.tables)) {
    return [{ name: "load_diagram", arguments: data }];
  }
  return null;
}

/**
 * Pull tool calls out of an assistant reply.
 * @param {string} text
 * @returns {{ok:true, kind:"tools", tools:object[]}|{ok:true, kind:"share", payload:string}|{ok:false, error:string}}
 */
function parseAiReply(text) {
  const raw = String(text == null ? "" : text).trim();
  if (!raw) return aiFail("Paste the assistant's reply first");
  const blocks = [];
  const fence = /```(?:json)?\s*([\s\S]*?)```/gi;
  let match;
  while ((match = fence.exec(raw))) blocks.push(match[1].trim());
  if (!blocks.length) {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) blocks.push(raw.slice(start, end + 1));
  }
  let parsedCalls = null;
  for (let i = blocks.length - 1; i >= 0; i--) {
    try {
      parsedCalls = aiCallsFrom(JSON.parse(blocks[i]));
    } catch (e) {
      parsedCalls = null;
    }
    if (parsedCalls) break;
  }
  if (!parsedCalls) {
    if (raw.indexOf("{") === -1) {
      const share = raw.match(/#((?:s[012]\.[A-Za-z0-9_-]+)|(?:ai\.[^\s]+))/);
      if (share) return { ok: true, kind: "share", payload: share[1] };
    }
    return aiFail("That reply has no simplERD tool calls. Ask for a json block of tools.");
  }
  if (!parsedCalls.length) return aiFail("The tool list is empty");
  if (parsedCalls.some(function (call) { return !call; })) {
    return aiFail("A tool call is missing a name or has arguments that are not an object");
  }
  return { ok: true, kind: "tools", tools: parsedCalls };
}

/**
 * Share-link document an assistant can read without opening the editor.
 * @param {DiagramState} diagram
 * @returns {object}
 */
function aiShareDocument(diagram) {
  return {
    simplerd: 1,
    instruction: AI_SHARE_INSTRUCTION,
    diagram: JSON.parse(exportDiagramText(diagram)),
  };
}

/**
 * @param {DiagramState} diagram
 * @returns {string} Hash payload beginning with `ai.`.
 */
function encodeAiSharePayload(diagram) {
  return "ai." + JSON.stringify(aiShareDocument(diagram));
}

/**
 * @param {string} token Hash text beginning with `ai.`.
 * @returns {string} Diagram file JSON.
 */
function diagramTextFromAiShare(token) {
  let body = String(token).replace(/^ai\./, "");
  if (body.charAt(0) !== "{") body = decodeURIComponent(body);
  const parsed = JSON.parse(body);
  const diagram = parsed && parsed.diagram != null ? parsed.diagram : parsed;
  if (diagram && diagram.format === DIAGRAM_FORMAT) return JSON.stringify(diagram);
  const built = aiReplaceDiagram(newState(), diagram || {});
  if (!built.ok) throw new Error(built.error);
  return exportDiagramText(built.diagram);
}

/**
 * Diagram text the assistant reads and edits through tools.
 * @param {DiagramState} diagram
 * @returns {object}
 */
function aiDiagram(diagram) {
  const source = normalizedDiagram(diagram);
  const doc = {
    tables: Object.keys(source.tables)
      .sort()
      .map(function (name) {
        const table = source.tables[name];
        const item = {
          name: table.name,
          x: table.x,
          y: table.y,
          columns: table.columns.map(function (column) {
            const col = { name: column.name, type: column.dataType || "TEXT" };
            if (column.isPk) col.pk = true;
            if (column.note) col.note = column.note;
            if (column.isFk && column.refTable && column.refCol) {
              col.references = { table: column.refTable, column: column.refCol };
              if ((column.fkType || "N:1") !== "N:1") col.relationship = column.fkType;
            }
            return col;
          }),
        };
        if (table.comment) item.comment = table.comment;
        return item;
      }),
  };
  if (source.notes) doc.notes = source.notes;
  if (source.canvasNotes.length) {
    doc.canvasNotes = source.canvasNotes.map(function (note) {
      return { id: note.id, text: note.text || "", x: note.x, y: note.y };
    });
  }
  return doc;
}

/**
 * Instructions and the open diagram, ready to paste into a chat.
 * @param {DiagramState} diagram
 * @param {string} [link] Share link for the person. The assistant is told not to fetch it.
 * @param {string} [request] Change to apply immediately.
 * @returns {string}
 */
function aiToolPrompt(diagram, link, request) {
  const lines = [
    "You edit a simplERD entity-relationship diagram by calling tools. Do not open the website and do not click Add Table. Reply with one json code block and no other text:",
    '{"tools":[{"name":"tool_name","arguments":{}}]}',
    "Several tools in one reply run in order. The person pastes your reply back into simplERD, which applies it and can undo it.",
    "",
    "Tools:",
    "- add_table: name, comment?, x?, y?, headerColor?, bodyColor?, columns?: [{name, type?, pk?, note?, references?: {table, column}, relationship?}]",
    "  type defaults to TEXT. relationship is N:1, 1:N, 1:1, or N:M and defaults to N:1. Colors are #rrggbb.",
    "- update_table: name, newName?, comment?, x?, y?, headerColor?, bodyColor?",
    "- delete_table: name",
    "- add_column: table, name, type?, pk?, note?, references?: {table, column}, relationship?",
    "- update_column: table, name, newName?, type?, pk?, note?, references?, relationship?",
    "  Pass references: null to drop a foreign key.",
    "- delete_column: table, name",
    "- add_relationship: fromTable, fromColumn, toTable, toColumn, type?, dataType?",
    "  toColumn must already be a primary key. fromColumn is created when it is missing. type is N:1, 1:N, 1:1, or N:M.",
    "- delete_relationship: fromTable, fromColumn, toTable?, toColumn?",
    "- add_note: text, x?, y?",
    "- update_note: id, text?, x?, y?",
    "- delete_note: id",
    "- set_notes: text",
    "- replace_diagram: notes?, tables: [same fields as add_table], canvasNotes?: [{id?, text, x?, y?}]",
    "  Replaces every table. List every table to keep. Omitted x and y stay put for a table that already exists. Omit notes or canvasNotes to leave them as they are.",
    "",
    "Add a table and its primary key before another table references them.",
    "",
    "Current diagram:",
    JSON.stringify(aiDiagram(diagram), null, 2),
  ];
  if (link) {
    lines.push(
      "",
      "Share link for the person. Do not open it. The diagram above is already complete:",
      link,
    );
  }
  lines.push("");
  const asked = aiLabel(request);
  if (asked) {
    lines.push("Request:", asked, "", "Reply with the tool calls now.");
  } else {
    lines.push("The person will ask for a change in the next message. Use these tools for that change.");
  }
  return lines.join("\n");
}
