/**
 * @file Read and write the `.erd` CSV file format, including canvas notes.
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
function csvRow(arr) { return arr.map(csvField).join(","); }

/**
 * Parse CSV text, including quoted multiline fields.
 * @param {string} text
 * @returns {string[][]}
 */
function parseCSV(text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const rows = [];
  let row = [], field = "", inQ = false, i = 0;
  while (i < text.length) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQ = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQ = true; i++; continue; }
    if (c === ",") { row.push(field); field = ""; i++; continue; }
    if (c === "\r") { if (text[i + 1] === "\n") i++; row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
    if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
    field += c; i++;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/**
 * Serialize the open diagram to the `.erd` CSV format.
 * @returns {string}
 */
function exportERDText() {
  const out = [];
  out.push(csvRow(["Table Name", "Column Name", "Data Type", "Is Primary Key", "Is Foreign Key",
                   "References Table", "References Column", "FK Relationship Type"]));
  const names = Object.keys(state.tables).sort();
  for (const name of names) {
    const t = state.tables[name];
    if (!t.columns.length) {
      out.push(csvRow([t.name, "N/A (No Columns)", "", "", "", "", "", ""]));
    } else {
      for (const c of t.columns) {
        out.push(csvRow([
          t.name, c.name, c.dataType,
          c.isPk ? "Yes" : "No",
          c.isFk ? "Yes" : "No",
          c.isFk ? (c.refTable || "") : "",
          c.isFk ? (c.refCol || "") : "",
          c.isFk ? (c.fkType || "N:1") : ""
        ]));
      }
    }
  }
  out.push("");
  out.push(csvRow(["TABLE_POSITION", "Table Name", "X", "Y", "Width", "Body Color HEX", "Header Color HEX"]));
  for (const name of names) {
    const t = state.tables[name];
    out.push(csvRow(["TABLE_POSITION", t.name, t.x, t.y, t.width,
                     (t.bodyColor || defaultBodyColor()).toLowerCase(),
                     (t.headerColor || defaultHeaderColor()).toLowerCase()]));
  }
  out.push(csvRow(["CANVAS_SIZE_DEFINITION", "Width", "Height"]));
  out.push(csvRow(["CANVAS_SIZE_DEFINITION", state.canvasW, state.canvasH]));
  if (state.relationships.length) {
    out.push("");
    out.push(csvRow(["RELATIONSHIP_DEF", "From Table (FK Source)", "FK Column",
                     "To Table (PK Source)", "PK Column", "Relationship Type", "VerticalSegmentX"]));
    const rels = state.relationships.slice().sort((a, b) =>
      (a.table1 + a.fkCol + a.table2 + a.pkCol).localeCompare(b.table1 + b.fkCol + b.table2 + b.pkCol));
    for (const r of rels) {
      out.push(csvRow(["RELATIONSHIP_DEF", r.table1, r.fkCol, r.table2, r.pkCol,
                       r.type || "N:1", r.verticalX == null ? "" : r.verticalX]));
    }
  }
  out.push("");
  out.push(csvRow(["DIAGRAM_NOTES_DEFINITION", "notes_content_follows"]));
  out.push(csvRow([state.notes || ""]));
  const canvasNotes = (state.canvasNotes || []).slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
  if (canvasNotes.length) {
    out.push("");
    out.push(csvRow(["CANVAS_NOTE_DEF", "Id", "X", "Y", "Width", "Height", "Color", "Text"]));
    for (const n of canvasNotes) {
      out.push(csvRow(["CANVAS_NOTE_DEF", n.id, n.x, n.y, n.width, n.height,
                       (n.color || DEFAULT_NOTE_COLOR).toLowerCase(), n.text || ""]));
    }
  }
  return "﻿" + out.join("\r\n") + "\r\n";
}

/**
 * Parse an `.erd` file into a diagram, including canvas notes.
 * @param {string} text
 * @returns {DiagramState}
 */
function importERDText(text) {
  const rows = parseCSV(text);
  const tables = {};
  const rels = [];
  const canvasNotes = [];
  let canvasW = null, canvasH = null, notes = "";
  let section = null;

  for (const row of rows) {
    if (!row.length || !String(row[0]).trim()) continue;
    const first = String(row[0]).trim();

    if (first === "TABLE_POSITION") {
      section = "POS";
      if (row.length > 1 && String(row[1]).trim().toLowerCase() === "table name") continue;
    } else if (first === "RELATIONSHIP_DEF") {
      section = "RELS";
      if (row.length > 1 && String(row[1]).trim().toLowerCase() === "from table (fk source)") continue;
    } else if (first === "CANVAS_SIZE_DEFINITION") {
      section = "CANVAS";
      if (row.length > 1 && String(row[1]).trim().toLowerCase() === "width") continue;
    } else if (first === "DIAGRAM_NOTES_DEFINITION") {
      section = "NOTES";
      continue;
    } else if (first === "CANVAS_NOTE_DEF") {
      section = "CNOTES";
      if (row.length > 1 && String(row[1]).trim().toLowerCase() === "id") continue;
    } else if (section === null && row.length > 1 &&
               String(row[0]).trim().toLowerCase() === "table name" &&
               String(row[1]).trim().toLowerCase() === "column name") {
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
        tables[tName] = { name: tName, x: 50, y: 50, width: DEFAULT_TABLE_WIDTH,
                          bodyColor: null, headerColor: null, columns: [] };
      }
      if (!cName || cName === "N/A (No Columns)") continue;
      const isFk = (row[4] || "").trim().toLowerCase() === "yes";
      tables[tName].columns.push({
        name: cName,
        dataType: (row[2] || "TEXT").trim() || "TEXT",
        isPk: (row[3] || "").trim().toLowerCase() === "yes",
        isFk,
        refTable: isFk ? ((row[5] || "").trim() || null) : null,
        refCol: isFk ? ((row[6] || "").trim() || null) : null,
        fkType: isFk ? ((row[7] || "").trim() || "N:1") : "N:1"
      });
    } else if (section === "POS") {
      if (row.length < 5) continue;
      const tName = String(row[1]).trim();
      const x = parseFloat(row[2]), y = parseFloat(row[3]);
      const w = parseFloat(row[4]);
      if (!tables[tName]) {
        tables[tName] = { name: tName, x: 50, y: 50, width: DEFAULT_TABLE_WIDTH,
                          bodyColor: null, headerColor: null, columns: [] };
      }
      if (isFinite(x)) tables[tName].x = x;
      if (isFinite(y)) tables[tName].y = y;
      if (isFinite(w)) tables[tName].width = Math.max(MIN_TABLE_WIDTH, w);
      if (row.length > 5 && String(row[5]).trim()) tables[tName].bodyColor = String(row[5]).trim();
      if (row.length > 6 && String(row[6]).trim()) tables[tName].headerColor = String(row[6]).trim();
    } else if (section === "RELS") {
      if (row.length < 6) continue;
      const t1 = String(row[1]).trim(), fk = String(row[2]).trim();
      const t2 = String(row[3]).trim(), pk = String(row[4]).trim();
      const type = (String(row[5] || "").trim()) || "N:1";
      let vx = null;
      if (row.length > 6 && String(row[6]).trim()) {
        const v = parseFloat(row[6]);
        if (isFinite(v)) vx = v;
      }
      if (t1 && fk && t2 && pk) rels.push({ table1: t1, fkCol: fk, table2: t2, pkCol: pk, type, verticalX: vx });
    } else if (section === "CANVAS") {
      if (row.length >= 3) {
        const w = parseInt(row[1], 10), h = parseInt(row[2], 10);
        if (isFinite(w) && w > 0) canvasW = w;
        if (isFinite(h) && h > 0) canvasH = h;
      }
    } else if (section === "NOTES") {
      notes = String(row[0]);
      section = null;
    } else if (section === "CNOTES") {
      if (row.length < 7) continue;
      const id = String(row[1]).trim();
      const x = parseFloat(row[2]), y = parseFloat(row[3]);
      const w = parseFloat(row[4]), h = parseFloat(row[5]);
      if (!id || !isFinite(x) || !isFinite(y)) continue;
      canvasNotes.push({
        id, x, y,
        width: isFinite(w) ? Math.max(MIN_NOTE_W, w) : DEFAULT_NOTE_W,
        height: isFinite(h) ? Math.max(MIN_NOTE_H, h) : DEFAULT_NOTE_H,
        color: String(row[6] || "").trim() || DEFAULT_NOTE_COLOR,
        text: row.length > 7 ? String(row[7]) : ""
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
  st.relationships = rels.filter(r => {
    const t1 = st.tables[r.table1], t2 = st.tables[r.table2];
    if (!t1 || !t2) return false;
    const fk = getCol(t1, r.fkCol), pk = getCol(t2, r.pkCol);
    return !!(fk && pk && pk.isPk);
  });
  if (canvasW) st.canvasW = canvasW;
  if (canvasH) st.canvasH = canvasH;
  st.notes = notes;
  st.canvasNotes = canvasNotes;
  return st;
}
