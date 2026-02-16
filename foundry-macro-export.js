// Foundry Macro (Script) – Manual one-push export of all PC character Actors.
// Paste into a *Script* macro and run as GM.
// Output: downloads one JSON file per character.
//
// Notes:
// - This is intentionally light: no persistent listeners, no background churn.
// - Sanitises obvious GM-only fields via a conservative prune pass.
// - Designed for the “weekly snapshot” workflow: export → drop into your web app → deploy.

(async () => {
  if (!game.user.isGM) {
    ui.notifications.error("GM only: export must be run by a GM.");
    return;
  }

  const SYSTEM_ID = game.system.id;
  const FOUNDry_VERSION = game.version || game.release?.version || "unknown";
  const exportedAt = new Date().toISOString();

  // ---- configuration knobs (tweak if you like) ----
  const ONLY_PC_CHARACTERS = true; // require hasPlayerOwner
  const STRIP_FLAGS = true;        // removes flags from actor + items
  const PRUNE_KEYS_REGEX = /(gm|secret|private|hidden|password|tokenSecret|gmnotes)/i;

  const pcs = game.actors.filter(a => a.type === "character")
    .filter(a => !ONLY_PC_CHARACTERS || a.hasPlayerOwner);

  if (!pcs.length) {
    ui.notifications.warn("No PC character actors found.");
    return;
  }

  function prune(obj) {
    if (!obj || typeof obj !== "object") return obj;
    if (Array.isArray(obj)) return obj.map(prune);

    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (PRUNE_KEYS_REGEX.test(k)) continue;
      out[k] = prune(v);
    }
    return out;
  }

  function sanitiseActor(actor) {
    // toObject() yields a plain serialisable structure; safer than poking at internals
    let a = actor.toObject();

    // Strip permissions/ownership metadata (not useful for a static viewer)
    delete a.ownership;
    delete a.permission;
    delete a.folder;
    delete a.sort;
    delete a._stats;

    if (STRIP_FLAGS) delete a.flags;

    // Items: strip heavy/noisy bits, plus obvious GM-only notes
    if (Array.isArray(a.items)) {
      a.items = a.items.map(it => {
        const copy = structuredClone(it);
        delete copy._stats;
        if (STRIP_FLAGS) delete copy.flags;
        return prune(copy);
      });
    }

    // Actor system data can include GM-only fields; prune pass is conservative
    a = prune(a);

    return {
      exportedAt,
      systemId: SYSTEM_ID,
      foundryVersion: FOUNDry_VERSION,
      actor: a
    };
  }

  function slugify(name) {
    return (name || "actor")
      .toString()
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 64) || "actor";
  }

  function downloadJSON(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  ui.notifications.info(`Exporting ${pcs.length} PC(s)…`);

  for (const actor of pcs) {
    const payload = sanitiseActor(actor);
    const filename = `${slugify(actor.name)}.json`;
    downloadJSON(filename, payload);

    // tiny delay prevents some browsers from “eating” rapid-fire downloads
    await new Promise(r => setTimeout(r, 200));
  }

  ui.notifications.info("Export complete. Move the JSON files into your web app's data/actors folder.");
})();
