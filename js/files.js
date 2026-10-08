/**
 * @file Open, save, and import JSON diagrams and `.sql` files.
 */
"use strict";

/**
 * Trigger a browser download for a text file.
 * @param {string} name
 * @param {string} text
 * @param {string} [mime]
 * @returns {void}
 */
function downloadFile(name, text, mime) {
  const blob = new Blob([text], { type: mime || "text/plain;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/**
 * Write the diagram to the current file, or prompt when there is no handle.
 * @param {boolean} forcePicker Always show the save picker.
 * @returns {Promise<boolean>} False when the user cancels the picker.
 */
async function saveFile(forcePicker) {
  const text = exportDiagramText(state);
  const suggested = fileName || "diagram.json";
  if (window.showSaveFilePicker) {
    try {
      if (!fileHandle || forcePicker) {
        fileHandle = await window.showSaveFilePicker({
          suggestedName: suggested,
          types: [
            { description: "simplERD diagram", accept: { "application/json": [".json"] } },
          ],
        });
      }
      const w = await fileHandle.createWritable();
      await w.write(text);
      await w.close();
      fileName = fileHandle.name;
    } catch (e) {
      if (e && e.name === "AbortError") return false;
      downloadFile(suggested, text, "application/json;charset=utf-8");
      fileName = suggested;
    }
  } else {
    downloadFile(suggested, text, "application/json;charset=utf-8");
    fileName = suggested;
  }
  savedSnapshot = JSON.stringify(state);
  update();
  toast(`Saved ${fileName}`);
  return true;
}

/**
 * Replace the open diagram with a parsed JSON file.
 * A legacy CSV `.erd` file is loaded too, but it is not kept as the save target.
 * @param {string} text
 * @param {string} [name] Display file name.
 * @param {FileSystemFileHandle|null} [handle] Write handle when the file is JSON.
 * @param {string} [toastMessage] Replaces the default "Imported" toast. A failed share load uses a share-specific error.
 * @returns {boolean} False when the text is not a diagram.
 */
function loadERDFromText(text, name, handle, toastMessage) {
  try {
    const trimmed = String(text == null ? "" : text).replace(/^\uFEFF/, "").trim();
    const json = trimmed.startsWith("{");
    const st = importDiagramText(text);
    undoStack.length = 0;
    redoStack.length = 0;
    state = st;
    savedSnapshot = JSON.stringify(state);
    fileName = json ? name || null : null;
    fileHandle = json ? handle || null : null;
    sel = null;
    update();
    fitToContent();
    const nNotes = (state.canvasNotes || []).length;
    const detail =
      `${Object.keys(state.tables).length} tables, ${state.relationships.length} relationships` +
      (nNotes ? `, ${nNotes} note${nNotes === 1 ? "" : "s"}` : "");
    toast(toastMessage ? `${toastMessage} — ${detail}` : `Imported ${detail}`);
    return true;
  } catch (e) {
    console.error(e);
    toast(toastMessage ? "Could not open that share link" : "Could not read that diagram file");
    return false;
  }
}

/**
 * Replace the open diagram with tables parsed from SQL.
 * @param {string} text
 * @param {string} [name]
 * @returns {void}
 */
function loadSQLFromText(text, name) {
  try {
    const st = importSQLText(text);
    if (!Object.keys(st.tables).length) {
      toast("No CREATE TABLE statements found in that SQL");
      return;
    }
    undoStack.length = 0;
    redoStack.length = 0;
    state = st;
    savedSnapshot = ""; // imported SQL is not a saved diagram
    fileName = null;
    fileHandle = null;
    sel = null;
    update();
    fitToContent();
    toast(`Imported ${Object.keys(state.tables).length} tables from SQL`);
  } catch (e) {
    console.error(e);
    toast("Could not parse that SQL file");
  }
}

/**
 * Prompt for a diagram file and load it.
 * @returns {Promise<void>}
 */
async function openERDFile() {
  if (!(await ensureSavedThen())) return;
  if (window.showOpenFilePicker) {
    try {
      const [h] = await window.showOpenFilePicker({
        types: [
          { description: "simplERD diagram", accept: { "application/json": [".json"] } },
          { description: "Legacy ERD", accept: { "text/csv": [".erd", ".csv"] } },
        ],
      });
      const f = await h.getFile();
      loadERDFromText(await f.text(), f.name, h);
      return;
    } catch (e) {
      if (e && e.name === "AbortError") return;
    }
  }
  $("fileInputERD").click();
}

/**
 * Prompt for a `.sql` file and import it.
 * @returns {Promise<void>}
 */
async function openSQLFile() {
  if (!(await ensureSavedThen())) return;
  $("fileInputSQL").click();
}

/**
 * Replace the open diagram with an empty one, after a save prompt.
 * @returns {Promise<void>}
 */
async function newDiagram() {
  if (!(await ensureSavedThen())) return;
  pushUndo();
  state = newState();
  savedSnapshot = JSON.stringify(state);
  fileName = null;
  fileHandle = null;
  sel = null;
  view = { x: 0, y: 0, zoom: 1 };
  update();
}

/**
 * Download the current diagram as a `.sql` file.
 * @returns {void}
 */
function exportSQLFile() {
  if (!Object.keys(state.tables).length) {
    toast("Nothing to export");
    return;
  }
  const base = (fileName || "diagram").replace(/\.(erd|json)$/i, "");
  downloadFile(base + ".sql", generateSQL(state), "text/plain;charset=utf-8");
  toast("SQL exported");
}

/** Longest share URL this page will create. Longer diagrams should be saved as a file. */
var SHARE_URL_LIMIT = 1500000;
/** True while a share-link open prompt or decode is in progress. */
var shareOpenInProgress = false;

/**
 * @returns {boolean} True when the diagram has something worth putting in a link.
 */
function diagramHasContent() {
  return (
    Object.keys(state.tables).length > 0 ||
    (state.canvasNotes || []).length > 0 ||
    !!(state.notes && String(state.notes).trim())
  );
}

/**
 * @param {Uint8Array} bytes
 * @returns {string}
 */
function bytesToBase64Url(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * @param {string} text
 * @returns {Uint8Array}
 */
function base64UrlToBytes(text) {
  let s = text.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * @param {Uint8Array} bytes
 * @returns {Promise<Uint8Array>}
 */
async function compressGzip(bytes) {
  const stream = new Blob([bytes])
    .stream()
    .pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * @param {Uint8Array} bytes
 * @returns {Promise<string>}
 */
async function decompressGzip(bytes) {
  const stream = new Blob([bytes])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  return await new Response(stream).text();
}

/**
 * Encode a diagram document for a URL hash.
 * `s1.` is gzip. `s0.` is plain UTF-8 when gzip is unavailable.
 * @param {string} text Compact diagram JSON.
 * @returns {Promise<string>}
 */
async function encodeSharePayload(text) {
  const bytes = new TextEncoder().encode(text);
  if (typeof CompressionStream === "function")
    return "s1." + bytesToBase64Url(await compressGzip(bytes));
  return "s0." + bytesToBase64Url(bytes);
}

/**
 * @param {string} token Hash text including the `s0.` or `s1.` prefix.
 * @returns {Promise<string>} Diagram JSON.
 */
async function decodeSharePayload(token) {
  const prefix = token.slice(0, 3);
  const bytes = base64UrlToBytes(token.slice(3));
  if (prefix === "s1.") return decompressGzip(bytes);
  if (prefix === "s0.") return new TextDecoder().decode(bytes);
  throw new Error("Unknown share link");
}

/**
 * @returns {string|null} The current hash when it is a share payload.
 */
function currentSharePayload() {
  let hash = location.hash.replace(/^#/, "");
  if (!hash) return null;
  try {
    hash = decodeURIComponent(hash);
  } catch (e) {}
  if (hash.startsWith("s1.") || hash.startsWith("s0.")) return hash;
  return null;
}

/**
 * Drop a share hash so a refresh does not load it again over later edits.
 * @returns {void}
 */
function clearShareHash() {
  if (!location.hash) return;
  history.replaceState(null, "", location.pathname + location.search);
}

/**
 * @param {string} payload
 * @returns {string}
 */
function shareUrl(payload) {
  const url = new URL(location.href);
  url.hash = payload;
  return url.href;
}

/**
 * Build a link for the open diagram and show it.
 * @returns {Promise<void>}
 */
async function shareDiagram() {
  if (!diagramHasContent()) {
    toast("Nothing to share");
    return;
  }
  let url;
  try {
    const payload = await encodeSharePayload(
      JSON.stringify(JSON.parse(exportDiagramText(state))),
    );
    url = shareUrl(payload);
  } catch (e) {
    console.error(e);
    toast("Could not create a share link");
    return;
  }
  if (url.length > SHARE_URL_LIMIT) {
    toast("This diagram is too large to share as a link. Save it as a file instead.");
    return;
  }
  const input = el("input", {
    type: "text",
    class: "share-link",
    readonly: "readonly",
    value: url,
  });
  input.addEventListener("focus", () => input.select());
  const body = el(
    "div",
    {},
    el(
      "p",
      { style: "margin-top:0" },
      "Anyone with this link can open a copy of this diagram. Later edits are not shared.",
    ),
    input,
  );
  if (url.length > 8000) {
    body.append(
      el(
        "p",
        { class: "muted", style: "margin-bottom:0" },
        "This link is long. If a message cuts it off, send the diagram file instead.",
      ),
    );
  }
  openModal({
    title: "Share",
    body,
    buttons: [
      { label: "Close", onClick: closeModal },
      {
        label: "Copy link",
        cls: "primary",
        onClick: () => copyShareLink(input),
      },
    ],
  });
}

/**
 * @param {HTMLInputElement} input
 * @returns {Promise<void>}
 */
async function copyShareLink(input) {
  input.focus();
  input.select();
  try {
    await navigator.clipboard.writeText(input.value);
    toast("Link copied");
  } catch (e) {
    toast("Select the link and copy it");
  }
}

/**
 * Ask before a share link replaces a diagram already stored in this browser.
 * Escape keeps the current diagram.
 * @returns {Promise<boolean>}
 */
function confirmOpenShare() {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      closeModal();
      resolve(value);
    };
    openModal({
      title: "Open shared diagram",
      narrow: true,
      body: el(
        "div",
        {},
        "This link contains a diagram. Opening it replaces the diagram saved in this browser.",
      ),
      buttons: [
        { label: "Keep mine", onClick: () => finish(false) },
        { label: "Open link", cls: "primary", onClick: () => finish(true) },
      ],
    });
    modalOnClose = () => finish(false);
  });
}

/**
 * Load the diagram stored in the page hash, when there is one.
 * @param {boolean} [fromStartup] On startup, local autosave is what would be replaced.
 * @returns {Promise<boolean>} True when a shared diagram was loaded.
 */
async function openShareFromLocation(fromStartup) {
  const payload = currentSharePayload();
  if (!payload || shareOpenInProgress) return false;
  shareOpenInProgress = true;
  try {
    if (fromStartup) {
      if (storedAutosave() && !(await confirmOpenShare())) {
        clearShareHash();
        return false;
      }
    } else if (!(await ensureSavedThen())) {
      clearShareHash();
      return false;
    }
    const text = await decodeSharePayload(payload);
    const loaded = loadERDFromText(text, null, null, "Opened shared diagram");
    clearShareHash();
    return loaded;
  } catch (e) {
    console.error(e);
    toast("Could not open that share link");
    clearShareHash();
    return false;
  } finally {
    shareOpenInProgress = false;
  }
}
