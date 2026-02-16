// Foundry Character Vault – a tiny static viewer for exported Actor snapshots.
// No framework. Just taste.

const MANIFEST_URL = "./data/manifest.json";
const LS_KEY = "fcv_local_actor_payloads_v1";

const $ = (sel) => document.querySelector(sel);

const rosterEl = $("#roster");
const sheetEl = $("#sheet");
const statusEl = $("#status");
const searchEl = $("#search");

const importBtn = $("#importBtn");
const importFile = $("#importFile");
const refreshBtn = $("#refresh");

let allPayloads = [];  // [{id, name, meta, payload}]
let selectedId = null;

function safeText(s) {
  return (s ?? "").toString();
}

function norm(s) {
  return safeText(s).toLowerCase().trim();
}

function fmtSigned(n) {
  const x = Number(n ?? 0);
  return (x >= 0 ? `+${x}` : `${x}`);
}

function guessSystem(payload) {
  return payload?.systemId || payload?.actor?.system?.id || payload?.actor?.systemId || "unknown";
}

function actorFromPayload(payload) {
  return payload?.actor || payload?.data?.actor || payload?.document || payload;
}

function dnd5eMeta(actor) {
  const sys = actor?.system || {};
  const hp = sys?.attributes?.hp;
  const ac = sys?.attributes?.ac;
  const prof = sys?.attributes?.prof;
  const init = sys?.attributes?.init;
  const spell = sys?.attributes?.spellcasting;

  // class/level heuristics: sum class item levels
  const items = actor?.items || [];
  const classes = items.filter(i => i?.type === "class");
  const level = classes.reduce((a, c) => a + Number(c?.system?.levels ?? 0), 0) || sys?.details?.level || "";
  const classNames = classes.map(c => c?.name).filter(Boolean).join(", ");

  return {
    line1: [classNames || sys?.details?.class || "Character", level ? `Lv ${level}` : ""].filter(Boolean).join(" • "),
    line2: [`AC ${ac?.value ?? "–"}`, `HP ${hp?.value ?? "–"}/${hp?.max ?? "–"}`, `PB ${fmtSigned(prof ?? 0)}`].join("  ·  "),
    init: init?.mod ?? init?.total ?? init?.value,
    spellcasting: spell
  };
}

function defaultMeta(actor) {
  return { line1: actor?.type || "Actor", line2: "Snapshot" };
}

function getMeta(payload) {
  const actor = actorFromPayload(payload);
  const sysId = guessSystem(payload);
  if (sysId === "dnd5e") return dnd5eMeta(actor);
  return defaultMeta(actor);
}

function extractSearchCorpus(payload) {
  const actor = actorFromPayload(payload);
  const sys = actor?.system || {};
  const items = actor?.items || [];

  const bits = [];
  bits.push(actor?.name);
  bits.push(sys?.details?.class);
  bits.push(sys?.details?.race);
  bits.push(sys?.details?.background);
  for (const it of items) bits.push(it?.name);

  // dnd5e: skills, abilities
  const abilities = sys?.abilities || {};
  Object.keys(abilities).forEach(k => bits.push(k, abilities[k]?.label));
  const skills = sys?.skills || {};
  Object.keys(skills).forEach(k => bits.push(k, skills[k]?.label));

  return norm(bits.filter(Boolean).join(" "));
}

function rosterItem(payload) {
  const actor = actorFromPayload(payload);
  const meta = getMeta(payload);

  const tpl = $("#rosterItemTpl");
  const node = tpl.content.firstElementChild.cloneNode(true);

  node.dataset.id = actor?._id || payload?.id || crypto.randomUUID();
  node.querySelector("img").src = actor?.img || "https://dummyimage.com/160x160/111827/ffffff&text=%E2%98%85";
  node.querySelector(".name").textContent = actor?.name || "Unnamed";
  node.querySelector(".meta").textContent = meta.line1;

  node.addEventListener("click", () => selectActor(node.dataset.id));
  return node;
}

function setStatus(msg) {
  statusEl.textContent = msg;
}

function clearSheet() {
  sheetEl.innerHTML = `<div class="text-slate-300">Select a character, or hit <span class="text-white font-semibold">Import JSON</span>.</div>`;
}

function pill(text) {
  const tpl = $("#pillTpl");
  const node = tpl.content.firstElementChild.cloneNode(true);
  node.textContent = text;
  return node;
}

