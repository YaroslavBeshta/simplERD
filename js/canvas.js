/**
 * @file Pointer, keyboard, and context-menu interaction on the canvas.
 */
"use strict";

var drag = null; // {mode, ...}

/*
 * Double-clicks are detected manually from two nearby pointerdowns.
 * The native dblclick event is unreliable here: selection re-renders the SVG
 * between the two clicks, and pointer capture retargets events — several
 * browsers then never fire dblclick at all.
 */
var lastDown = { t: 0, x: 0, y: 0 };
/**
 * Edit the item under the pointer, or start a new table on empty canvas.
 * @param {PointerEvent} e
 * @returns {void}
 */
function handleCanvasDoubleClick(e) {
  const target = e.target;
  const noteEl = target.closest ? target.closest("[data-note]") : null;
  const tblEl = target.closest ? target.closest("[data-t]") : null;
  const relEl = target.closest ? target.closest("[data-rel]") : null;
  if (noteEl) {
    const n = findNote(noteEl.dataset.note);
    if (n) openNoteDialog(n);
    return;
  }
  if (tblEl) {
    openTableDialog(tblEl.dataset.t);
    return;
  }
  if (relEl) {
    const r = state.relationships.find((r) => relKey(r) === relEl.dataset.rel);
    if (r) openRelationshipDialog(r);
    return;
  }
  openTableDialog(null, sceneFromClient(e.clientX, e.clientY));
}

svg.addEventListener("pointerdown", (e) => {
  if (e.button === 2) return; // context menu handled separately
  hideCtxMenu();

  if (e.button === 0) {
    const now = Date.now();
    const isDouble =
      now - lastDown.t < 500 &&
      Math.abs(e.clientX - lastDown.x) < 8 &&
      Math.abs(e.clientY - lastDown.y) < 8;
    lastDown = { t: now, x: e.clientX, y: e.clientY };
    if (isDouble) {
      lastDown.t = 0; // a triple click must not fire again
      drag = null;
      handleCanvasDoubleClick(e);
      return;
    }
  }

  const pt = sceneFromClient(e.clientX, e.clientY);

  const resizeEl = e.target.closest("[data-resize]");
  const noteResizeEl = e.target.closest("[data-note-resize]");
  const noteEl = e.target.closest("[data-note]");
  const vsegEl = e.target.closest("[data-vseg]");
  const relEl = e.target.closest("[data-rel]");
  const tblEl = e.target.closest("[data-t]");

  if (resizeEl) {
    const t = state.tables[resizeEl.dataset.resize];
    if (!t) return;
    drag = { mode: "resize", t, startW: t.width, startX: pt.x, moved: false };
    sel = { kind: "table", name: t.name };
    scheduleRender();
  } else if (noteResizeEl) {
    const n = findNote(noteResizeEl.dataset.noteResize);
    if (!n) return;
    drag = {
      mode: "note-resize",
      n,
      startW: n.width,
      startH: n.height,
      startX: pt.x,
      startY: pt.y,
      moved: false,
    };
    sel = { kind: "note", id: n.id };
    scheduleRender();
  } else if (noteEl) {
    const n = findNote(noteEl.dataset.note);
    if (!n) return;
    sel = { kind: "note", id: n.id };
    drag = {
      mode: "note-move",
      n,
      offX: pt.x - n.x,
      offY: pt.y - n.y,
      moved: false,
    };
    scheduleRender();
  } else if (vsegEl) {
    const r = state.relationships.find(
      (r) => relKey(r) === vsegEl.dataset.vseg,
    );
    if (!r) return;
    drag = { mode: "vseg", r, startX: pt.x, orig: r.verticalX, moved: false };
    sel = { kind: "rel", key: relKey(r) };
    scheduleRender();
  } else if (tblEl) {
    const t = state.tables[tblEl.dataset.t];
    if (!t) return;
    sel = { kind: "table", name: t.name };
    drag = {
      mode: "move",
      t,
      offX: pt.x - t.x,
      offY: pt.y - t.y,
      moved: false,
    };
    scheduleRender();
  } else if (relEl) {
    const r = state.relationships.find((r) => relKey(r) === relEl.dataset.rel);
    if (r) {
      sel = { kind: "rel", key: relKey(r) };
      scheduleRender();
    }
  } else {
    if (e.button === 0 || e.button === 1) {
      sel = null;
      drag = {
        mode: "pan",
        startClientX: e.clientX,
        startClientY: e.clientY,
        startVX: view.x,
        startVY: view.y,
      };
      scheduleRender();
    }
  }
  if (drag) svg.setPointerCapture(e.pointerId);
});

