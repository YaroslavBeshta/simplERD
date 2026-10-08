/**
 * Tests for the pure diagram, geometry, undo, SQL, and JSON functions.
 * Run with: node --test test/pure.test.js
 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const scripts = [
  "js/constants.js",
  "js/state.js",
  "js/dom.js",
  "js/geom.js",
  "js/diagram.js",
  "js/history.js",
  "js/erd.js",
  "js/sql.js",
  "js/sample.js",
];

const app = vm.createContext({
  console,
  document: {
    documentElement: {},
    getElementById() {
      return null;
    },
    createElement() {
      return { style: {} };
    },
    createElementNS() {
      return {};
    },
    createTextNode(text) {
      return { textContent: text };
    },
  },
  getComputedStyle() {
    return { getPropertyValue: () => "" };
  },
  localStorage: {
    getItem: () => null,
    setItem() {},
  },
  setTimeout,
  clearTimeout,
});

for (const file of scripts) {
  const code = fs.readFileSync(path.join(root, file), "utf8");
  vm.runInContext(code, app, { filename: file });
}

Object.assign(app, {
  TextEncoder,
  TextDecoder,
  Blob,
  Response,
  CompressionStream,
  DecompressionStream,
  btoa,
  atob,
  URL,
  location: { hash: "" },
  history: { replaceState() {} },
  navigator: {},
  window: {},
});
vm.runInContext(
  fs.readFileSync(path.join(root, "js/files.js"), "utf8"),
  app,
  { filename: "js/files.js" },
);

/**
 * Values created inside the script sandbox have a different prototype.
 * @param {unknown} actual
 * @param {unknown} expected
 * @returns {void}
 */
function same(actual, expected) {
  assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected);
}

/**
 * @param {string} name
 * @param {object[]} columns
 * @param {object} [extra]
 * @returns {object}
 */
function table(name, columns, extra) {
  return Object.assign(
    {
      name,
      x: 40,
      y: 60,
      width: 200,
      headerColor: "#112233",
      bodyColor: "#ffffff",
      comment: "",
      columns,
    },
    extra || {},
  );
}

/**
 * @param {string} name
 * @param {object} [extra]
 * @returns {object}
 */
function column(name, extra) {
  return Object.assign(
    {
      name,
      dataType: "INTEGER",
      isPk: false,
      isFk: false,
      refTable: null,
      refCol: null,
      fkType: "N:1",
      note: "",
    },
    extra || {},
  );
}

/**
 * @param {object} tables
 * @param {object[]} [relationships]
 * @param {object[]} [canvasNotes]
 * @returns {object}
 */
function diagram(tables, relationships, canvasNotes) {
  return {
    tables,
    relationships: relationships || [],
    canvasNotes: canvasNotes || [],
    canvasW: 4000,
    canvasH: 3000,
    notes: "",
  };
}

function parentChild() {
  const parent = table("Parent", [
    column("id", { isPk: true, note: "key" }),
  ]);
  const child = table("Child", [
    column("id", { isPk: true }),
    column("parent_id", {
      isFk: true,
      refTable: "Parent",
      refCol: "id",
    }),
  ]);
  const rel = {
    table1: "Child",
    fkCol: "parent_id",
    table2: "Parent",
    pkCol: "id",
    type: "N:1",
    verticalX: null,
  };
  return diagram(
    { Parent: parent, Child: child },
    [rel],
    [{ id: "n1", x: 10, y: 10, width: 220, height: 120, color: "#fff4c2", text: "hi" }],
  );
}

test("selectionRect normalizes either drag direction", () => {
  same(app.selectionRect(30, 10, 10, 40), { x: 10, y: 10, w: 20, h: 30 });
});

test("rectOverlaps is true only when the boxes meet", () => {
  const box = { x: 0, y: 0, w: 10, h: 10 };
  assert.equal(app.rectOverlaps(9, 9, 5, 5, box), true);
  assert.equal(app.rectOverlaps(10, 0, 5, 5, box), false);
});

test("resizedBox grows east and keeps the opposite edge on a west drag", () => {
  const east = app.resizedBox(
    { dir: "e", startX: 100, startY: 80, startW: 200, startH: 180, px: 100, py: 80 },
    { x: 160, y: 80 },
    120,
    100,
  );
  same(east, { x: 100, y: 80, width: 260, height: 180 });

  const west = app.resizedBox(
    { dir: "w", startX: 100, startY: 80, startW: 200, startH: 180, px: 100, py: 80 },
    { x: 40, y: 80 },
    120,
    100,
  );
  assert.equal(west.x + west.width, 300);
  assert.equal(west.width >= 120, true);
});