function section(title, bodyNode) {
  const wrap = document.createElement("div");
  wrap.className = "rounded-3xl bg-white/5 border border-white/10 overflow-hidden";

  const head = document.createElement("button");
  head.className = "w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition";
  head.innerHTML = `<div class="font-semibold">${title}</div><div class="text-slate-400 text-sm">toggle</div>`;

  const body = document.createElement("div");
  body.className = "px-4 pb-4";
  body.appendChild(bodyNode);

  let open = true;
  head.addEventListener("click", () => {
    open = !open;
    body.style.display = open ? "block" : "none";
  });

  wrap.appendChild(head);
  wrap.appendChild(body);
  return wrap;
}

function kvGrid(rows) {
  const grid = document.createElement("div");
  grid.className = "grid grid-cols-2 md:grid-cols-3 gap-2";

  for (const [k, v] of rows) {
    const card = document.createElement("div");
    card.className = "rounded-2xl bg-slate-950/40 border border-white/10 px-3 py-2";
    card.innerHTML = `<div class="text-xs text-slate-400">${k}</div><div class="font-semibold">${v}</div>`;
    grid.appendChild(card);
  }
  return grid;
}

function listCards(items, subtitleFn) {
  const wrap = document.createElement("div");
  wrap.className = "grid grid-cols-1 md:grid-cols-2 gap-2";
  for (const it of items) {
    const card = document.createElement("div");
    card.className = "rounded-2xl bg-slate-950/40 border border-white/10 p-3";
    const sub = subtitleFn ? subtitleFn(it) : "";
    card.innerHTML = `<div class="font-medium">${safeText(it.name || "Unnamed")}</div>${sub ? `<div class="text-xs text-slate-400 mt-1">${sub}</div>` : ""}`;
    wrap.appendChild(card);
  }
  return wrap;
}

