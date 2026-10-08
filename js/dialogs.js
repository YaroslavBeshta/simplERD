/**
 * @file Editors for tables, relationships, settings, and the help window.
 */
"use strict";

/**
 * Build `<option>` elements for the column type dropdown.
 * @param {string} selected
 * @returns {HTMLOptionElement[]}
 */
function typeOptions(selected) {
  const list = prefs.dataTypes.slice();
  if (selected && !list.includes(selected)) list.unshift(selected);
  return list;
}

/**
 * Open the create/edit table dialog.
 * @param {string|null} origName Existing table, or null to create one.
 * @param {{x:number, y:number}} [createPos] Scene position for a new table.
 * @returns {void}
 */
function openTableDialog(origName, createPos) {
  const editing = origName != null ? state.tables[origName] : null;
  const model = editing
    ? {
        name: editing.name,
        headerColor: editing.headerColor || defaultHeaderColor(),
        bodyColor: editing.bodyColor || defaultBodyColor(),
        columns: editing.columns.map((c) => ({
          origName: c.name,
          ...deepCopy(c),
        })),
      }
    : {
        name: uniqueTableName("Table" + (Object.keys(state.tables).length + 1)),
        headerColor: defaultHeaderColor(),
        bodyColor: defaultBodyColor(),
        columns: [
          {
            origName: null,
            name: "id",
            dataType: "INTEGER",
            isPk: true,
            isFk: false,
            refTable: null,
            refCol: null,
            fkType: "N:1",
          },
        ],
      };

  const nameIn = el("input", {
    type: "text",
    value: model.name,
    style: "flex:1; min-width:180px; font-weight:600",
  });
  const headerColorIn = el("input", {
    type: "color",
    value: toHex6(model.headerColor),
  });
  const bodyColorIn = el("input", {
    type: "color",
    value: toHex6(model.bodyColor),
  });

  const tbl = el("table", { class: "cols-editor" });
  tbl.append(
    el(
      "tr",
      {},
      el("th", { class: "col-drag-h" }),
      el("th", {}, "Name"),
      el("th", {}, "Type"),
      el("th", { title: "Primary Key" }, "PK"),
      el("th", { title: "Foreign Key" }, "FK"),
      el("th", {}, "References"),
      el("th", {}, "Cardinality"),
      el("th", {}, ""),
    ),
  );

  function pkColumnsOf(tableName) {
    if (tableName === model.name || (editing && tableName === origName)) {
      // self-reference: use PKs currently in the editor
      return readRows()
        .filter((r) => r.isPk)
        .map((r) => r.name)
        .filter(Boolean);
    }
    const t = state.tables[tableName];
    return t ? t.columns.filter((c) => c.isPk).map((c) => c.name) : [];
  }

  function makeRow(cm) {
    const tr = el("tr");
    tr._cm = cm;
    const nameI = el("input", { type: "text", value: cm.name });
    const typeS = el("select");
    for (const ty of typeOptions(cm.dataType))
      typeS.append(el("option", { value: ty }, ty));
    typeS.value = cm.dataType || "TEXT";
    const pkC = el("input", { type: "checkbox" });
    pkC.checked = !!cm.isPk;
    const fkC = el("input", { type: "checkbox" });
    fkC.checked = !!cm.isFk;

    const refWrap = el("span", {
      style: "display:inline-flex; gap:4px; align-items:center",
    });
    const refTableS = el("select", { style: "max-width:110px" });
    const refColS = el("select", { style: "max-width:100px" });
    const cardS = el("select");
    for (const rt of REL_TYPES) cardS.append(el("option", { value: rt }, rt));
    cardS.value = cm.fkType || "N:1";

    function refreshRefTables() {
      const cur = refTableS.value || cm.refTable || "";
      refTableS.textContent = "";
      refTableS.append(el("option", { value: "" }, "—"));
      const names = new Set(Object.keys(state.tables));
      if (editing) names.delete(origName);
      names.add(nameIn.value.trim() || model.name); // allow self-reference
      for (const n of Array.from(names).sort())
        refTableS.append(el("option", { value: n }, n));
      refTableS.value = names.has(cur) || cur === "" ? cur : "";
      refreshRefCols();
    }
    function refreshRefCols() {
      const cur = refColS.value || cm.refCol || "";
      refColS.textContent = "";
      refColS.append(el("option", { value: "" }, "—"));
      const rt = refTableS.value;
      const isSelf =
        rt && (rt === nameIn.value.trim() || (editing && rt === origName));
      const pks = rt
        ? isSelf
          ? readRows()
              .filter((r) => r.isPk)
              .map((r) => r.name)
          : pkColumnsOf(rt)
        : [];
      for (const p of pks) if (p) refColS.append(el("option", { value: p }, p));
      refColS.value = pks.includes(cur) ? cur : "";
    }
    function syncFkUI() {
      const on = fkC.checked;
      refTableS.disabled = refColS.disabled = cardS.disabled = !on;
      refWrap.style.opacity = cardS.style.opacity = on ? "1" : ".4";
    }
    fkC.addEventListener("change", () => {
      syncFkUI();
      if (fkC.checked) refreshRefTables();
    });
    refTableS.addEventListener("change", refreshRefCols);
    refWrap.append(refTableS, ".", refColS);
    refreshRefTables();
    refTableS.value = cm.refTable || "";
    refreshRefCols();
    refColS.value = cm.refCol || "";
    syncFkUI();

    const up = el(
      "button",
      {
        class: "icon-btn",
        title: "Move up",
        onclick: () => {
          const prev = tr.previousElementSibling;
          if (prev && prev.querySelector("td"))
            tr.parentNode.insertBefore(tr, prev);
        },
      },
      "▲",
    );
    const down = el(
      "button",
      {
        class: "icon-btn",
        title: "Move down",
        onclick: () => {
          const next = tr.nextElementSibling;
          if (next) tr.parentNode.insertBefore(next, tr);
        },
      },
      "▼",
    );
    const del = el(
      "button",
      {
        class: "icon-btn del",
        title: "Delete column",
        onclick: () => tr.remove(),
      },
      "✕",
    );
    const grip = el(
      "td",
      { class: "col-drag", title: "Drag to reorder" },
      "⋮⋮",
    );
    grip.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      tr.classList.add("dragging");
      function onMove(ev) {
        const rows = Array.from(tbl.querySelectorAll("tr")).filter(
          (r) => r._read && r !== tr,
        );
        let before = null;
        for (const row of rows) {
          const box = row.getBoundingClientRect();
          if (ev.clientY < box.top + box.height / 2) {
            before = row;
            break;
          }
        }
        if (before) {
          if (tr.nextElementSibling !== before) tbl.insertBefore(tr, before);
        } else if (tbl.lastElementChild !== tr) {
          tbl.append(tr);
        }
      }
      function onUp() {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        tr.classList.remove("dragging");
      }
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    });

    tr._read = () => ({
      origName: cm.origName || null,
      name: nameI.value.trim(),
      dataType: typeS.value,
      isPk: pkC.checked,
      isFk: fkC.checked,
      refTable: fkC.checked ? refTableS.value || null : null,
      refCol: fkC.checked ? refColS.value || null : null,
      fkType: cardS.value,
    });
    tr._nameInput = nameI;
    tr.append(
      grip,
      el("td", {}, nameI),
      el("td", {}, typeS),
      el("td", { style: "text-align:center" }, pkC),
      el("td", { style: "text-align:center" }, fkC),
      el("td", {}, refWrap),
      el("td", {}, cardS),
      el("td", { style: "white-space:nowrap" }, up, down, del),
    );
    return tr;
  }

  function readRows() {
    return Array.from(tbl.querySelectorAll("tr"))
      .filter((tr) => tr._read)
      .map((tr) => tr._read());
  }

  for (const cm of model.columns) tbl.append(makeRow(cm));

  const addBtn = el(
    "button",
    {
      class: "btn",
      style: "margin-top:8px",
      onclick: () => {
        tbl.append(
          makeRow({
            origName: null,
            name: "",
            dataType: "TEXT",
            isPk: false,
            isFk: false,
            refTable: null,
            refCol: null,
            fkType: "N:1",
          }),
        );
        const rows = tbl.querySelectorAll("tr");
        rows[rows.length - 1]._nameInput.focus();
      },
    },
    "+ Add Column",
  );

  const errEl = el("div", {
    style:
      "color:var(--danger); font-weight:600; margin-top:8px; min-height:16px",
  });

  const body = el(
    "div",
    {},
    el("div", { class: "form-row" }, el("label", {}, "Table name"), nameIn),
    el(
      "div",
      { class: "form-row" },
      el("label", {}, "Header color"),
      headerColorIn,
      el("label", { style: "margin-left:14px" }, "Body color"),
      bodyColorIn,
      el(
        "button",
        {
          class: "btn subtle",
          onclick: () => {
            headerColorIn.value = toHex6(defaultHeaderColor());
            bodyColorIn.value = toHex6(defaultBodyColor());
          },
        },
        "Reset to theme default",
      ),
    ),
    tbl,
    addBtn,
    errEl,
  );

  async function submit() {
    const name = nameIn.value.trim();
    const cols = readRows();
    // Validation
    if (!name) {
      errEl.textContent = "Table name is required.";
      return;
    }
    if ((editing ? name !== origName : true) && state.tables[name]) {
      errEl.textContent = `A table named "${name}" already exists.`;
      return;
    }
    const seen = new Set();
    for (const c of cols) {
      if (!c.name) {
        errEl.textContent = "Every column needs a name.";
        return;
      }
      if (seen.has(c.name.toLowerCase())) {
        errEl.textContent = `Duplicate column name "${c.name}".`;
        return;
      }
      seen.add(c.name.toLowerCase());
    }
    // Incomplete FK definitions are downgraded (like the desktop app allowed clearing).
    let cleared = 0;
    for (const c of cols) {
      if (c.isFk && (!c.refTable || !c.refCol)) {
        c.isFk = false;
        c.refTable = null;
        c.refCol = null;
        cleared++;
      }
    }
    // Data type mismatch detection
    const mismatches = [];
    for (const c of cols) {
      if (!c.isFk) continue;
      let pkType = null;
      if (c.refTable === name || (editing && c.refTable === origName)) {
        const pkRow = cols.find((x) => x.name === c.refCol);
        pkType = pkRow ? pkRow.dataType : null;
      } else {
        const t2 = state.tables[c.refTable];
        const pk = t2 && getCol(t2, c.refCol);
        pkType = pk ? pk.dataType : null;
      }
      if (pkType && pkType !== c.dataType) mismatches.push({ c, pkType });
    }
    if (mismatches.length) {
      const list = mismatches
        .map(
          (m) =>
            `• ${m.c.name} (${m.c.dataType}) → ${m.c.refTable}.${m.c.refCol} (${m.pkType})`,
        )
        .join("\n");
      const v = await showChoice(
        "Data type mismatch",
        el(
          "div",
          {},
          "These FK columns don't match the referenced PK type:",
          el("pre", { style: "margin:10px 0; white-space:pre-wrap" }, list),
          "Change the FK column type(s) to match?",
        ),
        [
          { label: "Cancel", value: "cancel" },
          { label: "Keep as is", value: "keep" },
          { label: "Change to match", value: "fix", cls: "primary" },
        ],
      );
      if (v === "cancel") {
        openModalAgain();
        return;
      }
      if (v === "fix") for (const m of mismatches) m.c.dataType = m.pkType;
    }
    applyTableEdits(editing ? origName : null, {
      name,
      headerColor: headerColorIn.value,
      bodyColor: bodyColorIn.value,
      x: createPos ? createPos.x : undefined,
      y: createPos ? createPos.y : undefined,
      columns: cols,
    });
    closeModal();
    if (cleared)
      toast(
        `${cleared} incomplete FK definition${cleared > 1 ? "s" : ""} cleared`,
      );
  }

  function openModalAgain() {
    openModal({
      title: editing ? `Edit Table — ${origName}` : "Add Table",
      body,
      buttons: [
        { label: "Cancel", onClick: closeModal },
        {
          label: editing ? "Apply" : "Create",
          cls: "primary",
          onClick: submit,
        },
      ],
    });
  }
  openModalAgain();
}