svg.addEventListener("pointermove", (e) => {
  if (!drag) return;
  const pt = sceneFromClient(e.clientX, e.clientY);
  if (drag.mode === "pan") {
    view.x = drag.startVX - (e.clientX - drag.startClientX) / view.zoom;
    view.y = drag.startVY - (e.clientY - drag.startClientY) / view.zoom;
    applyViewBox();
    return;
  }
  if (drag.mode === "move") {
    if (!drag.moved) {
      pushUndo();
      drag.moved = true;
    }
    drag.t.x = snap(pt.x - drag.offX);
    drag.t.y = snap(pt.y - drag.offY);
    scheduleRender();
  } else if (drag.mode === "resize") {
    if (!drag.moved) {
      pushUndo();
      drag.moved = true;
    }
    drag.t.width = Math.max(
      MIN_TABLE_WIDTH,
      snap(drag.startW + (pt.x - drag.startX)),
    );
    scheduleRender();
  } else if (drag.mode === "note-move") {
    if (!drag.moved) {
      pushUndo();
      drag.moved = true;
    }
    drag.n.x = snap(pt.x - drag.offX);
    drag.n.y = snap(pt.y - drag.offY);
    scheduleRender();
  } else if (drag.mode === "note-resize") {
    if (!drag.moved) {
      pushUndo();
      drag.moved = true;
    }
    drag.n.width = Math.max(
      MIN_NOTE_W,
      snap(drag.startW + (pt.x - drag.startX)),
    );
    drag.n.height = Math.max(
      MIN_NOTE_H,
      snap(drag.startH + (pt.y - drag.startY)),
    );
    scheduleRender();
  } else if (drag.mode === "vseg") {
    if (!drag.moved) {
      pushUndo();
      drag.moved = true;
    }
    drag.r.verticalX = Math.round(pt.x);
    scheduleRender();
  }
});

svg.addEventListener("pointerup", (e) => {
  if (drag && drag.moved) autosave();
  if (
    drag &&
    !drag.moved &&
    (drag.mode === "move" ||
      drag.mode === "resize" ||
      drag.mode === "vseg" ||
      drag.mode === "note-move" ||
      drag.mode === "note-resize")
  ) {
    // no-op click: nothing was pushed to undo
  }
  drag = null;
  try {
    svg.releasePointerCapture(e.pointerId);
  } catch (err) {}
  scheduleRender();
});

svg.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const rect = svg.getBoundingClientRect();
    const mx = e.clientX - rect.left,
      my = e.clientY - rect.top;
    const sceneX = view.x + mx / view.zoom,
      sceneY = view.y + my / view.zoom;
    const factor = Math.pow(1.0015, -e.deltaY);
    view.zoom = clamp(view.zoom * factor, 0.08, 4);
    view.x = sceneX - mx / view.zoom;
    view.y = sceneY - my / view.zoom;
    applyViewBox();
  },
  { passive: false },
);

/* ------------------------------ Context menu ---------------------------- */
var ctxMenu = $("ctxMenu");
/**
 * @param {number} x Viewport X.
 * @param {number} y Viewport Y.
 * @param {Array<object|string>} items Menu entries, or `"-"` for a separator.
 * @returns {void}
 */
function showCtxMenu(x, y, items) {
  ctxMenu.textContent = "";
  for (const it of items) {
    if (it === "-") {
      ctxMenu.append(el("div", { class: "msep" }));
      continue;
    }
    ctxMenu.append(
      el(
        "div",
        {
          class:
            "mi" +
            (it.danger ? " danger" : "") +
            (it.disabled ? " disabled" : ""),
          onclick: () => {
            hideCtxMenu();
            it.onClick();
          },
        },
        it.label,
      ),
    );
  }
  ctxMenu.style.display = "block";
  const mw = ctxMenu.offsetWidth,
    mh = ctxMenu.offsetHeight;
  ctxMenu.style.left = Math.min(x, window.innerWidth - mw - 8) + "px";
  ctxMenu.style.top = Math.min(y, window.innerHeight - mh - 8) + "px";
}

/**
 * @returns {void}
 */
function hideCtxMenu() {
  ctxMenu.style.display = "none";
}
document.addEventListener("pointerdown", (e) => {
  if (!ctxMenu.contains(e.target)) hideCtxMenu();
});