test("resizedBox does not shrink below the minimum", () => {
  const north = app.resizedBox(
    { dir: "n", startX: 0, startY: 100, startW: 200, startH: 180, px: 0, py: 100 },
    { x: 0, y: 400 },
    120,
    100,
  );
  assert.equal(north.height, 100);
  assert.equal(north.y + north.height, 280);
});

test("normalizedDiagram fills fields missing from older saves", () => {
  const next = app.normalizedDiagram({ tables: {}, canvasW: 10, canvasH: 20 });
  same(next.canvasNotes, []);
  assert.equal(next.notes, "");
  same(next.relationships, []);
});

test("uniqueName adds a _copy suffix until the name is free", () => {
  assert.equal(app.uniqueName(["A"], "B"), "B");
  assert.equal(app.uniqueName(["A", "A_copy"], "A"), "A_copy2");
});

test("selectionFrom keeps a single item as its own kind", () => {
  const d = parentChild();
  assert.equal(app.selectionFrom(d, [], []), null);
  same(app.selectionFrom(d, ["Parent", "Missing"], []), {
    kind: "table",
    name: "Parent",
  });
  same(app.selectionFrom(d, [], ["n1"]), { kind: "note", id: "n1" });
  same(app.selectionFrom(d, ["Parent"], ["n1"]), {
    kind: "multi",
    names: ["Parent"],
    noteIds: ["n1"],
  });
});

test("selection queries ignore ids that are no longer on the diagram", () => {
  const d = parentChild();
  same(
    app.tableNamesInSelection(d, { kind: "multi", names: ["Child", "Gone"] }),
    ["Child"],
  );
  same(
    app.noteIdsInSelection(d, { kind: "multi", noteIds: ["n1", "n9"] }),
    ["n1"],
  );
});

test("freshNoteId skips ids already in use", () => {
  assert.equal(app.freshNoteId([]), "n1");
  assert.equal(app.freshNoteId([{ id: "n1" }, { id: "n2" }]), "n3");
});

test("overlap queries use each table and note box", () => {
  const d = parentChild();
  same(app.tablesOverlapping(d, { x: 40, y: 60, w: 10, h: 10 }), [
    "Parent",
    "Child",
  ]);
  same(app.tablesOverlapping(d, { x: 5000, y: 5000, w: 10, h: 10 }), []);
  same(app.notesOverlapping(d, { x: 0, y: 0, w: 30, h: 30 }), ["n1"]);
});

test("withoutTables drops the table and clears foreign keys that pointed at it", () => {
  const d = parentChild();
  const next = app.withoutTables(d, ["Parent"]);
  assert.equal(next.tables.Parent, undefined);
  assert.equal(d.tables.Child.columns[1].isFk, true);
  const fk = next.tables.Child.columns.find((c) => c.name === "parent_id");
  assert.equal(fk.isFk, false);
  assert.equal(fk.refTable, null);
  same(next.relationships, []);
});

test("withoutNotes removes only the requested notes", () => {
  const d = parentChild();
  const next = app.withoutNotes(d, ["n1"]);
  same(next.canvasNotes, []);
  assert.equal(d.canvasNotes.length, 1);
  assert.equal(app.withoutNotes(d, []), d);
});

test("tableWithColumn patches one column", () => {
  const t = table("Parent", [column("id", { isPk: true })]);
  const next = app.tableWithColumn(t, "id", { note: "primary" });
  assert.equal(next.columns[0].note, "primary");
  assert.equal(t.columns[0].note, "");
});

test("withoutRelationship clears the matching foreign key", () => {
  const d = parentChild();
  const key = app.relKey(d.relationships[0]);
  const next = app.withoutRelationship(d, key);
  same(next.relationships, []);
  assert.equal(next.tables.Child.columns[1].isFk, false);
  assert.equal(d.tables.Child.columns[1].isFk, true);
});

test("relationship route and type updates copy the relationship", () => {
  const d = parentChild();
  const key = app.relKey(d.relationships[0]);
  const routed = app.withRelationshipRoute(d, key, 120);
  assert.equal(routed.relationships[0].verticalX, 120);
  assert.equal(d.relationships[0].verticalX, null);
  const typed = app.withRelationshipType(d, d.relationships[0], "1:1");
  assert.equal(typed.relationships[0].type, "1:1");
  assert.equal(typed.tables.Child.columns[1].fkType, "1:1");
  assert.equal(d.relationships[0].type, "N:1");
});

