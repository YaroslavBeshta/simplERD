/**
 * @file DOM helpers, color utilities, and the toast.
 */
"use strict";

/**
 * @param {string} id
 * @returns {HTMLElement}
 */
function $(id) {
  return document.getElementById(id);
}

/** SVG namespace used when creating canvas elements. */
var svgNS = "http://www.w3.org/2000/svg";

/**
 * Snap a scene coordinate to the grid.
 * @param {number} v
 * @returns {number}
 */
function snap(v) {
  return Math.round(v / GRID) * GRID;
}

/**
 * @param {number} v
 * @param {number} a Lower bound.
 * @param {number} b Upper bound.
 * @returns {number}
 */
function clamp(v, a, b) {
  return Math.min(b, Math.max(a, v));
}

/**
 * @template T
 * @param {T} o
 * @returns {T}
 */
function deepCopy(o) {
  return JSON.parse(JSON.stringify(o));
}

/**
 * Stable identity for a relationship, used as the selection key.
 * @param {Relationship} r
 * @returns {string}
 */
function relKey(r) {
  return `${r.table1}${r.fkCol}${r.table2}${r.pkCol}`;
}

/**
 * Pixel height of a table card, including header and column rows.
 * @param {Table} t
 * @returns {number}
 */
function tblHeight(t) {
  return HEADER_H + Math.max(1, t.columns.length) * ROW_H + PAD_BOTTOM;
}

/**
 * @param {Table} t
 * @param {string} name
 * @returns {Column|undefined}
 */
function getCol(t, name) {
  return t.columns.find((c) => c.name === name);
}

/**
 * @param {Table} t
 * @param {string} name
 * @returns {number} Index, or -1 when the column is missing.
 */
function colIdx(t, name) {
  return t.columns.findIndex((c) => c.name === name);
}

/**
 * Scene Y of a column row, used to anchor relationship lines.
 * @param {Table} t
 * @param {string} name
 * @returns {number}
 */
function colYAbs(t, name) {
  const i = colIdx(t, name);
  return t.y + (i < 0 ? HEADER_H / 2 : HEADER_H + i * ROW_H + ROW_H / 2);
}

/**
 * Header color from the active theme stylesheet.
 * @returns {string}
 */
function builtinHeaderColor() {
  return (
    getComputedStyle(document.documentElement)
      .getPropertyValue("--tbl-default-header")
      .trim() || "#6c757d"
  );
}

/**
 * Body color from the active theme stylesheet.
 * @returns {string}
 */
function builtinBodyColor() {
  return (
    getComputedStyle(document.documentElement)
      .getPropertyValue("--tbl-default-body")
      .trim() || "#ffffff"
  );
}

/**
 * User-chosen default table colors for the active theme.
 * @returns {{header?: string, body?: string}}
 */
function themeOverrides() {
  return (prefs.themeDefaults || {})[prefs.theme] || {};
}

/**
 * Header color applied to newly created tables.
 * @returns {string}
 */
function defaultHeaderColor() {
  return themeOverrides().header || builtinHeaderColor();
}

/**
 * Body color applied to newly created tables.
 * @returns {string}
 */
function defaultBodyColor() {
  return themeOverrides().body || builtinBodyColor();
}

/**
 * Pick black or white text for a background color.
 * @param {string} hex
 * @returns {string}
 */
function contrastText(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return "#000000";
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "#212529" : "#ffffff";
}

/**
 * @param {string} s
 * @param {number} max
 * @returns {string}
 */
function truncate(s, max) {
  return s.length > max ? s.slice(0, Math.max(1, max - 1)) + "…" : s;
}

/**
 * @param {string} base
 * @returns {string} `base`, or a `_copy` suffix that is not already used.
 */
function uniqueTableName(base) {
  if (!state.tables[base]) return base;
  let n = base + "_copy";
  let i = 2;
  while (state.tables[n]) n = `${base}_copy${i++}`;
  return n;
}

/**
 * Create an SVG element.
 * @param {string} tag
 * @param {Object<string, string|number>} [attrs]
 * @returns {SVGElement}
 */
function svgEl(tag, attrs) {
  const e = document.createElementNS(svgNS, tag);
  for (const k in attrs || {}) e.setAttribute(k, attrs[k]);
  return e;
}

/**
 * Create an HTML element and append children. `on*` attributes are listeners.
 * @param {string} tag
 * @param {Object<string, any>} [attrs]
 * @param {...(Node|string|null)} children
 * @returns {HTMLElement}
 */
function el(tag, attrs, ...children) {
  const e = document.createElement(tag);
  for (const k in attrs || {}) {
    if (k === "class") e.className = attrs[k];
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), attrs[k]);
    else e.setAttribute(k, attrs[k]);
  }
  for (const c of children) {
    if (c == null) continue;
    e.append(c.nodeType ? c : document.createTextNode(c));
  }
  return e;
}
var toastTimer = null;
/**
 * Show a short message above the status bar.
 * @param {string} msg
 * @returns {void}
 */
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
}

/**
 * Normalize a CSS color to `#rrggbb`.
 * @param {string} c
 * @returns {string}
 */
function toHex6(c) {
  c = (c || "").trim();
  if (/^#[0-9a-f]{6}$/i.test(c)) return c.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(c))
    return ("#" + c[1] + c[1] + c[2] + c[2] + c[3] + c[3]).toLowerCase();
  // resolve named/other colors via a probe
  const probe = document.createElement("canvas").getContext("2d");
  probe.fillStyle = c || "#ffffff";
  const v = probe.fillStyle;
  return /^#[0-9a-f]{6}$/i.test(v) ? v : "#ffffff";
}
