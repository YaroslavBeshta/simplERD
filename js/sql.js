/**
 * @file Generate DDL from a diagram and import CREATE TABLE / foreign-key SQL.
 */
"use strict";

/**
 * @param {string} t Application column type.
 * @returns {string} SQL type name.
 */
function mapDataTypeToSQL(t) {
  if (!t) return "TEXT";
  const up = t.toUpperCase();
  if (up.includes("VARCHAR") && up.includes("(") && up.includes(")")) return up;
  if (up.includes("CHAR") && up.includes("(") && up.includes(")")) return up;
  const map = {
    TEXT: "TEXT",
    INTEGER: "INTEGER",
    INT: "INTEGER",
    SERIAL: "INTEGER",
    BIGINT: "BIGINT",
    SMALLINT: "SMALLINT",
    REAL: "REAL",
    FLOAT: "FLOAT",
    "DOUBLE PRECISION": "DOUBLE PRECISION",
    NUMERIC: "NUMERIC",
    DECIMAL: "DECIMAL",
    BOOLEAN: "BOOLEAN",
    DATE: "DATE",
    DATETIME: "DATETIME",
    TIMESTAMP: "TIMESTAMP",
    TIME: "TIME",
    BLOB: "BLOB",
    UUID: "VARCHAR(36)",
    JSON: "TEXT",
    CHAR: "CHAR",
  };
  return map[up] || up;
}

/**
 * Build CREATE TABLE and ALTER TABLE DDL for a diagram.
 * @param {DiagramState} [st] Defaults to the open diagram.
 * @returns {string}
 */
function generateSQL(st) {
  st = st || state;
  const parts = [];
  const names = Object.keys(st.tables).sort();
  for (const name of names) {
    const t = st.tables[name];
    if (!t.columns.length) {
      parts.push(
        `-- Table "${t.name}" has no columns and will not be created.\n`,
      );
      continue;
    }
    const cols = [];
    const pks = [];
    for (const c of t.columns) {
      cols.push(`    "${c.name}" ${mapDataTypeToSQL(c.dataType)}`);
      if (c.isPk) pks.push(`"${c.name}"`);
    }
    let sql = `CREATE TABLE "${t.name}" (\n` + cols.join(",\n");
    if (pks.length) sql += `,\n    PRIMARY KEY (${pks.join(", ")})`;
    sql += "\n);";
    parts.push(sql);
    parts.push("\n");
    const comment = (t.comment || "").trim();
    if (comment) {
      parts.push(
        `COMMENT ON TABLE "${t.name}" IS '${comment.replace(/'/g, "''")}';\n`,
      );
    }
  }
  if (st.relationships.length) {
    parts.push("-- Foreign Key Constraints\n");
    const rels = st.relationships
      .slice()
      .sort((a, b) =>
        (a.table1 + "" + a.fkCol).localeCompare(b.table1 + "" + b.fkCol),
      );
    for (const r of rels) {
      parts.push(
        `ALTER TABLE "${r.table1}"\n` +
          `ADD CONSTRAINT "fk_${r.table1}_${r.fkCol}" FOREIGN KEY ("${r.fkCol}")\n` +
          `REFERENCES "${r.table2}" ("${r.pkCol}");`,
      );
      parts.push("\n");
    }
  }
  return parts.join("");
}

/**
 * @param {string} sqlType
 * @returns {string} Application column type.
 */
function mapSQLTypeToApp(sqlType) {
  if (!sqlType) return "TEXT";
  const up = sqlType.toUpperCase();
  for (const base of ["VARCHAR", "NUMERIC", "DECIMAL"]) {
    if (up.includes(base) && up.includes("(") && up.includes(")")) return up;
  }
  if (up.includes("CHAR") && up.includes("(") && up.includes(")")) return up;
  const map = {
    "DOUBLE PRECISION": "DOUBLE PRECISION",
    DATETIME: "DATETIME",
    TIMESTAMP: "TIMESTAMP",
    SMALLINT: "SMALLINT",
    BIGINT: "BIGINT",
    INTEGER: "INTEGER",
    BOOLEAN: "BOOLEAN",
    VARCHAR: "VARCHAR",
    DECIMAL: "DECIMAL",
    NUMERIC: "NUMERIC",
    DOUBLE: "DOUBLE PRECISION",
    FLOAT: "FLOAT",
    TEXT: "TEXT",
    REAL: "REAL",
    DATE: "DATE",
    TIME: "TIME",
    BLOB: "BLOB",
    CHAR: "CHAR",
    INT: "INTEGER",
  };
  for (const key of Object.keys(map)) {
    if (up.includes(key)) return map[key];
  }
  return up;
}