/**
 * Open the create/edit relationship dialog.
 * @param {Relationship|null} existing
 * @returns {void}
 */
function openRelationshipDialog(existing) {
  const tableNames = Object.keys(state.tables).sort();
  if (tableNames.length < 1) {
    toast("Add at least one table first");
    return;
  }

  const fkTableS = el("select", { style: "min-width:150px" });
  const fkColS = el("select", { style: "min-width:150px" });
  const pkTableS = el("select", { style: "min-width:150px" });
  const pkColS = el("select", { style: "min-width:150px" });
  const typeS = el("select");
  for (const rt of REL_TYPES) typeS.append(el("option", { value: rt }, rt));
  const errEl = el("div", {
    style:
      "color:var(--danger); font-weight:600; margin-top:8px; min-height:16px",
  });

  for (const n of tableNames) {
    fkTableS.append(el("option", { value: n }, n));
    pkTableS.append(el("option", { value: n }, n));
  }

  function fillCols(sel_, table, pkOnly) {
    sel_.textContent = "";
    const t = state.tables[table];
    if (!t) return;
    const cols = pkOnly ? t.columns.filter((c) => c.isPk) : t.columns;
    for (const c of cols)
      sel_.append(el("option", { value: c.name }, `${c.name} (${c.dataType})`));
  }
  fkTableS.addEventListener("change", () =>
    fillCols(fkColS, fkTableS.value, false),
  );
  pkTableS.addEventListener("change", () =>
    fillCols(pkColS, pkTableS.value, true),
  );

  if (existing) {
    fkTableS.value = existing.table1;
    pkTableS.value = existing.table2;
    fillCols(fkColS, existing.table1, false);
    fillCols(pkColS, existing.table2, true);
    fkColS.value = existing.fkCol;
    pkColS.value = existing.pkCol;
    typeS.value = existing.type || "N:1";
    fkTableS.disabled =
      fkColS.disabled =
      pkTableS.disabled =
      pkColS.disabled =
        true;
  } else {
    fillCols(fkColS, fkTableS.value, false);
    fillCols(pkColS, pkTableS.value, true);
    typeS.value = "N:1";
  }

  const body = el(
    "div",
    {},
    el(
      "div",
      { class: "form-row" },
      el("label", { style: "width:130px" }, "FK table · column"),
      fkTableS,
      fkColS,
    ),
    el(
      "div",
      { class: "form-row" },
      el("label", { style: "width:130px" }, "References (PK)"),
      pkTableS,
      pkColS,
    ),
    el(
      "div",
      { class: "form-row" },
      el("label", { style: "width:130px" }, "Cardinality"),
      typeS,
      el("span", { class: "muted" }, "FK side : PK side"),
    ),
    errEl,
  );

  async function submit() {
    if (existing) {
      pushUndo();
      existing.type = typeS.value;
      const t = state.tables[existing.table1];
      const c = t && getCol(t, existing.fkCol);
      if (c) c.fkType = typeS.value;
      closeModal();
      update();
      return;
    }
    const t1n = fkTableS.value,
      t2n = pkTableS.value;
    const fkn = fkColS.value,
      pkn = pkColS.value;
    if (!t1n || !t2n || !fkn || !pkn) {
      errEl.textContent =
        "Pick both columns (the referenced table needs a PK column).";
      return;
    }
    if (t1n === t2n && fkn === pkn) {
      errEl.textContent = "A column can't reference itself.";
      return;
    }
    const t1 = state.tables[t1n],
      t2 = state.tables[t2n];
    const fk = getCol(t1, fkn),
      pk = getCol(t2, pkn);
    if (state.relationships.some((r) => r.table1 === t1n && r.fkCol === fkn)) {
      errEl.textContent = `Column ${t1n}.${fkn} already has a relationship. Delete it first.`;
      return;
    }
    let newType = null;
    if (fk.dataType !== pk.dataType) {
      const v = await showChoice(
        "Data type mismatch",
        `"${t1n}.${fkn}" is ${fk.dataType} but "${t2n}.${pkn}" is ${pk.dataType}. Change the FK column type to ${pk.dataType}?`,
        [
          { label: "Cancel", value: "cancel" },
          { label: "Keep as is", value: "keep" },
          { label: `Change to ${pk.dataType}`, value: "fix", cls: "primary" },
        ],
      );
      if (v === "cancel") {
        reopen();
        return;
      }
      if (v === "fix") newType = pk.dataType;
    }
    pushUndo();
    if (newType) fk.dataType = newType;
    fk.isFk = true;
    fk.refTable = t2n;
    fk.refCol = pkn;
    fk.fkType = typeS.value;
    state.relationships.push({
      table1: t1n,
      fkCol: fkn,
      table2: t2n,
      pkCol: pkn,
      type: typeS.value,
      verticalX: null,
    });
    sel = {
      kind: "rel",
      key: relKey(state.relationships[state.relationships.length - 1]),
    };
    closeModal();
    update();
    toast("Relationship created");
  }

  function reopen() {
    openModal({
      title: existing ? "Edit Relationship" : "Add Relationship",
      body,
      narrow: false,
      buttons: [
        { label: "Cancel", onClick: closeModal },
        {
          label: existing ? "Apply" : "Create",
          cls: "primary",
          onClick: submit,
        },
      ],
    });
  }
  reopen();
}

