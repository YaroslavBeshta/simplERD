/**
 * @file Draw the canvas and refresh the explorer, SQL preview, and status bar.
 */
"use strict";

/** Diagram drawing surface. */
var svg = $("svgCanvas");

/**
 * Convert a viewport point to scene coordinates.
 * @param {number} cx
 * @param {number} cy
 * @returns {{x: number, y: number}}
 */
function sceneFromClient(cx, cy) {
  const rect = svg.getBoundingClientRect();
  return {
    x: view.x + (cx - rect.left) / view.zoom,
    y: view.y + (cy - rect.top) / view.zoom,
  };
}

/**
 * Apply pan and zoom to the SVG viewBox and refresh the zoom label.
 * @returns {void}
 */
function applyViewBox() {
  const wrap = $("canvasWrap");
  const w = Math.max(1, wrap.clientWidth),
    h = Math.max(1, wrap.clientHeight);
  svg.setAttribute(
    "viewBox",
    `${view.x} ${view.y} ${w / view.zoom} ${h / view.zoom}`,
  );
  $("zoomLabel").textContent = Math.round(view.zoom * 100) + "%";
  placeCanvasSurface();
}

/**
 * Keep the background and grid covering the viewport, including negative coordinates.
 * @returns {void}
 */
function placeCanvasSurface() {
  const wrap = $("canvasWrap");
  const w = Math.max(1, wrap.clientWidth) / view.zoom;
  const h = Math.max(1, wrap.clientHeight) / view.zoom;
  const pad = Math.max(w, h, GRID * 4);
  const x = view.x - pad,
    y = view.y - pad;
  for (const id of ["canvasSheet", "canvasGrid"]) {
    const node = svg.querySelector("#" + id);
    if (!node) continue;
    node.setAttribute("x", x);
    node.setAttribute("y", y);
    node.setAttribute("width", w + pad * 2);
    node.setAttribute("height", h + pad * 2);
  }
}

/**
 * Compute the orthogonal route for a relationship.
 * @param {Relationship} r
 * @returns {{sx:number,sy:number,ex:number,ey:number,vx:number,sSide:string,eSide:string}|null}
 */
function relGeometry(r) {
  const t1 = state.tables[r.table1],
    t2 = state.tables[r.table2];
  if (!t1 || !t2) return null;
  const sy = colYAbs(t1, r.fkCol),
    ey = colYAbs(t2, r.pkCol);
  const gap = 48;
  let vx;
  if (r.verticalX != null) {
    vx = r.verticalX;
  } else if (r.table1 !== r.table2 && t2.x - (t1.x + t1.width) >= gap) {
    vx = (t1.x + t1.width + t2.x) / 2;
  } else if (r.table1 !== r.table2 && t1.x - (t2.x + t2.width) >= gap) {
    vx = (t2.x + t2.width + t1.x) / 2;
  } else {
    vx = Math.max(t1.x + t1.width, t2.x + t2.width) + 40;
  }
  // Attach each table on the edge facing the vertical segment.
  const sSide = vx >= t1.x + t1.width / 2 ? "right" : "left";
  const eSide = vx >= t2.x + t2.width / 2 ? "right" : "left";
  const sx = sSide === "right" ? t1.x + t1.width : t1.x;
  const ex = eSide === "right" ? t2.x + t2.width : t2.x;
  return { sx, sy, ex, ey, vx, sSide, eSide };
}

/**
 * Draw a crow's-foot or one-end marker.
 * @param {SVGGElement} g
 * @param {number} x
 * @param {number} y
 * @param {"left"|"right"} side Table edge the line attaches to.
 * @param {"1"|"N"|"M"} card
 * @returns {void}
 */
function drawEndSymbol(g, x, y, side, card) {
  // side: which edge of the table the line attaches to ('left'|'right' edge).
  // The symbol sits outside the table: dir is +1 when outside is to the right.
  const dir = side === "right" ? 1 : -1;
  const L = 12;
  if (card === "N" || card === "M") {
    // Crow's foot: vertex outside, prongs touch the table edge.
    const vx = x + dir * L;
    for (const dy of [-6, 0, 6]) {
      g.append(
        svgEl("line", { x1: vx, y1: y, x2: x, y2: y + dy, class: "rel-sym" }),
      );
    }
  } else {
    // "One": perpendicular bar.
    const bx = x + dir * (L - 3);
    g.append(
      svgEl("line", { x1: bx, y1: y - 6, x2: bx, y2: y + 6, class: "rel-sym" }),
    );
  }
}