/**
 * Read CREATE TABLE and foreign-key ALTER TABLE statements.
 * @param {string} sqlContent
 * @returns {{tables: Object<string, {columns: Column[], pks: string[]}>, relationships: object[]}}
 */
function parseSQLSchema(sqlContent) {
  // Normalize backtick / bracket quoting to double quotes for broader support.
  sqlContent = sqlContent
    .replace(/`([^`]+)`/g, '"$1"')
    .replace(/\[([^\]]+)\]/g, '"$1"');
  sqlContent = sqlContent.replace(/\/\*[\s\S]*?\*\//g, "");
  sqlContent = sqlContent.replace(/--.*?\n/g, "\n");

  const tables = {}; // name -> {columns:[...], pks:[...]}
  const relationships = [];
  const statements = sqlContent
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);

  for (const stmt of statements) {
    const up = stmt.toUpperCase();
    if (up.startsWith("CREATE TABLE")) {
      const m =
        /CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(?:"([^"]+)"|([A-Za-z0-9_]+))\s*\(([\s\S]+)\)/i.exec(
          stmt,
        );
      if (!m) continue;
      const tableName = m[1] != null ? m[1] : m[2];
      if (!tableName) continue;
      const columnsStr = m[3];
      const columns = [];
      const primaryKeys = [];
      const colDefs = columnsStr.split(/,(?![^\(]*\))/);
      for (let colDef of colDefs) {
        colDef = colDef.trim();
        if (!colDef) continue;
        const cdUp = colDef.toUpperCase();
        if (cdUp.startsWith("PRIMARY KEY")) {
          const pkm = /PRIMARY KEY\s*\(([\s\S]+)\)/i.exec(colDef);
          if (pkm) {
            for (const pk of pkm[1].split(","))
              primaryKeys.push(pk.trim().replace(/^"|"$/g, ""));
          }
          continue;
        }
        if (
          /^(FOREIGN KEY|CONSTRAINT|UNIQUE|CHECK|KEY|INDEX)\b/i.test(colDef)
        ) {
          // Inline FOREIGN KEY table constraint
          const fkm =
            /FOREIGN KEY\s*\(\s*(?:"([^"]+)"|([A-Za-z0-9_]+))\s*\)\s+REFERENCES\s+(?:"([^"]+)"|([A-Za-z0-9_]+))\s*\(\s*(?:"([^"]+)"|([A-Za-z0-9_]+))\s*\)/i.exec(
              colDef,
            );
          if (fkm) {
            relationships.push({
              fromTable: tableName,
              fromCol: fkm[1] != null ? fkm[1] : fkm[2],
              toTable: fkm[3] != null ? fkm[3] : fkm[4],
              toCol: fkm[5] != null ? fkm[5] : fkm[6],
              type: "N:1",
            });
          }
          continue;
        }
        const cm =
          /^(?:"([^"]+)"|([A-Za-z0-9_]+))\s+([\w\s\(\),]+?)(?:\s+PRIMARY KEY|\s+NOT NULL|\s+NULL|\s+UNIQUE|\s+DEFAULT[\s\S]*|\s+REFERENCES[\s\S]*|$)/i.exec(
            colDef,
          );
        if (cm) {
          const colName = cm[1] != null ? cm[1] : cm[2];
          const appType = mapSQLTypeToApp(cm[3].trim());
          const isPk =
            cdUp.includes("PRIMARY KEY") || primaryKeys.includes(colName);
          if (isPk && !primaryKeys.includes(colName)) primaryKeys.push(colName);
          columns.push({
            name: colName,
            dataType: appType,
            isPk,
            isFk: false,
            refTable: null,
            refCol: null,
            fkType: "N:1",
          });
        }
      }
      tables[tableName] = {
        columns,
        pks: Array.from(new Set(primaryKeys)),
        comment: "",
      };
      for (const c of tables[tableName].columns) {
        if (tables[tableName].pks.includes(c.name)) c.isPk = true;
      }
    } else if (/^COMMENT\s+ON\s+TABLE\b/i.test(stmt)) {
      const cm =
        /COMMENT\s+ON\s+TABLE\s+(?:"([^"]+)"|([A-Za-z0-9_]+))\s+IS\s+'((?:[^']|'')*)'/i.exec(
          stmt,
        );
      if (cm) {
        const tableName = cm[1] != null ? cm[1] : cm[2];
        if (tables[tableName])
          tables[tableName].comment = cm[3].replace(/''/g, "'");
      }
    } else if (up.startsWith("ALTER TABLE")) {
      const fk = new RegExp(
        'ALTER TABLE\\s+(?:"([^"]+)"|([A-Za-z0-9_]+))\\s+' +
          'ADD\\s+(?:CONSTRAINT\\s+(?:"([^"]+)"|([A-Za-z0-9_]+))\\s+)?FOREIGN KEY\\s*\\((?:"([^"]+)"|([A-Za-z0-9_]+))\\)\\s+' +
          'REFERENCES\\s+(?:"([^"]+)"|([A-Za-z0-9_]+))\\s*\\((?:"([^"]+)"|([A-Za-z0-9_]+))\\)',
        "i",
      ).exec(stmt);
      if (fk) {
        relationships.push({
          fromTable: fk[1] != null ? fk[1] : fk[2],
          fromCol: fk[5] != null ? fk[5] : fk[6],
          toTable: fk[7] != null ? fk[7] : fk[8],
          toCol: fk[9] != null ? fk[9] : fk[10],
          type: "N:1",
        });
      }
    }
  }

  // Mark FK columns
  for (const rel of relationships) {
    const t = tables[rel.fromTable];
    if (!t) continue;
    const c = t.columns.find((c) => c.name === rel.fromCol);
    if (c) {
      c.isFk = true;
      c.refTable = rel.toTable;
      c.refCol = rel.toCol;
    }
  }
  return { tables, relationships };
}

/**
 * Turn a SQL schema into a diagram laid out on the current canvas.
 * @param {string} sqlContent
 * @returns {DiagramState}
 */
function importSQLText(sqlContent) {
  const { tables: parsed, relationships: parsedRels } =
    parseSQLSchema(sqlContent);
  const st = newState();
  st.canvasW = state.canvasW;
  st.canvasH = state.canvasH;

  const names = Object.keys(parsed);
  const spacingX = 60,
    spacingY = 60;
  const avgH = HEADER_H + 5 * ROW_H + PAD_BOTTOM;
  const wrap = $("canvasWrap");
  const viewW = Math.max(600, wrap ? wrap.clientWidth / view.zoom : 1200);
  const perRow = Math.max(
    1,
    Math.floor((viewW - spacingX) / (DEFAULT_TABLE_WIDTH + spacingX)),
  );
  const startX = snap(view.x + 80);
  const startY = snap(view.y + 80);

  names.forEach((name, i) => {
    const row = Math.floor(i / perRow),
      col = i % perRow;
    st.tables[name] = {
      name,
      x: snap(startX + col * (DEFAULT_TABLE_WIDTH + spacingX)),
      y: snap(startY + row * (avgH + spacingY)),
      width: DEFAULT_TABLE_WIDTH,
      bodyColor: defaultBodyColor(),
      headerColor: defaultHeaderColor(),
      comment: parsed[name].comment || "",
      columns: parsed[name].columns,
    };
  });
  for (const r of parsedRels) {
    const t1 = st.tables[r.fromTable],
      t2 = st.tables[r.toTable];
    if (!t1 || !t2) continue;
    const fk = t1.columns.find((c) => c.name === r.fromCol);
    const pk = t2.columns.find((c) => c.name === r.toCol);
    if (!fk || !pk) continue;
    st.relationships.push({
      table1: r.fromTable,
      fkCol: r.fromCol,
      table2: r.toTable,
      pkCol: r.toCol,
      type: r.type || "N:1",
      verticalX: null,
    });
  }
  return st;
}
