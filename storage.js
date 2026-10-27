"use strict";

/* ==========================================================================
   storage.js — grid persistence in localStorage
   Web-page counterpart of the `grids/` folder of the Blender add-on.
   Version 2 keys: the model changed (format + density instead of cols x rows),
   version 1 records are wiped on load.
   ========================================================================== */

const STORAGE_KEYS = {
  grids: "color_grid.grids.v2",     // { [name]: config }
  current: "color_grid.current.v2", // last grid shown (restores the page)
};

/* Records from earlier versions, plus the one-key-per-setting names used back
   when every setting had its own key: all of it is removed. */
const LEGACY_KEYS = [
  "color_grid.grids.v1",
  "color_grid.current.v1",
  "color_grid.seeded.v1",
  "color_grid.name",
  "color_grid.cols",
  "color_grid.rows",
  "color_grid.showHex",
  "color_grid.space",
];

const MAX_GRIDS = 200;

class GridStore {
  /* fallback memory when localStorage is unavailable
     (private browsing, sandboxed iframe, old browsers) */
  constructor() {
    this.memory = null;
    this.storage = this._probe();
    this._wipeLegacy();
  }

  _probe() {
    try {
      const probe = "__color_grid_probe__";
      window.localStorage.setItem(probe, "1");
      window.localStorage.removeItem(probe);
      return window.localStorage;
    } catch (error) {
      this.memory = {};
      return null;
    }
  }

  _wipeLegacy() {
    if (this.memory) { this.memory = {}; return; }
    for (const key of LEGACY_KEYS) {
      try { this.storage.removeItem(key); } catch (error) { /* not blocking */ }
    }
  }

  get persistent() {
    return this.storage !== null;
  }

  _readAll() {
    if (this.memory) return { ...this.memory };
    try {
      const raw = this.storage.getItem(STORAGE_KEYS.grids);
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  _writeAll(grids) {
    const limited = Object.fromEntries(Object.entries(grids).slice(0, MAX_GRIDS));
    if (this.memory) { this.memory = limited; return true; }
    try {
      this.storage.setItem(STORAGE_KEYS.grids, JSON.stringify(limited));
      return true;
    } catch (error) {
      // quota exceeded, or storage cut off mid-write: switch to memory
      this.storage = null;
      this.memory = limited;
      return false;
    }
  }

  /* Names sorted, like the JSON files are sorted in the add-on */
  list() {
    return Object.keys(this._readAll()).sort((a, b) =>
      a.localeCompare(b, "en", { numeric: true, sensitivity: "base" }));
  }

  get(name) {
    return this._readAll()[name] || null;
  }

  save(config) {
    const grids = this._readAll();
    grids[config.grid_name] = config;
    return this._writeAll(grids);
  }

  remove(name) {
    const grids = this._readAll();
    if (!(name in grids)) return false;
    delete grids[name];
    this._writeAll(grids);
    return true;
  }

  rename(oldName, newName) {
    const grids = this._readAll();
    if (!grids[oldName] || grids[newName]) return false;
    grids[newName] = { ...grids[oldName], grid_name: newName };
    delete grids[oldName];
    this._writeAll(grids);
    return true;
  }

  saveCurrent(config) {
    if (this.memory) return;
    try { this.storage.setItem(STORAGE_KEYS.current, JSON.stringify(config)); } catch (error) { /* not blocking */ }
  }

  clearCurrent() {
    if (this.memory) return;
    try { this.storage.removeItem(STORAGE_KEYS.current); } catch (error) { /* not blocking */ }
  }

  loadCurrent() {
    if (this.memory) return null;
    try {
      const raw = this.storage.getItem(STORAGE_KEYS.current);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }
}