function renderDnd5e(payload) {
  const actor = actorFromPayload(payload);
  const sys = actor?.system || {};
  const meta = dnd5eMeta(actor);

  const root = document.createElement("div");
  root.className = "flex flex-col gap-4";

  // hero
  const hero = document.createElement("div");
  hero.className = "rounded-3xl bg-white/5 border border-white/10 p-4 md:p-5";
  hero.innerHTML = `
    <div class="flex gap-4 items-start">
      <img src="${actor?.img || ""}" class="h-20 w-20 rounded-3xl object-cover border border-white/10" />
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-2">
          <h2 class="text-2xl font-semibold tracking-tight truncate">${safeText(actor?.name)}</h2>
        </div>
        <div class="mt-1 text-slate-300">${safeText(meta.line1)}</div>
        <div class="mt-2 flex flex-wrap gap-2" id="pills"></div>
      </div>
    </div>
  `;
  const pills = hero.querySelector("#pills");
  pills.appendChild(pill(meta.line2));
  const race = sys?.details?.race;
  const bg = sys?.details?.background;
  const align = sys?.details?.alignment;
  [race, bg, align].filter(Boolean).forEach(x => pills.appendChild(pill(x)));

  root.appendChild(hero);

  // core stats
  const abilities = sys?.abilities || {};
  const abilityRows = [
    ["STR", `${abilities?.str?.value ?? "–"} (${fmtSigned(abilities?.str?.mod ?? 0)})`],
    ["DEX", `${abilities?.dex?.value ?? "–"} (${fmtSigned(abilities?.dex?.mod ?? 0)})`],
    ["CON", `${abilities?.con?.value ?? "–"} (${fmtSigned(abilities?.con?.mod ?? 0)})`],
    ["INT", `${abilities?.int?.value ?? "–"} (${fmtSigned(abilities?.int?.mod ?? 0)})`],
    ["WIS", `${abilities?.wis?.value ?? "–"} (${fmtSigned(abilities?.wis?.mod ?? 0)})`],
    ["CHA", `${abilities?.cha?.value ?? "–"} (${fmtSigned(abilities?.cha?.mod ?? 0)})`],
  ];
  root.appendChild(section("Abilities", kvGrid(abilityRows)));

  const attr = sys?.attributes || {};
  const movement = attr?.movement || {};
  const combatRows = [
    ["Armour Class", attr?.ac?.value ?? "–"],
    ["Hit Points", `${attr?.hp?.value ?? "–"} / ${attr?.hp?.max ?? "–"}${attr?.hp?.temp ? ` (temp ${attr?.hp?.temp})` : ""}`],
    ["Initiative", fmtSigned(attr?.init?.mod ?? attr?.init?.total ?? attr?.init ?? 0)],
    ["Proficiency Bonus", fmtSigned(attr?.prof ?? 0)],
    ["Speed", `walk ${movement?.walk ?? "–"}${movement?.fly ? `, fly ${movement.fly}` : ""}${movement?.swim ? `, swim ${movement.swim}` : ""}`],
    ["Passive Perception", sys?.skills?.prc?.passive ?? "–"],
  ];
  root.appendChild(section("Combat", kvGrid(combatRows)));

  // skills
  const skillLabels = {
    acr: "Acrobatics", ani: "Animal Handling", arc: "Arcana", ath: "Athletics",
    dec: "Deception", his: "History", ins: "Insight", itm: "Intimidation",
    inv: "Investigation", med: "Medicine", nat: "Nature", prc: "Perception",
    prf: "Performance", per: "Persuasion", rel: "Religion", sle: "Sleight of Hand",
    ste: "Stealth", sur: "Survival"
  };
  const skills = sys?.skills || {};
  const skillRows = Object.keys(skillLabels).map(k => [skillLabels[k], fmtSigned(skills?.[k]?.total ?? skills?.[k]?.mod ?? 0)]);
  root.appendChild(section("Skills", kvGrid(skillRows)));

  // items
  const items = actor?.items || [];
  const spells = items.filter(i => i?.type === "spell").sort((a,b)=> safeText(a.name).localeCompare(safeText(b.name)));
  const feats = items.filter(i => i?.type === "feat").sort((a,b)=> safeText(a.name).localeCompare(safeText(b.name)));
  const gearTypes = new Set(["weapon","equipment","consumable","tool","loot","backpack"]);
  const gear = items.filter(i => gearTypes.has(i?.type)).sort((a,b)=> safeText(a.name).localeCompare(safeText(b.name)));

  if (spells.length) {
    root.appendChild(section("Spells", listCards(spells, (s) => {
      const lvl = s?.system?.level;
      const school = s?.system?.school;
      const prep = s?.system?.preparation?.mode;
      return [lvl === 0 ? "Cantrip" : `Level ${lvl}`, school, prep].filter(Boolean).join(" • ");
    })));
  } else {
    root.appendChild(section("Spells", document.createTextNode("No spells exported.")));
  }

  root.appendChild(section("Features", feats.length ? listCards(feats) : document.createTextNode("No features exported.")));
  root.appendChild(section("Inventory", gear.length ? listCards(gear, (g) => {
    const qty = g?.system?.quantity;
    const eq = g?.system?.equipped ? "equipped" : "";
    return [`qty ${qty ?? 1}`, eq].filter(Boolean).join(" • ");
  }) : document.createTextNode("No inventory exported.")));

  // notes
  const bio = sys?.details?.biography?.value || sys?.details?.biography || "";
  const notes = document.createElement("div");
  notes.className = "prose prose-invert max-w-none text-slate-200/90";
  notes.innerHTML = bio || "<em>No biography exported.</em>";
  root.appendChild(section("Biography", notes));

  return root;
}

function renderUnknown(payload) {
  const actor = actorFromPayload(payload);
  const sysId = guessSystem(payload);

  const root = document.createElement("div");
  root.className = "flex flex-col gap-4";

  const hero = document.createElement("div");
  hero.className = "rounded-3xl bg-white/5 border border-white/10 p-5";
  hero.innerHTML = `
    <div class="flex gap-4 items-start">
      <img src="${actor?.img || ""}" class="h-20 w-20 rounded-3xl object-cover border border-white/10" />
      <div class="min-w-0 flex-1">
        <h2 class="text-2xl font-semibold tracking-tight truncate">${safeText(actor?.name)}</h2>
        <div class="mt-1 text-slate-300">System: <span class="text-white font-medium">${sysId}</span></div>
        <div class="mt-3 text-slate-300/90">This viewer has rich rendering for dnd5e. For other systems, it shows a raw snapshot.</div>
      </div>
    </div>
  `;
  root.appendChild(hero);

  const pre = document.createElement("pre");
  pre.className = "text-xs whitespace-pre-wrap break-words rounded-3xl bg-slate-950/50 border border-white/10 p-4 max-h-[60vh] overflow-auto scrollbar";
  pre.textContent = JSON.stringify(payload, null, 2);

  root.appendChild(section("Raw data", pre));
  return root;
}