/**
 * Open cardinality and data-type settings.
 * @returns {void}
 */
function openSettingsDialog() {
  const cardText = el("input", { type: "checkbox" });
  cardText.checked = prefs.showCardText;
  const cardSym = el("input", { type: "checkbox" });
  cardSym.checked = prefs.showCardSymbols;
  const typesTA = el("textarea", {
    rows: "8",
    style: "width:100%; font-family:ui-monospace,monospace",
  });
  typesTA.value = prefs.dataTypes.join("\n");
  const defHeaderIn = el("input", {
    type: "color",
    value: toHex6(defaultHeaderColor()),
  });
  const defBodyIn = el("input", {
    type: "color",
    value: toHex6(defaultBodyColor()),
  });

  const body = el(
    "div",
    {},
    el(
      "div",
      { class: "form-row" },
      el("label", { style: "width:150px" }, "Cardinality display"),
      el("label", { style: "font-weight:400" }, cardText, " Text"),
      el(
        "label",
        { style: "font-weight:400" },
        cardSym,
        " Crow's foot symbols",
      ),
    ),
    el(
      "div",
      { class: "form-row" },
      el("label", { style: "width:150px" }, "New table colors"),
      el("label", { style: "font-weight:400" }, "Header "),
      defHeaderIn,
      el("label", { style: "font-weight:400; margin-left:10px" }, "Body "),
      defBodyIn,
      el(
        "button",
        {
          class: "btn subtle",
          onclick: () => {
            defHeaderIn.value = toHex6(builtinHeaderColor());
            defBodyIn.value = toHex6(builtinBodyColor());
          },
        },
        "Use theme defaults",
      ),
      el(
        "span",
        { class: "muted" },
        `(applies to new tables, ${prefs.theme} theme)`,
      ),
    ),
    el(
      "div",
      { class: "form-row", style: "align-items:flex-start" },
      el(
        "label",
        { style: "width:150px; padding-top:6px" },
        "Column data types",
      ),
      el(
        "div",
        { style: "flex:1" },
        typesTA,
        el(
          "div",
          { class: "muted", style: "margin-top:4px" },
          "One type per line. Used in the column type dropdown.",
        ),
        el(
          "button",
          {
            class: "btn subtle",
            style: "margin-top:4px",
            onclick: () => {
              typesTA.value = DEFAULT_COLUMN_DATA_TYPES.join("\n");
            },
          },
          "Restore defaults",
        ),
      ),
    ),
  );

  openModal({
    title: "Settings",
    body,
    buttons: [
      { label: "Cancel", onClick: closeModal },
      {
        label: "Apply",
        cls: "primary",
        onClick: () => {
          prefs.showCardText = cardText.checked;
          prefs.showCardSymbols = cardSym.checked;
          if (!prefs.themeDefaults) prefs.themeDefaults = {};
          prefs.themeDefaults[prefs.theme] = {
            header:
              defHeaderIn.value.toLowerCase() === toHex6(builtinHeaderColor())
                ? null
                : defHeaderIn.value,
            body:
              defBodyIn.value.toLowerCase() === toHex6(builtinBodyColor())
                ? null
                : defBodyIn.value,
          };
          const types = typesTA.value
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean);
          if (types.length) prefs.dataTypes = Array.from(new Set(types));
          savePrefs();
          closeModal();
          update();
        },
      },
    ],
  });
}

