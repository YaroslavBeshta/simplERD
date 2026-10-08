/**
 * @file Canvas notes: create, edit, and delete sticky notes on the diagram.
 */
"use strict";

/**
 * @param {string} id
 * @returns {CanvasNote|undefined}
 */
function findNote(id) {
  return (state.canvasNotes || []).find((n) => n.id === id);
}

/**
 * @returns {string} An id that is not already used by a canvas note.
 */
function newNoteId() {
  const ids = new Set((state.canvasNotes || []).map((n) => n.id));
  let i = 1;
  while (ids.has("n" + i)) i++;
  return "n" + i;
}

/**
 * @param {string} id
 * @returns {void}
 */
/**
 * Copy a canvas note's text to the clipboard.
 * @param {CanvasNote} n
 * @returns {Promise<void>}
 */
async function copyNoteText(n) {
  const text = n && n.text ? String(n.text) : "";
  if (!text.trim()) {
    toast("Note is empty");
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    toast("Note copied");
  } catch (e) {
    toast("Copy failed — select the text manually");
  }
}

function deleteNote(id) {
  if (!findNote(id)) return;
  pushUndo();
  state.canvasNotes = state.canvasNotes.filter((n) => n.id !== id);
  if (sel && sel.kind === "note" && sel.id === id) sel = null;
  update();
  toast("Note deleted");
}

/**
 * Scene position that places a new note in the middle of the viewport.
 * @returns {{x:number, y:number}}
 */
function viewportCenterNote() {
  const wrap = $("canvasWrap");
  return {
    x: view.x + wrap.clientWidth / view.zoom / 2 - DEFAULT_NOTE_W / 2,
    y: view.y + wrap.clientHeight / view.zoom / 2 - DEFAULT_NOTE_H / 2,
  };
}

/**
 * Open the editor for a canvas note, or create one when `existing` is omitted.
 * @param {CanvasNote|null} existing
 * @param {{x:number, y:number}} [pos] Drop position for a new note.
 * @returns {void}
 */
function openNoteDialog(existing, pos) {
  if (!Array.isArray(state.canvasNotes)) state.canvasNotes = [];
  const textIn = el("textarea", {
    rows: "6",
    style: "width:100%; line-height:1.45",
    placeholder: "Write a note…",
  });
  textIn.value = existing ? existing.text || "" : "";
  let color = toHex6(
    existing ? existing.color || DEFAULT_NOTE_COLOR : DEFAULT_NOTE_COLOR,
  );
  const colorIn = el("input", { type: "color", value: color });
  const swatches = el("div", {
    style: "display:flex; gap:6px; align-items:center",
  });
  function paintSwatches() {
    swatches.textContent = "";
    for (const c of NOTE_COLORS) {
      swatches.append(
        el("button", {
          type: "button",
          title: c,
          style: `width:22px;height:22px;border-radius:6px;padding:0;cursor:pointer;background:${c};border:2px solid ${color === c ? "var(--accent)" : "var(--border)"}`,
          onclick: () => {
            color = c;
            colorIn.value = c;
            paintSwatches();
          },
        }),
      );
    }
  }
  colorIn.addEventListener("input", () => {
    color = colorIn.value.toLowerCase();
    paintSwatches();
  });
  paintSwatches();

  function submit() {
    pushUndo();
    const chosen = colorIn.value.toLowerCase();
    if (existing) {
      existing.text = textIn.value;
      existing.color = chosen;
      sel = { kind: "note", id: existing.id };
    } else {
      const p = pos || viewportCenterNote();
      const n = {
        id: newNoteId(),
        x: snap(p.x),
        y: snap(p.y),
        width: DEFAULT_NOTE_W,
        height: DEFAULT_NOTE_H,
        color: chosen,
        text: textIn.value,
      };
      state.canvasNotes.push(n);
      sel = { kind: "note", id: n.id };
    }
    closeModal();
    update();
    toast(existing ? "Note updated" : "Note added");
  }

  openModal({
    title: existing ? "Edit Note" : "Add Note",
    narrow: true,
    body: el(
      "div",
      {},
      el(
        "div",
        { class: "form-row", style: "align-items:flex-start" },
        el("label", { style: "width:64px; padding-top:6px" }, "Text"),
        textIn,
      ),
      el(
        "div",
        { class: "form-row" },
        el("label", { style: "width:64px" }, "Color"),
        swatches,
        colorIn,
      ),
    ),
    buttons: [
      { label: "Cancel", onClick: closeModal },
      { label: existing ? "Apply" : "Add", cls: "primary", onClick: submit },
    ],
  });
}