function renderSheet(payload) {
  const sysId = guessSystem(payload);
  if (sysId === "dnd5e") return renderDnd5e(payload);
  return renderUnknown(payload);
}

function paintRoster(payloads) {
  rosterEl.innerHTML = "";
  const frag = document.createDocumentFragment();

  for (const p of payloads) frag.appendChild(rosterItem(p));
  rosterEl.appendChild(frag);

  if (!payloads.length) {
    rosterEl.innerHTML = `<div class="p-4 text-slate-300">No characters loaded.</div>`;
    clearSheet();
  }
}

function selectActor(id) {
  selectedId = id;
  const found = allPayloads.find(x => (actorFromPayload(x.payload)?._id || x.id) === id);
  if (!found) return;

  // highlight
  rosterEl.querySelectorAll("button[data-id]").forEach(b => {
    b.classList.toggle("bg-white/10", b.dataset.id === id);
  });

  sheetEl.innerHTML = "";
  sheetEl.appendChild(renderSheet(found.payload));
}

function applySearch() {
  const q = norm(searchEl.value);
  if (!q) {
    paintRoster(allPayloads.map(x => x.payload));
    return;
  }

  const filtered = allPayloads
    .filter(x => x.corpus.includes(q))
    .map(x => x.payload);

  paintRoster(filtered);

  // if selected filtered out, clear
  if (selectedId) {
    const still = filtered.some(p => (actorFromPayload(p)?._id) === selectedId);
    if (!still) clearSheet();
  }
}

async function loadManifestPayloads() {
  const res = await fetch(MANIFEST_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`Manifest fetch failed: ${res.status}`);
  const manifest = await res.json(); // [{file,name?}]

  const payloads = [];
  for (const entry of manifest) {
    const r = await fetch(entry.file, { cache: "no-store" });
    if (!r.ok) continue;
    const payload = await r.json();
    payloads.push(payload);
  }
  return payloads;
}

function loadLocalPayloads() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveLocalPayloads(payloads) {
  localStorage.setItem(LS_KEY, JSON.stringify(payloads));
}

async function initialise() {
  setStatus("Loading manifest…");
  let manifestPayloads = [];
  try {
    manifestPayloads = await loadManifestPayloads();
  } catch (e) {
    // not fatal – site can work purely from imports
    console.warn(e);
  }

  const localPayloads = loadLocalPayloads();
  const merged = [...manifestPayloads, ...localPayloads];

  allPayloads = merged.map((payload) => {
    const actor = actorFromPayload(payload);
    const id = actor?._id || payload?.id || crypto.randomUUID();
    const meta = getMeta(payload);
    return {
      id,
      name: actor?.name || "Unnamed",
      meta,
      payload,
      corpus: extractSearchCorpus(payload)
    };
  }).sort((a,b)=> safeText(a.name).localeCompare(safeText(b.name)));

  paintRoster(allPayloads.map(x => x.payload));
  setStatus(allPayloads.length ? `${allPayloads.length} character(s) loaded.` : "No data loaded – import JSON to begin.");
}

importBtn.addEventListener("click", () => importFile.click());

importFile.addEventListener("change", async () => {
  const files = Array.from(importFile.files || []);
  if (!files.length) return;

  const newPayloads = [];
  for (const f of files) {
    try {
      const text = await f.text();
      const payload = JSON.parse(text);
      newPayloads.push(payload);
    } catch (e) {
      console.warn("Bad JSON:", f.name, e);
    }
  }

  const existingLocal = loadLocalPayloads();
  const mergedLocal = [...existingLocal, ...newPayloads];
  saveLocalPayloads(mergedLocal);

  await initialise();
});

refreshBtn.addEventListener("click", initialise);
searchEl.addEventListener("input", () => {
  // re-paint using current allPayloads and search
  // paintRoster expects payloads; we filter via corpus
  const q = norm(searchEl.value);
  const filtered = !q ? allPayloads : allPayloads.filter(x => x.corpus.includes(q));
  paintRoster(filtered.map(x => x.payload));
});

initialise();
