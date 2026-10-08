/**
 * @file Toolbar, theme, side panels, and application startup.
 */
"use strict";

var ICONS = {
  new: '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M12 12v6M9 15h6"/></svg>',
  open: '<svg viewBox="0 0 24 24"><path d="M4 20h15a1 1 0 0 0 1-.76L22 11H6.5a1 1 0 0 0-.97.76L4 18V5a1 1 0 0 1 1-1h5l2 3h8a1 1 0 0 1 1 1v3"/></svg>',
  save: '<svg viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/></svg>',
  saveAs:
    '<svg viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M7 3v5h8"/><path d="M9 15l3 3 5-6"/></svg>',
  importSQL:
    '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5"/><path d="M12 10v6m0 0-2.5-2.5M12 16l2.5-2.5"/></svg>',
  exportSQL:
    '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5"/><path d="M12 16v-6m0 0-2.5 2.5M12 10l2.5 2.5"/></svg>',
  undo: '<svg viewBox="0 0 24 24"><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>',
  redo: '<svg viewBox="0 0 24 24"><path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/></svg>',
  table:
    '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 10v10"/></svg>',
  rel: '<svg viewBox="0 0 24 24"><rect x="2" y="3" width="8" height="6" rx="1.5"/><rect x="14" y="15" width="8" height="6" rx="1.5"/><path d="M6 9v9h8"/></svg>',
  note: '<svg viewBox="0 0 24 24"><path d="M15 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M15 3v5h5M8 13h8M8 17h5"/></svg>',
  zoomOut:
    '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35M8 11h6"/></svg>',
  zoomIn:
    '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35M11 8v6M8 11h6"/></svg>',
  zoomReset:
    '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35M11 8v6"/></svg>',
  fit: '<svg viewBox="0 0 24 24"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>',
  panels:
    '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15 4v16"/></svg>',
  theme:
    '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>',
  settings:
    '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  help: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01"/></svg>',
  share:
    '<svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.59 13.51 6.83 3.98M15.41 6.51l-6.82 3.98"/></svg>',
};
/**
 * Fill a toolbar button with an icon and an optional label.
 * @param {string} id
 * @param {string} icon Key in {@link ICONS}.
 * @param {string} [label]
 * @returns {void}
 */
function setBtn(id, icon, label) {
  const b = $(id);
  b.innerHTML = ICONS[icon] + (label ? `<span>${label}</span>` : "");
}
setBtn("btnNew", "new");
setBtn("btnOpen", "open");
setBtn("btnSave", "save");
setBtn("btnSaveAs", "saveAs");
setBtn("btnShare", "share", "Share");
setBtn("btnImportSQL", "importSQL", "Import SQL");
setBtn("btnExportSQL", "exportSQL", "Export SQL");
setBtn("btnUndo", "undo");
setBtn("btnRedo", "redo");
setBtn("btnAddTable", "table", "Table");
setBtn("btnAddRel", "rel", "Relationship");
setBtn("btnAddNote", "note", "Note");
setBtn("btnZoomOut", "zoomOut");
setBtn("btnZoomIn", "zoomIn");
setBtn("btnZoomReset", "zoomReset");
setBtn("btnZoomFit", "fit");
setBtn("btnPanels", "panels");
setBtn("btnTheme", "theme");
setBtn("btnSettings", "settings");
setBtn("btnHelp", "help");

$("btnNew").onclick = newDiagram;
$("btnOpen").onclick = openERDFile;
$("btnSave").onclick = () => saveFile(false);
$("btnSaveAs").onclick = () => saveFile(true);
$("btnShare").onclick = shareDiagram;
$("btnImportSQL").onclick = openSQLFile;
$("btnExportSQL").onclick = exportSQLFile;
$("btnUndo").onclick = undo;
$("btnRedo").onclick = redo;
$("btnAddTable").onclick = () => openTableDialog(null, viewportCenter());
$("btnAddRel").onclick = () => openRelationshipDialog(null);
$("btnAddNote").onclick = () => openNoteDialog(null, viewportCenterNote());
$("btnZoomIn").onclick = () => zoomBy(1.25);
$("btnZoomOut").onclick = () => zoomBy(1 / 1.25);
$("btnZoomReset").onclick = resetZoom;
$("btnZoomFit").onclick = fitToContent;
$("btnPanels").onclick = () => {
  const hidden = $("explorerPanel").classList.toggle("collapsed");
  $("rightPanel").classList.toggle("collapsed", hidden);
  applyViewBox();
};
$("btnTheme").onclick = () =>
  setTheme(prefs.theme === "light" ? "dark" : "light");