/**
 * @param {Relationship} r
 * @returns {SVGGElement|null}
 */
function buildRelationship(r) {
  const geo = relGeometry(r);
  if (!geo) return null;
  const { sx, sy, ex, ey, vx, sSide, eSide } = geo;
  const key = relKey(r);
  const g = svgEl("g", {
    class:
      "rel" + (sel && sel.kind === "rel" && sel.key === key ? " selected" : ""),
  });
  g.dataset.rel = key;

  const d = `M ${sx} ${sy} H ${vx} V ${ey} H ${ex}`;
  g.append(svgEl("path", { d, class: "rel-hit" }));
  g.append(svgEl("path", { d, class: "rel-path" }));

  const [c1, c2] = (r.type || "N:1").split(":");
  if (prefs.showCardSymbols) {
    drawEndSymbol(g, sx, sy, sSide, c1);
    drawEndSymbol(g, ex, ey, eSide, c2);
  }
  if (prefs.showCardText) {
    const t1 = svgEl("text", {
      x: sx + (sSide === "right" ? 18 : -18),
      y: sy - 8,
      "text-anchor": "middle",
      class: "rel-card",
    });
    t1.textContent = c1;
    const t2 = svgEl("text", {
      x: ex + (eSide === "right" ? 18 : -18),
      y: ey - 8,
      "text-anchor": "middle",
      class: "rel-card",
    });
    t2.textContent = c2;
    g.append(t1, t2);
  }
  // Draggable vertical segment
  const vseg = svgEl("line", {
    x1: vx,
    y1: Math.min(sy, ey),
    x2: vx,
    y2: Math.max(sy, ey),
    class: "rel-vseg",
  });
  vseg.dataset.vseg = key;
  g.append(vseg);
  return g;
}

/**
 * @param {Table} t
 * @returns {SVGGElement}
 */
function buildTable(t) {
  const h = tblHeight(t);
  const w = t.width;
  const headerColor = t.headerColor || defaultHeaderColor();
  const bodyColor = t.bodyColor || defaultBodyColor();
  const headerText = contrastText(headerColor);
  const bodyText = contrastText(bodyColor);
  const selected = isTableSelected(t.name);
  const solo = !!(sel && sel.kind === "table" && sel.name === t.name);

  const g = svgEl("g", {
    class: "tbl-group" + (selected ? " selected" : ""),
    transform: `translate(${t.x},${t.y})`,
  });
  g.dataset.t = t.name;
  const comment = (t.comment || "").trim();
  if (comment) {
    const tip = svgEl("title");
    tip.textContent = comment;
    g.append(tip);
  }

  g.append(
    svgEl("rect", {
      x: 0,
      y: 0,
      width: w,
      height: h,
      rx: 8,
      fill: bodyColor,
      class: "tbl-frame",
    }),
  );
  // Header (rounded top corners only)
  const r = 8;
  g.append(
    svgEl("path", {
      d: `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${HEADER_H} H 0 V ${r} Q 0 0 ${r} 0 Z`,
      fill: headerColor,
    }),
  );
  const titleRoom = solo ? w - 72 : w - 16;
  const title = svgEl("text", {
    x: solo ? 8 + titleRoom / 2 : w / 2,
    y: HEADER_H / 2 + 4.5,
    "text-anchor": "middle",
    "font-size": "13",
    "font-weight": "700",
    fill: headerText,
  });
  title.textContent = truncate(t.name, Math.floor(titleRoom / 7.2));
  g.append(title);

  if (!t.columns.length) {
    const e = svgEl("text", {
      x: w / 2,
      y: HEADER_H + ROW_H / 2 + 4,
      "text-anchor": "middle",
      "font-size": "11",
      "font-style": "italic",
      fill: bodyText,
      opacity: 0.55,
    });
    e.textContent = "(no columns)";
    g.append(e);
  }

  t.columns.forEach((c, i) => {
    const cy = HEADER_H + i * ROW_H + ROW_H / 2 + 4;
    let x = 9;
    if (c.isPk) {
      const b = svgEl("text", {
        x,
        y: cy,
        "font-size": "9",
        "font-weight": "800",
        fill: "#c9992a",
      });
      b.textContent = "PK";
      g.append(b);
      x += 18;
    }
    if (c.isFk) {
      const b = svgEl("text", {
        x,
        y: cy,
        "font-size": "9",
        "font-weight": "800",
        fill: "#3b82f6",
      });
      b.textContent = "FK";
      g.append(b);
      x += 18;
    }
    const typeStr = truncate(
      c.dataType || "",
      Math.max(4, Math.floor((w * 0.32) / 6.2)),
    );
    const nameMax = Math.max(
      3,
      Math.floor((w - x - typeStr.length * 6.2 - 18) / 6.8),
    );
    const nameEl = svgEl("text", {
      x,
      y: cy,
      "font-size": "12",
      fill: bodyText,
      "font-weight": c.isPk ? "600" : "400",
    });
    nameEl.textContent = truncate(c.name, nameMax);
    g.append(nameEl);
    const typeEl = svgEl("text", {
      x: w - 9,
      y: cy,
      "text-anchor": "end",
      "font-size": "10.5",
      fill: bodyText,
      opacity: 0.62,
    });
    typeEl.textContent = typeStr;
    g.append(typeEl);
    if (i > 0) {
      g.append(
        svgEl("line", {
          x1: 6,
          y1: HEADER_H + i * ROW_H,
          x2: w - 6,
          y2: HEADER_H + i * ROW_H,
          stroke: bodyText,
          opacity: 0.09,
        }),
      );
    }
  });

  const rh = svgEl("rect", {
    x: w - 6,
    y: 0,
    width: 12,
    height: h,
    class: "tbl-resize",
  });
  rh.dataset.resize = t.name;
  g.append(rh);
  if (solo) {
    g.append(tableActionButton("copy", "Copy", w - 56, 7, drawCopyIcon));
    g.append(tableActionButton("duplicate", "Duplicate", w - 32, 7, drawDuplicateIcon));
  }
  return g;
}

