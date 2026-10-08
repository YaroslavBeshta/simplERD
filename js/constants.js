/**
 * @file Layout, palette, and storage constants shared by the simplERD scripts.
 * Each file is a classic script, so these `var` bindings are globals.
 */
"use strict";

var APP_VERSION = "1.4";
var GRID = 20;
var HEADER_H = 34;
var ROW_H = 24;
var PAD_BOTTOM = 8;
var DEFAULT_TABLE_WIDTH = 200;
var MIN_TABLE_WIDTH = 120;
var DEFAULT_CANVAS_W = 4000;
var DEFAULT_CANVAS_H = 3000;
var DEFAULT_NOTE_W = 220;
var DEFAULT_NOTE_H = 120;
var MIN_NOTE_W = 140;
var MIN_NOTE_H = 72;
var DEFAULT_NOTE_COLOR = "#fff4c2";
var NOTE_COLORS = [
  "#fff4c2",
  "#dbeafe",
  "#dcfce7",
  "#fce7f3",
  "#f3e8ff",
  "#f3f4f6",
];
var REL_TYPES = ["N:1", "1:N", "1:1", "N:M"];
var DEFAULT_COLUMN_DATA_TYPES = [
  "TEXT",
  "INTEGER",
  "REAL",
  "BLOB",
  "VARCHAR(255)",
  "BOOLEAN",
  "DATE",
  "DATETIME",
  "NUMERIC",
  "TIMESTAMP",
  "SERIAL",
  "UUID",
  "CHAR",
  "VARCHAR",
  "INT",
  "SMALLINT",
  "BIGINT",
  "DECIMAL",
  "FLOAT",
  "DOUBLE PRECISION",
  "TIME",
  "JSON",
];
var MAX_UNDO = 100;
var LS_AUTOSAVE = "simplerd.autosave.v1";
var LS_PREFS = "simplerd.prefs.v1";