$("btnSettings").onclick = openSettingsDialog;
$("btnHelp").onclick = openHelpDialog;
/* Floating action button */
var fab = $("fab");
$("fabMain").onclick = (e) => {
  e.stopPropagation();
  fab.classList.toggle("open");
};
$("fabAddTable").onclick = () => {
  fab.classList.remove("open");
  openTableDialog(null, viewportCenter());
};
$("fabAddRel").onclick = () => {
  fab.classList.remove("open");
  openRelationshipDialog(null);
};
$("fabAddNote").onclick = () => {
  fab.classList.remove("open");
  openNoteDialog(null, viewportCenterNote());
};
svg.addEventListener("pointerdown", () => fab.classList.remove("open"));

$("btnCopySQL").onclick = async () => {
  try {
    await navigator.clipboard.writeText(generateSQL(state));
    toast("SQL copied to clipboard");
  } catch (e) {
    toast("Copy failed — select the text manually");
  }
};

/**
 * Zoom around the center of the canvas.
 * @param {number} f Factor above 1 zooms in.
 * @returns {void}
 */
function zoomBy(f) {
  const cx = wrap.clientWidth / 2,
    cy = wrap.clientHeight / 2;
  const sceneX = view.x + cx / view.zoom,
    sceneY = view.y + cy / view.zoom;
  view.zoom = clamp(view.zoom * f, 0.08, 4);
  view.x = sceneX - cx / view.zoom;
  view.y = sceneY - cy / view.zoom;
  applyViewBox();
}

/**
 * Set zoom to 100%, keeping the center of the view in place.
 * @returns {void}
 */
function resetZoom() {
  if (view.zoom === 1) return;
  zoomBy(1 / view.zoom);
}

/**
 * Apply the light or dark theme and remember it.
 * @param {"light"|"dark"} theme
 * @returns {void}
 */
function setTheme(theme) {
  prefs.theme = theme;
  document.documentElement.dataset.theme = theme;
  const btn = $("btnTheme");
  btn.innerHTML =
    theme === "light"
      ? '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>'
      : ICONS.theme;
  savePrefs();
  scheduleRender();
}

/* Tabs */
for (const tab of document.querySelectorAll(".tab")) {
  tab.addEventListener("click", () => {
    document
      .querySelectorAll(".tab")
      .forEach((t) => t.classList.toggle("active", t === tab));
    document
      .querySelectorAll(".tab-page")
      .forEach((p) =>
        p.classList.toggle("active", p.dataset.page === tab.dataset.tab),
      );
  });
}

/* Notes */
var notesArea = $("notesArea");
var notesUndoPushed = false;
notesArea.addEventListener("focus", () => {
  notesUndoPushed = false;
});
notesArea.addEventListener("input", () => {
  if (!notesUndoPushed) {
    pushUndo();
    notesUndoPushed = true;
  }
  state.notes = notesArea.value;
  renderStatus();
  autosave();
});

/* File inputs (fallback pickers) */
$("fileInputERD").addEventListener("change", async (e) => {
  const f = e.target.files[0];
  e.target.value = "";
  if (!f) return;
  fileHandle = null;
  loadERDFromText(await f.text(), f.name);
});
$("fileInputSQL").addEventListener("change", async (e) => {
  const f = e.target.files[0];
  e.target.value = "";
  if (!f) return;
  loadSQLFromText(await f.text(), f.name);
});

window.addEventListener("resize", applyViewBox);
window.addEventListener("beforeunload", (e) => {
  autosave();
  if (isDirty()) {
    e.preventDefault();
    e.returnValue = "";
  }
});

/**
 * Restore an autosaved diagram, or draw the empty canvas.
 * @returns {void}
 */
function restoreSession() {
  const saved = storedAutosave();
  if (saved) {
    state = Object.assign(newState(), saved.state);
    if (!Array.isArray(state.canvasNotes)) state.canvasNotes = [];
    if (typeof state.notes !== "string") state.notes = "";
    fileName = saved.fileName || null;
    savedSnapshot = ""; // restored autosave counts as unsaved work
    update();
    fitToContent();
    toast("Restored unsaved work from your last session");
    return;
  }
  savedSnapshot = JSON.stringify(state);
  update();
}

/**
 * Restore preferences, a shared diagram from the URL, or the last autosave.
 * @returns {Promise<void>}
 */
async function init() {
  console.log("simplERD v" + APP_VERSION);
  loadPrefs();
  setTheme(prefs.theme);
  if (await openShareFromLocation(true)) return;
  restoreSession();
}

window.addEventListener("hashchange", () => {
  if (currentSharePayload()) openShareFromLocation(false);
});

init();