/**
 * Small header button shown on the selected table.
 * @param {string} action Value stored in `data-sel-btn`.
 * @param {string} tipText
 * @param {number} x
 * @param {number} y
 * @param {(btn: SVGGElement) => void} drawIcon
 * @returns {SVGGElement}
 */
function tableActionButton(action, tipText, x, y, drawIcon) {
  const btn = svgEl("g", {
    class: "sel-btn",
    transform: `translate(${x},${y})`,
  });
  btn.dataset.selBtn = action;
  const tip = svgEl("title");
  tip.textContent = tipText;
  btn.append(tip);
  btn.append(
    svgEl("rect", { width: 20, height: 20, rx: 5, class: "sel-btn-bg" }),
  );
  drawIcon(btn);
  return btn;
}

/**
 * @param {SVGGElement} btn
 * @returns {void}
 */
function drawCopyIcon(btn) {
  btn.append(
    svgEl("rect", {
      x: 5,
      y: 7,
      width: 8,
      height: 9,
      rx: 1.2,
      fill: "none",
      stroke: "#212529",
      "stroke-width": 1.3,
    }),
  );
  btn.append(
    svgEl("rect", {
      x: 8,
      y: 4.5,
      width: 8,
      height: 9,
      rx: 1.2,
      fill: "#fff",
      stroke: "#212529",
      "stroke-width": 1.3,
    }),
  );
}

/**
 * @param {SVGGElement} btn
 * @returns {void}
 */
function drawDuplicateIcon(btn) {
  btn.append(
    svgEl("rect", {
      x: 3.5,
      y: 6.5,
      width: 9,
      height: 9,
      rx: 1.4,
      fill: "none",
      stroke: "#212529",
      "stroke-width": 1.3,
    }),
  );
  btn.append(
    svgEl("rect", {
      x: 7,
      y: 3.5,
      width: 9,
      height: 9,
      rx: 1.4,
      fill: "#fff",
      stroke: "#212529",
      "stroke-width": 1.3,
    }),
  );
  btn.append(
    svgEl("path", {
      d: "M11.5 6.4v4.2M9.4 8.5h4.2",
      fill: "none",
      stroke: "#212529",
      "stroke-width": 1.2,
      "stroke-linecap": "round",
    }),
  );
}

/**
 * Word-wrap note text to a character width.
 * @param {string} text
 * @param {number} maxWidth
 * @param {number} fontSize
 * @returns {string[]}
 */