test("withNewRelationship marks the column and appends one relationship", () => {
  const d = parentChild();
  const created = app.withNewRelationship(d, {
    table1: "Child",
    fkCol: "id",
    table2: "Parent",
    pkCol: "id",
    type: "1:1",
    dataType: "BIGINT",
  });
  const col = created.diagram.tables.Child.columns.find((c) => c.name === "id");
  assert.equal(col.isFk, true);
  assert.equal(col.dataType, "BIGINT");
  assert.equal(created.diagram.relationships.length, 2);
  assert.equal(d.tables.Child.columns[0].isFk, false);
  assert.equal(created.key, app.relKey(created.diagram.relationships[1]));
});

test("withGroupMove shifts selected tables and notes from their start positions", () => {
  const d = parentChild();
  const next = app.withGroupMove(
    d,
    {
      tables: [{ name: "Parent", x: 40, y: 60 }],
      notes: [{ id: "n1", x: 10, y: 10 }],
      offX: 0,
      offY: 0,
      originX: 40,
      originY: 60,
    },
    { x: 80, y: 100 },
  );
  assert.equal(next.tables.Parent.x, 80);
  assert.equal(next.tables.Parent.y, 100);
  assert.equal(next.canvasNotes[0].x, 50);
  assert.equal(next.canvasNotes[0].y, 50);
  assert.equal(d.tables.Parent.x, 40);
  assert.equal(next.tables.Child, d.tables.Child);
});

test("box and note helpers replace one record", () => {
  const d = parentChild();
  const sized = app.withTableBox(d, "Parent", { x: 1, y: 2, width: 300, height: 400 });
  assert.equal(sized.tables.Parent.width, 300);
  assert.equal(d.tables.Parent.width, 200);
  const note = app.withNoteBox(d, "n1", { x: 3, y: 4, width: 180, height: 90 });
  assert.equal(note.canvasNotes[0].height, 90);
  const moved = app.withNotePos(d, "n1", 8, 9);
  same([moved.canvasNotes[0].x, moved.canvasNotes[0].y], [8, 9]);
  const added = app.withAddedNote(d, {
    id: "n2",
    x: 0,
    y: 0,
    width: 140,
    height: 72,
    color: "#fff",
    text: "",
  });
  assert.equal(added.canvasNotes.length, 2);
  assert.equal(d.canvasNotes.length, 1);
  const fields = app.withNoteFields(d, "n1", { text: "edited" });
  assert.equal(fields.canvasNotes[0].text, "edited");
  assert.equal(app.withDiagramNotes(d, "side").notes, "side");
});

test("withPastedTable copies the table, offsets it, and keeps a valid foreign key", () => {
  const d = parentChild();
  const source = d.tables.Child;
  const pasted = app.withPastedTable(d, source, null);
  assert.equal(pasted.name, "Child_copy");
  assert.equal(source.x, 40);
  assert.equal(pasted.diagram.tables.Child_copy.x, 60);
  assert.equal(pasted.diagram.relationships.length, 2);
  assert.equal(pasted.diagram.relationships[1].table1, "Child_copy");
});

test("withTableEdits renames a table and updates references", () => {
  const d = parentChild();
  const model = {
    name: "Guardian",
    headerColor: "#112233",
    bodyColor: "#ffffff",
    comment: "owner",
    columns: [{ origName: "id", ...d.tables.Parent.columns[0], note: "pk" }],
  };
  const edited = app.withTableEdits(d, "Parent", model, { kind: "table", name: "Parent" });
  assert.equal(edited.diagram.tables.Parent, undefined);
  assert.equal(edited.diagram.tables.Guardian.comment, "owner");
  assert.equal(edited.diagram.tables.Guardian.columns[0].note, "pk");
  assert.equal(edited.diagram.tables.Child.columns[1].refTable, "Guardian");
  assert.equal(edited.diagram.relationships[0].table2, "Guardian");
  same(edited.selection, { kind: "table", name: "Guardian" });
  assert.equal(d.tables.Parent.comment, "");
});

test("withTableEdits creates a table and selects it", () => {
  const d = parentChild();
  const edited = app.withTableEdits(
    d,
    null,
    {
      name: "Extra",
      headerColor: "#112233",
      bodyColor: "#ffffff",
      comment: "",
      x: 15,
      y: 25,
      columns: [{ origName: null, ...column("id", { isPk: true }) }],
    },
    null,
  );
  assert.equal(edited.diagram.tables.Extra.x, 20);
  assert.equal(edited.diagram.tables.Extra.y, 20);
  same(edited.selection, { kind: "table", name: "Extra" });
});

