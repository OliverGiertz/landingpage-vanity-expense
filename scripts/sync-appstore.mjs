#!/usr/bin/env node
/**
 * Holt den aktuellen App-Store-Eintrag von Vanity Expense Logbook und traegt
 * eine neue Version in content.json ein (changelog + "Was ist neu").
 *
 * Laeuft im Deploy-Workflow, taeglich und bei jedem Push. Vorher wurde
 * content.json von einem externen Werkzeug aktualisiert, das niemand mehr
 * hatte – die Seite blieb dadurch monatelang auf v3.0.12 stehen.
 *
 * Aendert nur etwas, wenn die Store-Version noch nicht im changelog steht.
 * Exit 1, wenn kein Storefront antwortet: Der Workflow liefert content.json
 * dann nicht aus, statt die live liegende Fassung zurueckzudrehen.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const APP_ID = "6742772476";
const FILE = join(dirname(fileURLToPath(import.meta.url)), "..", "content.json");
const STORES = ["de", "at", "ch"];

async function lookup(country) {
  const res = await fetch(`https://itunes.apple.com/lookup?id=${APP_ID}&country=${country}`,
    { headers: { "User-Agent": "VanityExpense-Site/1.0" } });
  if (!res.ok) throw new Error(`lookup ${country} HTTP ${res.status}`);
  const json = await res.json();
  return (json.results && json.results[0]) || null;
}

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function noteLines(text) {
  return (text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    .map((l) => l.replace(/^[-*•]\s*/, ""));
}

async function main() {
  let entry = null;
  for (const c of STORES) {
    try { entry = await lookup(c); if (entry) break; }
    catch (e) { console.warn(e.message); }
  }
  if (!entry) { console.error("Kein Storefront lieferte die App."); process.exit(1); }

  const content = JSON.parse(readFileSync(FILE, "utf8"));
  content.changelog = content.changelog || [];
  if (content.changelog.some((e) => e.version === entry.version)) {
    console.log(`content.json kennt v${entry.version} bereits – nichts zu tun.`);
    return;
  }
  const lines = noteLines(entry.releaseNotes);
  const date = (entry.currentVersionReleaseDate || new Date().toISOString()).slice(0, 10);
  content.changelog.unshift({ version: entry.version, date, notes: lines.map((l) => `- ${l}`) });
  const [y, m, d] = date.split("-");
  content.lastUpdated = `${d}.${m}.${y}`;
  content.info = {
    ...(content.info || {}),
    title: `Was ist neu in v${entry.version}?`,
    bodyHtml: `<ul>${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`,
  };
  writeFileSync(FILE, JSON.stringify(content, null, 2) + "\n");
  console.log(`content.json um v${entry.version} (${date}) ergaenzt.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
