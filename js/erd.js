/**
 * @file Read and write simplERD diagrams as JSON. Older CSV `.erd` files can still be opened.
 */
"use strict";

/**
 * Encode one CSV field, quoting it when it contains commas, quotes, or newlines.
 * @param {*} v
 * @returns {string}
 */
function csvField(v) {
  v = String(v == null ? "" : v);
  return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}

/**
 * @param {Array<*>} arr
 * @returns {string}
 */
function csvRow(arr) {
  return arr.map(csvField).join(",");
}

/**
 * Parse CSV text, including quoted multiline fields.
 * @param {string} text
 * @returns {string[][]}
 */
function parseCSV(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [],
    field = "",
    inQ = false,
    i = 0;
  while (i < text.length) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQ = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQ = true;
      i++;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (c === "\r") {
      if (text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += c;
    i++;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** @type {string} Identifier stored in saved diagram files. */
var DIAGRAM_FORMAT = "simplerd";
/** @type {number} */
var DIAGRAM_VERSION = 1;

/**
 * @param {*} v
 * @param {number} fallback
 * @returns {number}
 */
function finiteNum(v, fallback) {
  const n = typeof v === "number" ? v : parseFloat(v);
  return isFinite(n) ? n : fallback;
}

/**
 * Build a diagram from a parsed JSON document.
 * @param {object} raw
 * @returns {DiagramState}
 */
function diagramFromJSON(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Not a diagram");
  }
  const tableSource = Array.isArray(raw.tables)
    ? raw.tables
    : raw.tables && typeof raw.tables === "object"
      ? Object.values(raw.tables)
      : null;
  if (raw.format && raw.format !== DIAGRAM_FORMAT) {
    throw new Error("Unrecognized diagram format");
  }
  if (!tableSource && raw.format !== DIAGRAM_FORMAT) {
    throw new Error("Not a simplERD diagram");
  }

  const tables = {};
  for (const src of tableSource || []) {
    if (!src || typeof src !== "object") continue;
    const name = String(src.name || "").trim();
    if (!name || tables[name]) continue;
    const columns = [];
    for (const col of Array.isArray(src.columns) ? src.columns : []) {
      if (!col || typeof col !== "object") continue;
      const colName = String(col.name || "").trim();
      if (!colName || colName === "N/A (No Columns)") continue;
      const isFk = !!col.isFk;
      columns.push({
        name: colName,
        dataType: String(col.dataType || "TEXT").trim() || "TEXT",
        isPk: !!col.isPk,
        isFk,
        refTable: isFk ? String(col.refTable || "").trim() || null : null,
        refCol: isFk ? String(col.refCol || "").trim() || null : null,
        fkType: isFk ? String(col.fkType || "N:1").trim() || "N:1" : "N:1",
        note: col.note == null ? "" : String(col.note),
      });
    }
    tables[name] = {
      name,
      x: finiteNum(src.x, 50),
      y: finiteNum(src.y, 50),
      width: Math.max(MIN_TABLE_WIDTH, finiteNum(src.width, DEFAULT_TABLE_WIDTH)),
      height:
        src.height == null
          ? undefined
          : Math.max(
              HEADER_H + Math.max(1, columns.length) * ROW_H + PAD_BOTTOM,
              finiteNum(src.height, 0),
            ),
      bodyColor: String(src.bodyColor || "").trim() || null,
      headerColor: String(src.headerColor || "").trim() || null,
      comment: src.comment == null ? "" : String(src.comment),
      columns,
    };
  }

  const rels = [];
  for (const src of Array.isArray(raw.relationships) ? raw.relationships : []) {
    if (!src || typeof src !== "object") continue;
    const table1 = String(src.table1 || "").trim();
    const fkCol = String(src.fkCol || "").trim();
    const table2 = String(src.table2 || "").trim();
    const pkCol = String(src.pkCol || "").trim();
    if (!table1 || !fkCol || !table2 || !pkCol) continue;
    const vx = src.verticalX == null || src.verticalX === "" ? null : finiteNum(src.verticalX, NaN);
    rels.push({
      table1,
      fkCol,
      table2,
      pkCol,
      type: String(src.type || "N:1").trim() || "N:1",
      verticalX: vx != null && isFinite(vx) ? vx : null,
    });
  }

  const canvasNotes = [];
  for (const src of Array.isArray(raw.canvasNotes) ? raw.canvasNotes : []) {
    if (!src || typeof src !== "object") continue;
    const id = String(src.id || "").trim();
    if (!id || !isFinite(finiteNum(src.x, NaN)) || !isFinite(finiteNum(src.y, NaN))) continue;
    canvasNotes.push({
      id,
      x: finiteNum(src.x, 0),
      y: finiteNum(src.y, 0),
      width: Math.max(MIN_NOTE_W, finiteNum(src.width, DEFAULT_NOTE_W)),
      height: Math.max(MIN_NOTE_H, finiteNum(src.height, DEFAULT_NOTE_H)),
      color: String(src.color || "").trim() || DEFAULT_NOTE_COLOR,
      text: src.text == null ? "" : String(src.text),
    });
  }

  const st = newState();
  st.tables = tables;
  for (const t of Object.values(st.tables)) {
    if (!t.bodyColor) t.bodyColor = defaultBodyColor();
    if (!t.headerColor) t.headerColor = defaultHeaderColor();
  }
  st.relationships = rels.filter((r) => {
    const t1 = st.tables[r.table1],
      t2 = st.tables[r.table2];
    if (!t1 || !t2) return false;
    const fk = getCol(t1, r.fkCol),
      pk = getCol(t2, r.pkCol);
    return !!(fk && pk && pk.isPk);
  });
  const canvas = raw.canvas && typeof raw.canvas === "object" ? raw.canvas : {};
  const canvasW = finiteNum(canvas.width, 0);
  const canvasH = finiteNum(canvas.height, 0);
  if (canvasW > 0) st.canvasW = canvasW;
  if (canvasH > 0) st.canvasH = canvasH;
  st.notes = raw.notes == null ? "" : String(raw.notes);
  st.canvasNotes = canvasNotes;
  return st;
}

/**
 * Serialize a diagram as pretty-printed JSON.
 * @param {DiagramState} diagram
 * @returns {string}
 */
function exportDiagramText(diagram) {
  const names = Object.keys(diagram.tables).sort();
  const relationships = diagram.relationships
    .slice()
    .sort((a, b) =>
      (a.table1 + a.fkCol + a.table2 + a.pkCol).localeCompare(
        b.table1 + b.fkCol + b.table2 + b.pkCol,
      ),
    );
  const canvasNotes = (diagram.canvasNotes || [])
    .slice()
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const doc = {
    format: DIAGRAM_FORMAT,
    version: DIAGRAM_VERSION,
    canvas: { width: diagram.canvasW, height: diagram.canvasH },
    notes: diagram.notes || "",
    tables: names.map((name) => {
      const t = diagram.tables[name];
      return {
        name: t.name,
        x: t.x,
        y: t.y,
        width: t.width,
        height: tableHeight(t) > tblHeight(t) ? tableHeight(t) : undefined,
        headerColor: (t.headerColor || defaultHeaderColor()).toLowerCase(),
        bodyColor: (t.bodyColor || defaultBodyColor()).toLowerCase(),
        comment: t.comment || "",
        columns: t.columns.map((c) => ({
          name: c.name,
          dataType: c.dataType || "TEXT",
          isPk: !!c.isPk,
          isFk: !!c.isFk,
          refTable: c.isFk ? c.refTable || null : null,
          refCol: c.isFk ? c.refCol || null : null,
          fkType: c.fkType || "N:1",
          note: c.note || "",
        })),
      };
    }),
    relationships: relationships.map((r) => ({
      table1: r.table1,
      fkCol: r.fkCol,
      table2: r.table2,
      pkCol: r.pkCol,
      type: r.type || "N:1",
      verticalX: r.verticalX == null ? null : r.verticalX,
    })),
    canvasNotes: canvasNotes.map((n) => ({
      id: n.id,
      x: n.x,
      y: n.y,
      width: n.width,
      height: n.height,
      color: (n.color || DEFAULT_NOTE_COLOR).toLowerCase(),
      text: n.text || "",
    })),
  };
  return JSON.stringify(doc, null, 2) + "\n";
}

/**
 * Parse a diagram file. JSON is the current format; CSV `.erd` text is still accepted.
 * @param {string} text
 * @returns {DiagramState}
 */
function importDiagramText(text) {
  const trimmed = String(text == null ? "" : text).replace(/^\uFEFF/, "").trim();
  if (trimmed.startsWith("{")) return diagramFromJSON(JSON.parse(trimmed));
  return importLegacyCSV(trimmed);
}


/**
 * Parse a legacy CSV `.erd` file into a diagram, including canvas notes.
 * @param {string} text
 * @returns {DiagramState}
 */
function importLegacyCSV(text) {
  const rows = parseCSV(text);
  const tables = {};
  const rels = [];
  const canvasNotes = [];
  let canvasW = null,
    canvasH = null,
    notes = "";
  let section = null;

  for (const row of rows) {
    if (!row.length || !String(row[0]).trim()) continue;
    const first = String(row[0]).trim();

    if (first === "TABLE_POSITION") {
      section = "POS";
      if (
        row.length > 1 &&
        String(row[1]).trim().toLowerCase() === "table name"
      )
        continue;
    } else if (first === "RELATIONSHIP_DEF") {
      section = "RELS";
      if (
        row.length > 1 &&
        String(row[1]).trim().toLowerCase() === "from table (fk source)"
      )
        continue;
    } else if (first === "CANVAS_SIZE_DEFINITION") {
      section = "CANVAS";
      if (row.length > 1 && String(row[1]).trim().toLowerCase() === "width")
        continue;
    } else if (first === "DIAGRAM_NOTES_DEFINITION") {
      section = "NOTES";
      continue;
    } else if (first === "CANVAS_NOTE_DEF") {
      section = "CNOTES";
      if (row.length > 1 && String(row[1]).trim().toLowerCase() === "id")
        continue;
    } else if (
      section === null &&
      row.length > 1 &&
      String(row[0]).trim().toLowerCase() === "table name" &&
      String(row[1]).trim().toLowerCase() === "column name"
    ) {
      section = "COLS";
      continue;
    } else if (section === null) {
      section = "COLS";
    }

    if (section === "COLS") {
      if (row.length < 2) continue;
      const tName = String(row[0]).trim();
      const cName = String(row[1]).trim();
      if (!tName) continue;
      if (!tables[tName]) {
        tables[tName] = {
          name: tName,
          x: 50,
          y: 50,
          width: DEFAULT_TABLE_WIDTH,
          bodyColor: null,
          headerColor: null,
          comment: "",
          columns: [],
        };
      }
      if (!cName || cName === "N/A (No Columns)") continue;
      const isFk = (row[4] || "").trim().toLowerCase() === "yes";
      tables[tName].columns.push({
        name: cName,
        dataType: (row[2] || "TEXT").trim() || "TEXT",
        isPk: (row[3] || "").trim().toLowerCase() === "yes",
        isFk,
        refTable: isFk ? (row[5] || "").trim() || null : null,
        refCol: isFk ? (row[6] || "").trim() || null : null,
        fkType: isFk ? (row[7] || "").trim() || "N:1" : "N:1",
        note: "",
      });
    } else if (section === "POS") {
      if (row.length < 5) continue;
      const tName = String(row[1]).trim();
      const x = parseFloat(row[2]),
        y = parseFloat(row[3]);
      const w = parseFloat(row[4]);
      if (!tables[tName]) {
        tables[tName] = {
          name: tName,
          x: 50,
          y: 50,
          width: DEFAULT_TABLE_WIDTH,
          bodyColor: null,
          headerColor: null,
          comment: "",
          columns: [],
        };
      }
      if (isFinite(x)) tables[tName].x = x;
      if (isFinite(y)) tables[tName].y = y;
      if (isFinite(w)) tables[tName].width = Math.max(MIN_TABLE_WIDTH, w);
      if (row.length > 5 && String(row[5]).trim())
        tables[tName].bodyColor = String(row[5]).trim();
      if (row.length > 6 && String(row[6]).trim())
        tables[tName].headerColor = String(row[6]).trim();
    } else if (section === "RELS") {
      if (row.length < 6) continue;
      const t1 = String(row[1]).trim(),
        fk = String(row[2]).trim();
      const t2 = String(row[3]).trim(),
        pk = String(row[4]).trim();
      const type = String(row[5] || "").trim() || "N:1";
      let vx = null;
      if (row.length > 6 && String(row[6]).trim()) {
        const v = parseFloat(row[6]);
        if (isFinite(v)) vx = v;
      }
      if (t1 && fk && t2 && pk)
        rels.push({
          table1: t1,
          fkCol: fk,
          table2: t2,
          pkCol: pk,
          type,
          verticalX: vx,
        });
    } else if (section === "CANVAS") {
      if (row.length >= 3) {
        const w = parseInt(row[1], 10),
          h = parseInt(row[2], 10);
        if (isFinite(w) && w > 0) canvasW = w;
        if (isFinite(h) && h > 0) canvasH = h;
      }
    } else if (section === "NOTES") {
      notes = String(row[0]);
      section = null;
    } else if (section === "CNOTES") {
      if (row.length < 7) continue;
      const id = String(row[1]).trim();
      const x = parseFloat(row[2]),
        y = parseFloat(row[3]);
      const w = parseFloat(row[4]),
        h = parseFloat(row[5]);
      if (!id || !isFinite(x) || !isFinite(y)) continue;
      canvasNotes.push({
        id,
        x,
        y,
        width: isFinite(w) ? Math.max(MIN_NOTE_W, w) : DEFAULT_NOTE_W,
        height: isFinite(h) ? Math.max(MIN_NOTE_H, h) : DEFAULT_NOTE_H,
        color: String(row[6] || "").trim() || DEFAULT_NOTE_COLOR,
        text: row.length > 7 ? String(row[7]) : "",
      });
    }
  }

  const st = newState();
  st.tables = tables;
  for (const t of Object.values(st.tables)) {
    if (!t.bodyColor) t.bodyColor = defaultBodyColor();
    if (!t.headerColor) t.headerColor = defaultHeaderColor();
  }
  // Only keep relationships whose endpoints resolve to a real PK column.
  st.relationships = rels.filter((r) => {
    const t1 = st.tables[r.table1],
      t2 = st.tables[r.table2];
    if (!t1 || !t2) return false;
    const fk = getCol(t1, r.fkCol),
      pk = getCol(t2, r.pkCol);
    return !!(fk && pk && pk.isPk);
  });
  if (canvasW) st.canvasW = canvasW;
  if (canvasH) st.canvasH = canvasH;
  st.notes = notes;
  st.canvasNotes = canvasNotes;
  return st;
}
