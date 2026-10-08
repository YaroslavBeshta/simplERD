/**
 * @file Pure geometry. No diagram state and no DOM.
 */
"use strict";

/**
 * @param {number} x0
 * @param {number} y0
 * @param {number} x1
 * @param {number} y1
 * @returns {{x:number, y:number, w:number, h:number}}
 */
function selectionRect(x0, y0, x1, y1) {
  return {
    x: Math.min(x0, x1),
    y: Math.min(y0, y1),
    w: Math.abs(x1 - x0),
    h: Math.abs(y1 - y0),
  };
}

/**
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {{x:number, y:number, w:number, h:number}} box
 * @returns {boolean}
 */
function rectOverlaps(x, y, w, h, box) {
  return x < box.x + box.w && x + w > box.x && y < box.y + box.h && y + h > box.y;
}

/**
 * New box after dragging one edge or corner. The opposite edge stays put.
 * @param {{dir?:string, startX:number, startY:number, startW:number, startH:number, px:number, py:number}} drag
 * @param {{x:number, y:number}} pt
 * @param {number} minW
 * @param {number} minH
 * @returns {{x:number, y:number, width:number, height:number}}
 */
function resizedBox(drag, pt, minW, minH) {
  const dir = drag.dir || "e";
  const right = drag.startX + drag.startW;
  const bottom = drag.startY + drag.startH;
  let x = drag.startX,
    y = drag.startY,
    w = drag.startW,
    h = drag.startH;
  if (dir.indexOf("e") !== -1)
    w = Math.max(minW, snap(drag.startW + (pt.x - drag.px)));
  if (dir.indexOf("w") !== -1) {
    let nx = snap(drag.startX + (pt.x - drag.px));
    if (right - nx < minW) nx = right - minW;
    x = nx;
    w = right - nx;
  }
  if (dir.indexOf("s") !== -1)
    h = Math.max(minH, snap(drag.startH + (pt.y - drag.py)));
  if (dir.indexOf("n") !== -1) {
    let ny = snap(drag.startY + (pt.y - drag.py));
    if (bottom - ny < minH) ny = bottom - minH;
    y = ny;
    h = bottom - ny;
  }
  return { x: x, y: y, width: w, height: h };
}
