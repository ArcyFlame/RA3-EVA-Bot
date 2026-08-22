#!/usr/bin/env node
/**
 * Seeds the Hall of Fame (masters table) with the historical ladder winners
 * list. Idempotent: INSERT OR IGNORE on the unique (name, year, patch) combo,
 * so re-running never duplicates rows.
 *
 * Run with:  npm run seed:masters
 */

const path = require('node:path');
require('dotenv').config();
const Database = require('better-sqlite3');

const ROOT = path.join(__dirname, '..');
const db = new Database(path.join(ROOT, 'data', 'bot.db'));

// [name, year, patch?] — patch is only set where the list specifies one.
const MASTERS = [
  // 2025
  ['Dutcharmy', 2025],
  ['Zugspitze', 2025],
  ['DDF', 2025],
  // 2021
  ['Pika', 2021],
  // 2017
  ['Dimon', 2017],
  // 2015
  ['Vindies', 2015],
  // 2014
  ['LiCtor', 2014],
  ['Dankal', 2014],
  ['YuiYui', 2014],
  // 2013
  ['JulzzZ', 2013],
  // 2012
  ['WalfTheWolf', 2012],
  ['Eminence', 2012],
  ['Kivi', 2012],
  // 2011
  ['4del', 2011],
  ['Tingu', 2011],
  // 2010 (and late-2009 entries listed under 2010 in the source list)
  ['Maniek', 2010],
  ['TerryBogard', 2010],
  ['Sofronel', 2010],
  ['Malle', 2009],
  ['Das.Duelon', 2009],
  ['Zlex', 2009],
  ['KungFuLyn', 2009],
  ['Technique', 2009],
  ['Mutou', 2009],
  // 2009 — Patch 1.10
  ['nukestrike_', 2009, 'Patch 1.10'],
  ['firgli', 2009, 'Patch 1.10'],
  ['BaPor', 2009, 'Patch 1.10'],
  // 2009 — Patch 1.07
  ['Dwelf^', 2009, 'Patch 1.07'],
  ['Dynamic (-XeoNeQ-)', 2009, 'Patch 1.07'],
  ['FreeZZinG)', 2009, 'Patch 1.07'],
  ['EyEamZero', 2009, 'Patch 1.07'],
  ['Matiz', 2009, 'Patch 1.07'],
  // 2008 — Patch 1.05-1.06
  ['vehman', 2008, 'Patch 1.05-1.06'],
  ['JoZhA', 2008, 'Patch 1.05-1.06'],
  ['Avilo', 2008, 'Patch 1.05-1.06'],
  ['-Netput', 2008, 'Patch 1.05-1.06'],
  ['Crunk 8D', 2008, 'Patch 1.05-1.06'],
  ['ShadowTerran_II', 2008, 'Patch 1.05-1.06'],
  ['Iaguz', 2008, 'Patch 1.05-1.06'],
];

const exists = db.prepare('SELECT id FROM masters WHERE name = ? AND year = ?');
const insert = db.prepare('INSERT INTO masters (name, year, patch) VALUES (?, ?, ?)');
const tx = db.transaction(() => {
  let added = 0;
  for (const [name, year, patch] of MASTERS) {
    if (exists.get(name, year)) continue;
    insert.run(name, year, patch ?? null);
    added++;
  }
  return added;
});
const added = tx();
const total = db.prepare('SELECT COUNT(*) AS n FROM masters').get().n;
console.log(`Seeded ${added} new master(s); masters table now has ${total} row(s).`);
db.close();
