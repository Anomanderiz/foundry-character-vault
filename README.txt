Foundry Character Vault (static)

Workflow:
1) In Foundry (as GM), run the macro in `foundry-macro-export.js`.
   - It downloads one JSON file per PC.

2) Copy those JSON files into:
   /data/actors/

3) Rebuild the manifest:
   node tools/build-manifest.mjs data/actors data/manifest.json

4) Host the folder as a static site (GitHub Pages, Netlify, Cloudflare Pages, etc).
   - Open index.html and you’re done.

Optional:
- Players can click “Import JSON” and load files locally (stored in localStorage),
  so you can avoid publishing any JSON at all.

This viewer renders dnd5e nicely. For other systems, it falls back to a raw JSON view.