svg.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  const pt = sceneFromClient(e.clientX, e.clientY);
  const noteEl = e.target.closest("[data-note]");
  const tblEl = e.target.closest("[data-t]");
  const relEl = e.target.closest("[data-rel]");
  if (noteEl) {
    const n = findNote(noteEl.dataset.note);
    if (!n) return;
    sel = { kind: "note", id: n.id };
    scheduleRender();
    showCtxMenu(e.clientX, e.clientY, [
      { label: "Edit Note…", onClick: () => openNoteDialog(n) },
      "-",
      { label: "Delete Note", danger: true, onClick: () => deleteNote(n.id) },
    ]);
  } else if (tblEl) {
    const name = tblEl.dataset.t;
    sel = { kind: "table", name };
    scheduleRender();
    showCtxMenu(e.clientX, e.clientY, [
      { label: "Edit Table…", onClick: () => openTableDialog(name) },
      {
        label: "Copy",
        onClick: () => {
          sel = { kind: "table", name };
          copySelectedTable();
        },
      },
      "-",
      { label: "Delete Table", danger: true, onClick: () => deleteTable(name) },
    ]);
  } else if (relEl) {
    const key = relEl.dataset.rel;
    const r = state.relationships.find((r) => relKey(r) === key);
    if (!r) return;
    sel = { kind: "rel", key };
    scheduleRender();
    showCtxMenu(e.clientX, e.clientY, [
      { label: "Edit Relationship…", onClick: () => openRelationshipDialog(r) },
      {
        label: "Reset Routing",
        disabled: r.verticalX == null,
        onClick: () => {
          pushUndo();
          r.verticalX = null;
          update();
        },
      },
      "-",
      {
        label: "Delete Relationship",
        danger: true,
        onClick: () => deleteRelationship(key),
      },
    ]);
  } else {
    showCtxMenu(e.clientX, e.clientY, [
      { label: "Add Table Here…", onClick: () => openTableDialog(null, pt) },
      { label: "Add Note Here…", onClick: () => openNoteDialog(null, pt) },
      {
        label: "Add Relationship…",
        onClick: () => openRelationshipDialog(null),
      },
      {
        label: "Paste Table",
        disabled: !clipboard,
        onClick: () => pasteTable(pt),
      },
      "-",
      { label: "Zoom to Fit", onClick: fitToContent },
    ]);
  }
});

/* --------------------------- Drag & drop files --------------------------- */
var wrap = $("canvasWrap");
wrap.addEventListener("dragover", (e) => {
  e.preventDefault();
});
wrap.addEventListener("drop", async (e) => {
  e.preventDefault();
  const f = e.dataTransfer.files && e.dataTransfer.files[0];
  if (!f) return;
  if (!(await ensureSavedThen())) return;
  const text = await f.text();
  if (/\.sql$/i.test(f.name)) loadSQLFromText(text, f.name);
  else loadERDFromText(text, f.name);
});

/* ------------------------------ Keyboard -------------------------------- */
document.addEventListener("keydown", (e) => {
  const inInput =
    /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) ||
    e.target.isContentEditable;
  if (e.key === "Escape") {
    if (modalIsOpen()) {
      closeModal();
      return;
    }
    hideCtxMenu();
    sel = null;
    scheduleRender();
    return;
  }
  if (modalIsOpen() || inInput) return;

  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) {
    e.preventDefault();
    undo();
    return;
  }
  if (
    mod &&
    (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))
  ) {
    e.preventDefault();
    redo();
    return;
  }
  if (mod && e.key.toLowerCase() === "s") {
    e.preventDefault();
    saveFile(e.shiftKey);
    return;
  }
  if (mod && e.key.toLowerCase() === "o") {
    e.preventDefault();
    openERDFile();
    return;
  }
  if (mod && e.key.toLowerCase() === "c") {
    copySelectedTable();
    return;
  }
  if (mod && e.key.toLowerCase() === "v") {
    pasteTable();
    return;
  }
  if (mod && e.altKey && e.key.toLowerCase() === "n") {
    e.preventDefault();
    newDiagram();
    return;
  }
  if (e.key === "Delete" || e.key === "Backspace") {
    if (sel && sel.kind === "table") deleteTable(sel.name);
    else if (sel && sel.kind === "rel") deleteRelationship(sel.key);
    else if (sel && sel.kind === "note") deleteNote(sel.id);
    return;
  }
  if (!mod && e.key.toLowerCase() === "t") {
    openTableDialog(null, viewportCenter());
    return;
  }
  if (!mod && e.key.toLowerCase() === "r") {
    openRelationshipDialog(null);
    return;
  }
  if (!mod && e.key.toLowerCase() === "n") {
    openNoteDialog(null, viewportCenterNote());
    return;
  }
  if (!mod && e.key.toLowerCase() === "f") {
    fitToContent();
    return;
  }
});

/**
 * Scene position that places a new table in the middle of the viewport.
 * @returns {{x:number, y:number}}
 */
function viewportCenter() {
  return {
    x: view.x + wrap.clientWidth / view.zoom / 2 - DEFAULT_TABLE_WIDTH / 2,
    y: view.y + wrap.clientHeight / view.zoom / 2 - 60,
  };
}