test("undo stack helpers push, undo, and redo without changing the input arrays", () => {
  const first = app.withUndoSnapshot([], [], "a");
  same(first, { undoStack: ["a"], redoStack: [] });
  const undone = app.undoStep(first.undoStack, first.redoStack, "b");
  same(undone.undoStack, []);
  same(undone.redoStack, ["b"]);
  assert.equal(undone.restored, "a");
  const redone = app.redoStep(undone.undoStack, undone.redoStack, "c");
  same(redone.undoStack, ["c"]);
  same(redone.redoStack, []);
  assert.equal(redone.restored, "b");
  assert.equal(app.undoStep([], [], "x"), null);
  const many = Array.from({ length: app.MAX_UNDO }, (_, i) => String(i));
  const trimmed = app.withUndoSnapshot(many, ["old"], "new");
  assert.equal(trimmed.undoStack.length, app.MAX_UNDO);
  assert.equal(trimmed.undoStack[0], "1");
  assert.equal(trimmed.undoStack[trimmed.undoStack.length - 1], "new");
  same(trimmed.redoStack, []);
});

test("mapDataTypeToSQL and mapSQLTypeToApp keep known types", () => {
  assert.equal(app.mapDataTypeToSQL("varchar(255)"), "VARCHAR(255)");
  assert.equal(app.mapDataTypeToSQL("serial"), "INTEGER");
  assert.equal(app.mapDataTypeToSQL(""), "TEXT");
  assert.equal(app.mapSQLTypeToApp("INT"), "INTEGER");
});

test("JSON export and import keep comments, notes, and relationships", () => {
  const d = parentChild();
  d.tables.Parent.comment = "parent's note";
  const text = app.exportDiagramText(d);
  const back = app.importDiagramText(text);
  assert.equal(back.tables.Parent.comment, "parent's note");
  assert.equal(back.tables.Parent.columns[0].note, "key");
  assert.equal(back.relationships.length, 1);
  assert.equal(back.relationships[0].fkCol, "parent_id");
  assert.equal(back.canvasNotes[0].text, "hi");
});

test("SQL generate and parse keep table comments, column notes, and foreign keys", () => {
  const d = parentChild();
  d.tables.Parent.comment = "owner's table";
  const sql = app.generateSQL(d);
  assert.match(sql, /COMMENT ON TABLE "Parent" IS 'owner''s table';/);
  assert.match(sql, /COMMENT ON COLUMN "Parent"\."id" IS 'key';/);
  assert.match(sql, /FOREIGN KEY \("parent_id"\)/);
  const parsed = app.parseSQLSchema(sql);
  assert.equal(parsed.tables.Parent.comment, "owner's table");
  assert.equal(parsed.tables.Parent.columns[0].note, "key");
  assert.equal(parsed.tables.Child.columns.find((c) => c.name === "parent_id").isFk, true);
  assert.equal(parsed.relationships[0].toTable, "Parent");
});

test("sample edit, move, undo, and export round-trip", () => {
  const original = app.buildSampleState();
  const lead = original.tables.Lead;
  const edited = app.withTableEdits(
    original,
    "Lead",
    {
      name: "Lead",
      headerColor: lead.headerColor,
      bodyColor: lead.bodyColor,
      comment: "pipeline",
      columns: lead.columns.map((c) => ({
        origName: c.name,
        ...c,
        note: c.name === "email" ? "contact" : c.note,
      })),
    },
    { kind: "table", name: "Lead" },
  );
  const moved = app.withGroupMove(
    edited.diagram,
    {
      tables: [{ name: "Lead", x: lead.x, y: lead.y }],
      notes: [],
      offX: 0,
      offY: 0,
      originX: lead.x,
      originY: lead.y,
    },
    { x: lead.x + 40, y: lead.y },
  );
  const stacks = app.withUndoSnapshot([], [], JSON.stringify(edited.diagram));
  const step = app.undoStep(stacks.undoStack, stacks.redoStack, JSON.stringify(moved));
  const restored = JSON.parse(step.restored);
  assert.equal(restored.tables.Lead.x, lead.x);
  assert.equal(moved.tables.Lead.x, lead.x + 40);
  assert.equal(original.tables.Lead.comment, undefined);

  const text = app.exportDiagramText(moved);
  const fromJson = app.importDiagramText(text);
  assert.equal(fromJson.tables.Lead.comment, "pipeline");
  assert.equal(
    fromJson.tables.Lead.columns.find((c) => c.name === "email").note,
    "contact",
  );

  const sql = app.generateSQL(fromJson);
  const fromSql = app.importSQLText(sql);
  assert.equal(fromSql.tables.Lead.comment, "pipeline");
  assert.equal(
    fromSql.tables.Lead.columns.find((c) => c.name === "email").note,
    "contact",
  );
  assert.equal(
    fromSql.relationships.some((r) => r.table1 === "Lead" && r.fkCol === "industry_id"),
    true,
  );
});

