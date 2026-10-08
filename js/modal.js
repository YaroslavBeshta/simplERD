/**
 * @file Shared modal dialog and the unsaved-changes prompt.
 */
"use strict";

/** Optional callback run the next time the modal closes. */
var modalOnClose = null;

/**
 * Show the shared modal dialog.
 * @param {{title:string, body:Node, buttons:{label:string, cls?:string, onClick:Function}[], narrow?:boolean}} opts
 * @returns {void}
 */
function openModal({ title, body, buttons, narrow }) {
  const box = $("modalBox");
  box.className = "modal" + (narrow ? " narrow" : "");
  box.textContent = "";
  box.append(el("div", { class: "modal-header" }, title));
  const bodyEl = el("div", { class: "modal-body" });
  bodyEl.append(body);
  box.append(bodyEl);
  const footer = el("div", { class: "modal-footer" });
  for (const b of buttons) {
    footer.append(el("button", { class: "btn " + (b.cls || ""), onclick: b.onClick }, b.label));
  }
  box.append(footer);
  $("modalOverlay").classList.add("open");
  modalOnClose = null;
  const firstInput = bodyEl.querySelector("input, select, textarea");
  if (firstInput) setTimeout(() => firstInput.focus(), 30);
}

/**
 * Hide the modal and run a pending close callback.
 * @returns {void}
 */
function closeModal() {
  $("modalOverlay").classList.remove("open");
  if (modalOnClose) { const f = modalOnClose; modalOnClose = null; f(); }
}

/**
 * @returns {boolean}
 */
function modalIsOpen() { return $("modalOverlay").classList.contains("open"); }

/**
 * @param {string} title
 * @param {Node|string} message
 * @param {string} [okLabel]
 * @param {string} [okCls]
 * @returns {Promise<boolean>}
 */
function showConfirm(title, message, okLabel, okCls) {
  return new Promise(resolve => {
    openModal({
      title, narrow: true,
      body: el("div", {}, message),
      buttons: [
        { label: "Cancel", onClick: () => { closeModal(); resolve(false); } },
        { label: okLabel || "OK", cls: okCls || "primary", onClick: () => { closeModal(); resolve(true); } }
      ]
    });
  });
}

/**
 * @param {string} title
 * @param {Node|string} message
 * @param {{label:string, value:*, cls?:string}[]} choices
 * @returns {Promise<*>} The chosen `value`.
 */
function showChoice(title, message, choices) {
  // choices: [{label, value, cls}]
  return new Promise(resolve => {
    openModal({
      title, narrow: true,
      body: el("div", {}, message),
      buttons: choices.map(c => ({
        label: c.label, cls: c.cls,
        onClick: () => { closeModal(); resolve(c.value); }
      }))
    });
  });
}

/**
 * Ask to save when the diagram is dirty. Cancel aborts the caller's action.
 * @returns {Promise<boolean>} True when it is safe to discard or replace the diagram.
 */
async function ensureSavedThen() {
  // Returns true when it is OK to discard/replace the current diagram.
  if (!isDirty()) return true;
  const v = await showChoice("Unsaved changes",
    "The current diagram has unsaved changes. What would you like to do?",
    [
      { label: "Cancel", value: "cancel" },
      { label: "Discard", value: "discard", cls: "danger" },
      { label: "Save", value: "save", cls: "primary" }
    ]);
  if (v === "cancel") return false;
  if (v === "discard") return true;
  return await saveFile(false);
}