/**
 * Open the shortcut list and the sample-diagram action.
 * @returns {void}
 */
function openHelpDialog() {
  const g = el("div", { class: "help-grid" });
  const rows = [
    ["T", "Add table"],
    ["R", "Add relationship"],
    ["N", "Add note"],
    ["F", "Zoom to fit"],
    ["Delete", "Delete selection"],
    ["Ctrl+C / Ctrl+V", "Copy table or note / paste table"],
    ["Ctrl+Z / Ctrl+Y", "Undo / redo"],
    ["Ctrl+S", "Save diagram"],
    ["Ctrl+O", "Open diagram"],
    ["Double-click canvas", "New table at cursor"],
    ["Double-click item", "Edit table, relationship, or note"],
    ["Right-click", "Context menu"],
    ["Mouse wheel", "Zoom at cursor"],
    ["Drag background", "Pan canvas"],
    ["Drag vertical line segment", "Re-route a relationship"],
  ];
  for (const [k, v] of rows)
    g.append(el("span", {}, el("kbd", {}, k)), el("span", {}, v));
  openModal({
    title: `simplERD — Help (v${APP_VERSION})`,
    body: el(
      "div",
      {},
      el(
        "p",
        { style: "margin-top:0" },
        "A zero-install ER diagram designer. Diagrams are saved as ",
        el("b", {}, ".json"),
        " files and can be exported or imported as SQL DDL. Share copies a link that opens this diagram.",
      ),
      el(
        "div",
        {
          class: "form-row",
          style:
            "padding:10px 12px; background:var(--panel-2); border:1px solid var(--border); border-radius:9px",
        },
        el(
          "button",
          {
            class: "btn primary",
            onclick: () => {
              closeModal();
              loadSampleDiagram();
            },
          },
          "Load Sample Diagram",
        ),
        el(
          "span",
          { class: "muted" },
          "A marketing-agency CRM example: customers, leads, campaigns, deals, interactions, and canvas notes.",
        ),
      ),
      g,
      el(
        "p",
        { class: "muted" },
        "Your work is kept in the browser between visits (autosave), but always save important diagrams to a file.",
      ),
    ),
    buttons: [{ label: "Close", cls: "primary", onClick: closeModal }],
  });
}
