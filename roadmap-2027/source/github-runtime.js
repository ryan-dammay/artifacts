/* 2027 Roadmap – GitHub Pages runtime.
   Stands in for the Claude artifact's db and user capabilities so the same page runs on GitHub Pages.
   - Reads data/items.json (published copy) until someone unlocks editing.
   - The edit password unlocks a GitHub token kept encrypted in data/edit-key.json (PBKDF2 + AES-GCM, in the browser).
     With it, edits are saved straight to data/items.json in the repo, and an hourly task syncs them with Claude.
   - Owner setup: open the page with #setup-editing to store (or replace) the encrypted token. */
(function () {
  const REPO = "ryan-dammay/artifacts", BRANCH = "main";
  const ITEMS_PATH = "roadmap-2027/data/items.json", KEY_PATH = "roadmap-2027/data/edit-key.json";
  const API = "https://api.github.com/repos/" + REPO + "/contents/";
  const ss = { get: (k) => { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
               set: (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) {} },
               del: (k) => { try { sessionStorage.removeItem(k); } catch (e) {} } };

  let token = ss.get("rm27-gh-token");
  if (!token) ss.del("rm27-unlocked"); // the page's unlock flag only counts while this tab holds the token

  // ---------- helpers ----------
  const enc = new TextEncoder(), dec = new TextDecoder();
  const b64 = (bytes) => { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = (s) => Uint8Array.from(atob(String(s).replace(/\s/g, "")), (c) => c.charCodeAt(0));
  const toB64 = (str) => b64(enc.encode(str));
  const fromB64 = (s) => dec.decode(unb64(s));
  const status = (t) => { const el = document.getElementById("status"); if (el) el.textContent = t; };
  const gh = (path, opts = {}) => fetch(API + path, { cache: "no-store", ...opts,
    headers: { Accept: "application/vnd.github+json", ...(token ? { Authorization: "Bearer " + token } : {}), ...(opts.headers || {}) } });
  async function deriveKey(pw, salt, iter) {
    const base = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }

  // ---------- data ----------
  const loadJson = (p) => fetch(p, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  let rows = [];          // as stored in items.json: {id, data} or tombstones {id, deleted, deletedAt}
  let remoteSha = null;   // sha of items.json in the repo, once read through the API
  let pending = [];       // edits not yet saved to GitHub
  let meta = null, editKey = null;
  const itemListeners = new Set(), metaListeners = new Set();

  const applyOps = (base, ops) => {
    const map = new Map(base.map((r) => [r.id, r]));
    for (const o of ops) {
      if (o.op === "set") map.set(o.id, { id: o.id, data: o.data });
      else if (o.op === "update") { const cur = map.get(o.id); if (cur && cur.data) map.set(o.id, { id: o.id, data: { ...cur.data, ...o.data } }); }
      else if (o.op === "delete") map.set(o.id, { id: o.id, deleted: true, deletedAt: o.at });
    }
    return [...map.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  };
  const current = () => applyOps(rows, pending).filter((r) => !r.deleted && r.data);
  const meta0 = { fromCache: false, hasPendingWrites: false };
  const snap = (list) => ({ docs: list.map((r) => ({ id: r.id, exists: true, data: () => r.data, metadata: meta0 })), size: list.length, empty: !list.length, docChanges: () => [], metadata: meta0 });
  const emitItems = () => { const s = snap(current()); itemListeners.forEach((fn) => fn(s)); };
  const metaSnap = () => ({ id: "info", exists: !!meta, data: () => meta || undefined, metadata: meta0 });
  const emitMeta = () => { const s = metaSnap(); metaListeners.forEach((fn) => fn(s)); };

  async function fetchRemote() {
    const r = await gh(ITEMS_PATH + "?ref=" + BRANCH);
    if (!r.ok) throw new Error("GitHub said " + r.status + " when reading the projects");
    const j = await r.json();
    return { sha: j.sha, rows: JSON.parse(fromB64(j.content)) };
  }
  async function loadRows() {
    if (token) {
      try { const f = await fetchRemote(); remoteSha = f.sha; rows = f.rows; return; } catch (e) { /* fall back to the published copy */ }
    }
    rows = (await loadJson("data/items.json")) || [];
  }
  const ready = (async () => {
    const [m, k] = await Promise.all([loadJson("data/meta.json"), loadJson("data/edit-key.json")]);
    meta = m; editKey = k && k.ct ? k : null;
    await loadRows();
  })();

  // ---------- saving to GitHub ----------
  let timer = null, saving = false;
  const describe = (ops) => {
    const o = ops[ops.length - 1], t = (o.data && o.data.title) || (current().find((r) => r.id === o.id) || {}).data?.title || o.id;
    return (o.op === "delete" ? "deleted " : "updated ") + t + (ops.length > 1 ? " (+" + (ops.length - 1) + " more)" : "");
  };
  function queue(op) {
    if (!token) return Promise.reject({ code: "invalid_argument", message: "Editing is locked." });
    pending.push(op); emitItems();
    clearTimeout(timer); timer = setTimeout(flush, 700);
    return Promise.resolve();
  }
  async function flush() {
    if (saving) { clearTimeout(timer); timer = setTimeout(flush, 500); return; }
    if (!pending.length || !token) return;
    saving = true; const ops = pending; pending = [];
    status("Saving to GitHub…");
    try {
      let done = false;
      for (let attempt = 0; attempt < 3 && !done; attempt++) {
        const f = await fetchRemote();
        const next = applyOps(f.rows, ops);
        const r = await gh(ITEMS_PATH, { method: "PUT", body: JSON.stringify({
          message: "Roadmap edit on GitHub: " + describe(ops), content: toB64(JSON.stringify(next, null, 1)), sha: f.sha, branch: BRANCH }) });
        if (r.ok) { const j = await r.json(); remoteSha = j.content && j.content.sha; rows = next; done = true; }
        else if (r.status !== 409 && r.status !== 422) throw new Error("GitHub said " + r.status);
      }
      if (!done) throw new Error("someone else kept saving at the same time");
      emitItems();
      status("Saved to GitHub. The public page shows it in about a minute, and Claude within the hour.");
    } catch (e) {
      pending = ops.concat(pending); emitItems();
      status("Couldn't save to GitHub (" + (e.message || e) + "). Your change is kept in this tab; make another edit or reload to retry.");
    }
    saving = false;
    if (pending.length) { clearTimeout(timer); timer = setTimeout(flush, 1500); }
  }
  window.addEventListener("beforeunload", (e) => { if (pending.length || saving) { e.preventDefault(); e.returnValue = ""; } });

  // ---------- unlocking with the edit password ----------
  window.rmUnlock = async (pw) => {
    await ready;
    if (!editKey) return "Editing on GitHub isn't set up yet.";
    let t;
    try {
      const key = await deriveKey(pw, unb64(editKey.salt), editKey.iter);
      t = dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(editKey.iv) }, key, unb64(editKey.ct)));
    } catch (e) { return "That password isn't right. Try again."; }
    token = t;
    const r = await gh("").catch(() => null); // lists the repo root: checks the token still works
    if (!r || !r.ok) { token = null; return "The password is right, but GitHub refused the saved access (" + (r ? r.status : "offline") + "). The owner needs to set it up again."; }
    ss.set("rm27-gh-token", t);
    await loadRows(); emitItems();
    return true;
  };

  // ---------- the db and user stand-ins the page uses ----------
  const lockDoc = () => ({ id: "lock", exists: !!editKey, data: () => (editKey ? { salt: "github", hash: "github" } : undefined), metadata: meta0 });
  const docRef = (path) => {
    const [coll, id] = path.split("/");
    return {
      id, path,
      get: async () => { await ready; if (path === "meta/info") return metaSnap(); if (path === "meta/lock") return lockDoc();
        const r = current().find((x) => x.id === id); return { id, exists: !!r, data: () => (r ? r.data : undefined), metadata: meta0 }; },
      onSnapshot: (next) => {
        if (path === "meta/info") { metaListeners.add(next); ready.then(() => next(metaSnap())); return () => metaListeners.delete(next); }
        ready.then(() => next(path === "meta/lock" ? lockDoc() : { id, exists: false, data: () => undefined, metadata: meta0 })); return () => {};
      },
      set: (data) => {
        if (path === "meta/info") { meta = { ...data }; emitMeta(); return Promise.resolve(); } // shown here; the sync writes meta.json
        if (coll !== "items") return Promise.reject({ code: "invalid_argument", message: "Not available on GitHub." });
        return queue({ op: "set", id, data: { ...data, updatedAt: Date.now() } });
      },
      update: (data) => (coll === "items" ? queue({ op: "update", id, data: { ...data, updatedAt: Date.now() } }) : Promise.resolve()),
      delete: () => (coll === "items" ? queue({ op: "delete", id, at: Date.now() }) : Promise.resolve()),
      acquire: async () => ({ acquired: false }),
      collection: (c) => collRef(path + "/" + c),
    };
  };
  const newId = () => "gh-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
  const collRef = (path) => ({
    path,
    doc: (id) => docRef(path + "/" + (id || newId())),
    add: async (data) => { const ref = docRef(path + "/" + newId()); await ref.set(data); return ref; },
    where() { return this; }, orderBy() { return this; }, limit() { return this; },
    get: async () => { await ready; if (path === "items") { await loadRows(); emitItems(); } return snap(path === "items" ? current() : []); },
    onSnapshot: (next) => { if (path !== "items") return () => {}; itemListeners.add(next); ready.then(() => next(snap(current()))); return () => itemListeners.delete(next); },
  });
  const db = { doc: docRef, collection: collRef };
  // Everyone may try to edit; the edit password decides. Only the owner sets up the saved access (#setup-editing).
  const user = { can: async () => { await ready; return !!editKey; }, canEdit: async () => false, isOwner: async () => false, id: async () => null };
  window.claude = { use: async (name) => (name === "db" ? db : name === "user" ? user : null) };

  // ---------- page notes and owner setup ----------
  document.addEventListener("DOMContentLoaded", () => {
    ready.then(() => {
      const host = document.querySelector(".head-actions");
      if (host) { const note = document.createElement("p"); note.className = "updated";
        note.textContent = editKey ? "GitHub copy · edits sync with Claude every hour" : "Read-only copy · synced from Claude every hour"; host.prepend(note); }
      if (location.hash === "#setup-editing") openSetup();
    });
  });
  function openSetup() {
    const wrap = document.createElement("div"); wrap.className = "scrim pw";
    wrap.innerHTML = '<form class="sheet pwsheet" id="gh-setup"><h2>Set up editing on GitHub</h2>' +
      '<p class="pw-text">Paste a GitHub fine-grained token that can only read and write the contents of ' + REPO + ', then choose the edit password. ' +
      'The token is encrypted with the password in this browser and saved to the repo; the password itself is never saved.</p>' +
      '<label class="field">GitHub token<input type="password" id="gh-token" autocomplete="off"></label>' +
      '<label class="field">Edit password<input type="password" id="gh-pw" autocomplete="new-password"></label>' +
      '<label class="field">Confirm password<input type="password" id="gh-pw2" autocomplete="new-password"></label>' +
      '<p class="pw-err" id="gh-err" role="alert"></p>' +
      '<div class="actions"><span></span><div class="r"><button class="btn ghost" type="button" id="gh-cancel">Cancel</button><button class="btn" type="submit">Save</button></div></div></form>';
    document.body.append(wrap);
    const $ = (id) => document.getElementById(id), err = (t) => { $("gh-err").textContent = t; };
    $("gh-cancel").onclick = () => { wrap.remove(); history.replaceState(null, "", location.pathname); };
    $("gh-setup").onsubmit = async (e) => {
      e.preventDefault();
      const t = $("gh-token").value.trim(), p = $("gh-pw").value;
      if (!t) return err("Paste the GitHub token.");
      if (p.length < 6) return err("Use a password of at least 6 characters.");
      if (p !== $("gh-pw2").value) return err("The two passwords don't match.");
      err("Checking the token…");
      const prev = token; token = t;
      try {
        const repo = await fetch("https://api.github.com/repos/" + REPO, { headers: { Accept: "application/vnd.github+json", Authorization: "Bearer " + t } });
        if (!repo.ok) throw new Error("GitHub refused the token (" + repo.status + ")");
        const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12)), iter = 600000;
        const key = await deriveKey(p, salt, iter);
        const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(t)));
        const body = { v: 1, kdf: "PBKDF2-SHA256", iter, salt: b64(salt), iv: b64(iv), ct: b64(ct), setAt: new Date().toISOString() };
        const old = await gh(KEY_PATH + "?ref=" + BRANCH); const sha = old.ok ? (await old.json()).sha : undefined;
        const r = await gh(KEY_PATH, { method: "PUT", body: JSON.stringify({ message: "Roadmap: set up editing on GitHub", content: toB64(JSON.stringify(body, null, 1)), branch: BRANCH, ...(sha ? { sha } : {}) }) });
        if (!r.ok) throw new Error("GitHub refused to save it (" + r.status + "). The token needs Contents: Read and write on " + REPO);
        editKey = body; ss.set("rm27-gh-token", t); ss.set("rm27-unlocked", "github");
        wrap.remove(); history.replaceState(null, "", location.pathname); location.reload();
      } catch (x) { token = prev; err(x.message || String(x)); }
    };
    $("gh-token").focus();
  }
})();