function wrapNoteLines(text, maxWidth, fontSize) {
  const maxChars = Math.max(4, Math.floor(maxWidth / (fontSize * 0.56)));
  const lines = [];
  for (const para of String(text || "").split("\n")) {
    if (!para.trim()) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of para.split(/\s+/)) {
      if (!word) continue;
      const chunks =
        word.length > maxChars
          ? word.match(new RegExp(`.{1,${maxChars}}`, "g"))
          : [word];
      for (const chunk of chunks) {
        const trial = line ? line + " " + chunk : chunk;
        if (line && trial.length > maxChars) {
          lines.push(line);
          line = chunk;
        } else line = trial;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

/**
 * @param {CanvasNote} n
 * @returns {SVGGElement}
 */
function buildNote(n) {
  const w = Math.max(MIN_NOTE_W, n.width || DEFAULT_NOTE_W);
  const h = Math.max(MIN_NOTE_H, n.height || DEFAULT_NOTE_H);
  const fill = n.color || DEFAULT_NOTE_COLOR;
  const textColor = contrastText(fill);
  const selected = isNoteSelected(n.id);
  const solo = !!(sel && sel.kind === "note" && sel.id === n.id);
  const g = svgEl("g", {
    class: "note-group" + (selected ? " selected" : ""),
    transform: `translate(${n.x},${n.y})`,
  });
  g.dataset.note = n.id;
  g.append(
    svgEl("rect", {
      x: 2,
      y: 3,
      width: w,
      height: h,
      rx: 6,
      fill: "rgba(15,23,42,.12)",
    }),
  );
  g.append(
    svgEl("rect", {
      x: 0,
      y: 0,
      width: w,
      height: h,
      rx: 6,
      fill,
      class: "note-frame",
    }),
  );
  const fold = 14;
  g.append(
    svgEl("path", {
      d: `M ${w - fold} 0 L ${w} ${fold} L ${w - fold} ${fold} Z`,
      fill: "rgba(0,0,0,.10)",
      "pointer-events": "none",
    }),
  );

  const body = (n.text || "").trim();
  if (!body) {
    const ph = svgEl("text", {
      x: 12,
      y: 24,
      "font-size": "12",
      "font-style": "italic",
      fill: textColor,
      opacity: 0.45,
    });
    ph.textContent = "Double-click to edit";
    g.append(ph);
  } else {
    const lineH = 16;
    const lines = wrapNoteLines(n.text, w - 24, 12);
    const maxLines = Math.max(1, Math.floor((h - 22) / lineH));
    const shown = lines.slice(0, maxLines);
    if (lines.length > maxLines && shown.length) {
      const last = shown[shown.length - 1];
      shown[shown.length - 1] =
        last.length > 1 ? last.slice(0, last.length - 1) + "…" : "…";
    }
    shown.forEach((line, i) => {
      const t = svgEl("text", {
        x: 12,
        y: 22 + i * lineH,
        "font-size": "12",
        fill: textColor,
      });
      t.textContent = line || " ";
      g.append(t);
    });
  }
  g.append(
    svgEl("path", {
      d: `M ${w - 14} ${h - 5} H ${w - 5} V ${h - 14}`,
      fill: "none",
      stroke: textColor,
      "stroke-width": 1.2,
      opacity: 0.4,
      "stroke-linecap": "round",
      "pointer-events": "none",
    }),
  );
  if (solo) {
    const btn = svgEl("g", {
      class: "note-copy",
      transform: `translate(${Math.max(8, w - 40)},6)`,
    });
    btn.dataset.noteCopy = n.id;
    const tip = svgEl("title");
    tip.textContent = "Copy note";
    btn.append(tip);
    btn.append(
      svgEl("rect", {
        width: 20,
        height: 20,
        rx: 5,
        class: "note-copy-bg",
      }),
    );
    btn.append(
      svgEl("rect", {
        x: 5,
        y: 7,
        width: 8,
        height: 9,
        rx: 1.2,
        fill: "none",
        stroke: "#212529",
        "stroke-width": 1.3,
      }),
    );
    btn.append(
      svgEl("rect", {
        x: 8,
        y: 4.5,
        width: 8,
        height: 9,
        rx: 1.2,
        fill: "#fff",
        stroke: "#212529",
        "stroke-width": 1.3,
      }),
    );
    g.append(btn);
  }
  const rh = svgEl("rect", {
    x: w - 16,
    y: h - 16,
    width: 20,
    height: 20,
    class: "note-resize",
  });
  rh.dataset.noteResize = n.id;
  g.append(rh);
  return g;
}

var renderQueued = false;
/**
 * Coalesce redraws onto the next animation frame.
 * @returns {void}
 */
function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    render();
  });
}

/**
 * Redraw the canvas, explorer, SQL preview, and status bar.
 * @returns {void}
 */