/**
 * @param {object} diagram
 * @returns {object}
 */
function shareView(diagram) {
  return {
    notes: diagram.notes || "",
    canvasW: diagram.canvasW,
    canvasH: diagram.canvasH,
    tables: Object.keys(diagram.tables)
      .sort()
      .map((name) => {
        const t = diagram.tables[name];
        return {
          name: t.name,
          x: t.x,
          y: t.y,
          width: t.width,
          height: t.height == null ? null : t.height,
          headerColor: String(t.headerColor || "").toLowerCase(),
          bodyColor: String(t.bodyColor || "").toLowerCase(),
          comment: t.comment || "",
          columns: t.columns.map((c) => ({
            name: c.name,
            dataType: c.dataType,
            isPk: !!c.isPk,
            isFk: !!c.isFk,
            refTable: c.refTable,
            refCol: c.refCol,
            fkType: c.fkType || "N:1",
            note: c.note || "",
          })),
        };
      }),
    rels: diagram.relationships
      .map((r) => [r.table1, r.fkCol, r.table2, r.pkCol, r.type, r.verticalX])
      .sort(),
    canvasNotes: (diagram.canvasNotes || [])
      .map((n) => [
        n.id,
        n.x,
        n.y,
        n.width,
        n.height,
        String(n.color || "").toLowerCase(),
        n.text,
      ])
      .sort(),
  };
}

test("share links round-trip and stay shorter", async () => {
  const source = diagram(
    {
      Parent: table("Parent", [column("id", { isPk: true })]),
      Child: table(
        "Child",
        [
          column("id", { isPk: true, note: "key" }),
          column("parent_id", {
            isFk: true,
            refTable: "Parent",
            refCol: "id",
            fkType: "1:1",
            note: "owner",
          }),
          column("code", { dataType: "CHAR(3)", note: "sku" }),
        ],
        { width: 260, comment: "child table", height: 500 },
      ),
    },
    [
      {
        table1: "Child",
        fkCol: "parent_id",
        table2: "Parent",
        pkCol: "id",
        type: "1:1",
        verticalX: 320,
      },
    ],
    [
      {
        id: "n1",
        x: 10,
        y: 20,
        width: 300,
        height: 80,
        color: "#abcdef",
        text: "hello",
      },
    ],
  );
  source.notes = "diagram note";
  source.canvasW = 5000;

  const full = JSON.stringify(JSON.parse(app.exportDiagramText(source)));
  const packed = JSON.stringify(app.sharePack(source));
  const token = await app.encodeSharePayload(packed, full);
  assert.equal(token.startsWith("s2."), true);
  const opened = app.diagramFromJSON(JSON.parse(await app.decodeSharePayload(token)));
  const expected = JSON.stringify(shareView(app.diagramFromJSON(JSON.parse(full))));
  assert.equal(JSON.stringify(shareView(opened)), expected);

  const gzip = new CompressionStream("gzip");
  const oldBytes = new Uint8Array(
    await new Response(
      new Blob([new TextEncoder().encode(full)]).stream().pipeThrough(gzip),
    ).arrayBuffer(),
  );
  const legacy = "s1." + app.bytesToBase64Url(oldBytes);
  const legacyOpened = app.diagramFromJSON(
    JSON.parse(await app.decodeSharePayload(legacy)),
  );
  assert.equal(JSON.stringify(shareView(legacyOpened)), expected);

  const sample = app.buildSampleState();
  const sampleFull = JSON.stringify(JSON.parse(app.exportDiagramText(sample)));
  const sampleToken = await app.encodeSharePayload(
    JSON.stringify(app.sharePack(sample)),
    sampleFull,
  );
  const sampleOpened = app.diagramFromJSON(
    JSON.parse(await app.decodeSharePayload(sampleToken)),
  );
  assert.equal(
    JSON.stringify(shareView(sampleOpened)),
    JSON.stringify(shareView(app.diagramFromJSON(JSON.parse(sampleFull)))),
  );
  const sampleGzip = new CompressionStream("gzip");
  const sampleOld = new Uint8Array(
    await new Response(
      new Blob([new TextEncoder().encode(sampleFull)]).stream().pipeThrough(sampleGzip),
    ).arrayBuffer(),
  );
  const oldLen = ("s1." + app.bytesToBase64Url(sampleOld)).length;
  assert.ok(
    sampleToken.length < oldLen * 0.75,
    sampleToken.length + " vs " + oldLen,
  );
});