function render() {
  applyViewBox();
  while (svg.firstChild) svg.removeChild(svg.firstChild);

  // defs: grid pattern
  const defs = svgEl("defs");
  const pat = svgEl("pattern", {
    id: "grid",
    width: GRID,
    height: GRID,
    patternUnits: "userSpaceOnUse",
  });
  pat.append(
    svgEl("path", {
      d: `M ${GRID} 0 H 0 V ${GRID}`,
      fill: "none",
      stroke: "var(--grid)",
      "stroke-width": 1,
    }),
  );
  defs.append(pat);
  svg.append(defs);

  // Background and grid cover whatever part of the plane is on screen.
  svg.append(svgEl("rect", { id: "canvasSheet", fill: "var(--canvas-bg)" }));
  svg.append(svgEl("rect", { id: "canvasGrid", fill: "url(#grid)" }));
  placeCanvasSurface();

  const relLayer = svgEl("g");
  for (const r of state.relationships) {
    const g = buildRelationship(r);
    if (g) relLayer.append(g);
  }
  svg.append(relLayer);

  const tblLayer = svgEl("g");
  const names = Object.keys(state.tables).sort();
  const picked = selectedTableNames();
  for (const name of names) {
    if (picked.indexOf(name) !== -1) continue;
    tblLayer.append(buildTable(state.tables[name]));
  }
  for (const name of picked) tblLayer.append(buildTable(state.tables[name]));
  svg.append(tblLayer);

  const noteLayer = svgEl("g");
  const notes = state.canvasNotes || [];
  const pickedNotes = selectedNoteIds();
  for (const n of notes) {
    if (pickedNotes.indexOf(n.id) !== -1) continue;
    noteLayer.append(buildNote(n));
  }
  for (const id of pickedNotes) {
    const selectedNote = notes.find((n) => n.id === id);
    if (selectedNote) noteLayer.append(buildNote(selectedNote));
  }
  svg.append(noteLayer);

  if (drag && drag.mode === "marquee") {
    const box = selectionRect(drag.x0, drag.y0, drag.x1, drag.y1);
    svg.append(
      svgEl("rect", {
        class: "marquee",
        x: box.x,
        y: box.y,
        width: box.w,
        height: box.h,
        "vector-effect": "non-scaling-stroke",
      }),
    );
  }

  $("emptyHint").style.display = names.length || notes.length ? "none" : "flex";
  renderExplorer();
  renderSQL();
  renderStatus();
  $("btnUndo").disabled = !undoStack.length;
  $("btnRedo").disabled = !redoStack.length;
}

/**
 * Rebuild the diagram explorer tree.
 * @returns {void}
 */
function renderExplorer() {
  const root = $("explorer");
  root.textContent = "";
  const names = Object.keys(state.tables).sort();

  const gT = el("div", { class: "tree-group" });
  gT.append(el("div", { class: "tree-title" }, `Tables (${names.length})`));
  if (!names.length)
    gT.append(el("div", { class: "tree-empty" }, "No tables yet"));
  for (const name of names) {
    const t = state.tables[name];
    const selCls = isTableSelected(name) ? " selected" : "";
    const item = el("div", {
      class: "tree-item" + selCls,
      onclick: () => {
        sel = { kind: "table", name };
        centerOn(t);
        render();
      },
      ondblclick: () => openTableDialog(name),
      title: (t.comment || "").trim()
        ? name + "\n" + t.comment.trim()
        : name,
    });
    item.append(
      el("span", {
        class: "swatch",
        style: `background:${t.headerColor || defaultHeaderColor()}`,
      }),
      name,
    );
    gT.append(item);
    for (const c of t.columns) {
      const col = el("div", {
        class: "tree-col",
        title: `${c.name}: ${c.dataType}`,
      });
      if (c.isPk) col.append(el("span", { class: "badge pk" }, "PK"));
      if (c.isFk) col.append(el("span", { class: "badge fk" }, "FK"));
      col.append(
        `${c.name} `,
        el("span", { class: "muted" }, `· ${c.dataType}`),
      );
      gT.append(col);
    }
  }
  root.append(gT);

  const canvasNotes = state.canvasNotes || [];
  const gN = el("div", { class: "tree-group" });
  gN.append(
    el("div", { class: "tree-title" }, `Notes (${canvasNotes.length})`),
  );
  if (!canvasNotes.length)
    gN.append(el("div", { class: "tree-empty" }, "No notes yet"));
  for (const n of canvasNotes) {
    const label = (n.text || "").trim().split("\n")[0] || "(empty note)";
    const selCls = isNoteSelected(n.id) ? " selected" : "";
    const item = el("div", {
      class: "tree-item" + selCls,
      onclick: () => {
        sel = { kind: "note", id: n.id };
        centerOnRect(n.x, n.y, n.width, n.height);
        render();
      },
      ondblclick: () => openNoteDialog(n),
      title: (n.text || "").trim() || "Empty note",
    });
    item.append(
      el("span", {
        class: "swatch",
        style: `background:${n.color || DEFAULT_NOTE_COLOR}`,
      }),
      truncate(label, 32),
    );
    gN.append(item);
  }
  root.append(gN);

  const gR = el("div", { class: "tree-group" });
  gR.append(
    el(
      "div",
      { class: "tree-title" },
      `Relationships (${state.relationships.length})`,
    ),
  );
  if (!state.relationships.length)
    gR.append(el("div", { class: "tree-empty" }, "No relationships yet"));
  for (const r of state.relationships) {
    const key = relKey(r);
    const selCls =
      sel && sel.kind === "rel" && sel.key === key ? " selected" : "";
    const item = el(
      "div",
      {
        class: "tree-item" + selCls,
        onclick: () => {
          sel = { kind: "rel", key };
          render();
        },
        ondblclick: () => openRelationshipDialog(r),
        title: `${r.table1}.${r.fkCol} → ${r.table2}.${r.pkCol} (${r.type})`,
      },
      `${r.table1}.${r.fkCol} → ${r.table2}.${r.pkCol}`,
    );
    gR.append(item);
  }
  root.append(gR);
}

/**
 * Refresh the SQL preview pane.
 * @returns {void}
 */
function renderSQL() {
  $("sqlOut").textContent = generateSQL(state) || "-- Empty diagram";
}

/**
 * Refresh the status bar and the document title.
 * @returns {void}
 */
function renderStatus() {
  $("statusFile").textContent =
    (fileName || "Untitled") + (isDirty() ? " •" : "");
  const nT = Object.keys(state.tables).length;
  const nN = (state.canvasNotes || []).length;
  const nR = state.relationships.length;
  $("statusCounts").textContent =
    `${nT} table${nT === 1 ? "" : "s"} · ${nR} relationship${nR === 1 ? "" : "s"} · ${nN} note${nN === 1 ? "" : "s"}`;
  document.title = `${fileName || "Untitled"}${isDirty() ? " •" : ""} — simplERD`;
}

/**
 * Sync the notes panel from the diagram, then redraw and autosave.
 * @returns {void}
 */
function update() {
  var area = $("notesArea");
  if (area && area.value !== (state.notes || ""))
    area.value = state.notes || "";
  render();
  autosave();
}

/**
 * Pan the view so a rectangle sits in the middle of the canvas.
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @returns {void}
 */
function centerOnRect(x, y, w, h) {
  const wrap = $("canvasWrap");
  view.x = x + w / 2 - wrap.clientWidth / view.zoom / 2;
  view.y = y + h / 2 - wrap.clientHeight / view.zoom / 2;
}

/**
 * Pan the view so a table sits in the middle of the canvas.
 * @param {Table} t
 * @returns {void}
 */
function centerOn(t) {
  centerOnRect(t.x, t.y, t.width, tblHeight(t));
}

/**
 * Zoom and pan so every table and note is visible.
 * @returns {void}
 */
function fitToContent() {
  const boxes = [];
  for (const t of Object.values(state.tables))
    boxes.push({ x: t.x, y: t.y, w: t.width, h: tblHeight(t) });
  for (const n of state.canvasNotes || [])
    boxes.push({ x: n.x, y: n.y, w: n.width, h: n.height });
  const wrap = $("canvasWrap");
  if (!boxes.length) {
    view = { x: 0, y: 0, zoom: 1 };
    applyViewBox();
    return;
  }
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const b of boxes) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }
  const pad = 70;
  minX -= pad;
  minY -= pad;
  maxX += pad;
  maxY += pad;
  const z = clamp(
    Math.min(
      wrap.clientWidth / (maxX - minX),
      wrap.clientHeight / (maxY - minY),
    ),
    0.1,
    2,
  );
  view.zoom = z;
  view.x = (minX + maxX) / 2 - wrap.clientWidth / z / 2;
  view.y = (minY + maxY) / 2 - wrap.clientHeight / z / 2;
  applyViewBox();
}
