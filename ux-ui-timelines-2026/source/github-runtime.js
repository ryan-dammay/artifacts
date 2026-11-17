/* 2026 UX/UI Timelines – GitHub Pages runtime.
   Stands in for the Claude artifact's db and user capabilities so the same page runs on GitHub Pages.
   - Reads data/tasks.json and data/kpis.json (the published copies) until someone logs in.
   - Log in: each person (Ryan, Anjali, Talal) has their own edit password. It unlocks a GitHub token kept
     encrypted in data/edit-key.json (PBKDF2 + AES-GCM, in the browser), once per person. Ryan's password gives admin
     rights; Anjali's and Talal's give the same rights as in Claude (add tasks, edit and delete their own).
   - Edits are saved straight to the data files in the repo; a scheduled task syncs them with the Claude artifact.
   - Owner setup: open the page with #setup-editing to store (or replace) the token and the passwords. */
(function () {
  const REPO = "ryan-dammay/artifacts", BRANCH = "main", DIR = "ux-ui-timelines-2026/data/";
  const FILES = { tasks: DIR + "tasks.json", kpis: DIR + "kpis.json" };
  const KEY_PATH = DIR + "edit-key.json";
  const API = "https://api.github.com/repos/" + REPO + "/contents/";
  const PEOPLE = ["Ryan", "Anjali", "Talal"];
  // Ids used for "added by": Anjali's matches her Claude account, so her own tasks stay hers in both places.
  const IDS = { Ryan: null, Anjali: "u_XhpqJMkeIsGAbDcqsWXk3A", Talal: "gh-talal" };
  const TOK = "tl26-gh-token", WHO = "tl26-gh-who";
  const ls = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
               set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} },
               del: (k) => { try { localStorage.removeItem(k); } catch (e) {} } };
  let token = ls.get(TOK), who = ls.get(WHO);
  if (!token || !PEOPLE.includes(who)) { token = null; who = null; }

  // ---------- helpers ----------
  const enc = new TextEncoder(), dec = new TextDecoder();
  const b64 = (bytes) => { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = (s) => Uint8Array.from(atob(String(s).replace(/\s/g, "")), (c) => c.charCodeAt(0));
  const toB64 = (str) => b64(enc.encode(str));
  const fromB64 = (s) => dec.decode(unb64(s));
  const status = (t) => { const el = document.getElementById("status"); if (el) el.textContent = t; };
  const gh = (path, opts = {}, tok = token) => fetch(API + path, { cache: "no-store", ...opts,
    headers: { Accept: "application/vnd.github+json", ...(tok ? { Authorization: "Bearer " + tok } : {}), ...(opts.headers || {}) } });
  async function deriveKey(pw, salt, iter) {
    const base = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }
  async function seal(pw, text) {
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(pw, salt, 600000);
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(text)));
    return { salt: b64(salt), iv: b64(iv), ct: b64(ct) };
  }
  async function unseal(pw, e, iter) {
    const key = await deriveKey(pw, unb64(e.salt), iter);
    return dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(e.iv) }, key, unb64(e.ct)));
  }

  // ---------- data ----------
  const loadJson = (p) => fetch(p, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const rows = { tasks: [], kpis: [] };      // as stored: {id, data} or tombstones {id, deleted, deletedAt}
  const pending = { tasks: [], kpis: [] };   // edits not yet saved to GitHub
  const listeners = { tasks: new Set(), kpis: new Set() };
  let people = {}, meta = null, editKey = null;

  const applyOps = (base, ops) => {
    const map = new Map(base.map((r) => [r.id, r]));
    for (const o of ops) {
      if (o.op === "set") map.set(o.id, { id: o.id, data: o.data });
      else if (o.op === "update") { const cur = map.get(o.id); if (cur && cur.data) map.set(o.id, { id: o.id, data: { ...cur.data, ...o.data } }); }
      else if (o.op === "delete") map.set(o.id, { id: o.id, deleted: true, deletedAt: o.at });
    }
    return [...map.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  };
  const current = (c) => applyOps(rows[c], pending[c]).filter((r) => !r.deleted && r.data);
  const meta0 = { fromCache: false, hasPendingWrites: false };
  const snap = (list) => ({ docs: list.map((r) => ({ id: r.id, exists: true, data: () => r.data, metadata: meta0 })), size: list.length, empty: !list.length, docChanges: () => [], metadata: meta0 });
  const emit = (c) => { const s = snap(current(c)); listeners[c].forEach((fn) => fn(s)); };

  async function fetchRemote(c) {
    const r = await gh(FILES[c] + "?ref=" + BRANCH);
    if (r.status === 404) return { sha: undefined, rows: [] };
    if (!r.ok) throw new Error("GitHub said " + r.status + " when reading " + c);
    const j = await r.json();
    return { sha: j.sha, rows: JSON.parse(fromB64(j.content)) };
  }
  async function loadRows() {
    for (const c of Object.keys(FILES)) {
      if (token) { try { rows[c] = (await fetchRemote(c)).rows; continue; } catch (e) { /* fall back to the published copy */ } }
      rows[c] = (await loadJson("data/" + c + ".json")) || [];
    }
  }
  // The passwords file: the Pages copy, or straight from the repo while Pages is still publishing a new one.
  async function loadKey() {
    const k = await loadJson("data/edit-key.json");
    if (k && k.people) return k;
    try {
      const r = await fetch(API + KEY_PATH + "?ref=" + BRANCH, { cache: "no-store", headers: { Accept: "application/vnd.github.raw+json" } });
      if (r.ok) { const j = await r.json(); if (j && j.people) return j; }
    } catch (e) {}
    return null;
  }
  const ready = (async () => {
    const [p, m, k] = await Promise.all([loadJson("data/people.json"), loadJson("data/meta.json"), loadKey()]);
    people = p || {}; meta = m; editKey = k;
    // Log out only when the passwords file was read and no longer lists this person (Ryan removed their access).
    if (token && editKey && !editKey.people[who]) { token = null; who = null; ls.del(TOK); ls.del(WHO); }
    await loadRows();
  })();

  // ---------- saving to GitHub ----------
  const timers = {}, saving = {};
  const titleOf = (c, o) => (o.data && (o.data.title || o.data.kpi)) || ((current(c).find((r) => r.id === o.id) || {}).data || {}).title || o.id;
  const describe = (c, ops) => { const o = ops[ops.length - 1]; return (o.op === "delete" ? "deleted " : o.op === "set" ? "added " : "updated ") + titleOf(c, o) + (ops.length > 1 ? " (+" + (ops.length - 1) + " more)" : ""); };
  function queue(c, op) {
    if (!token) return Promise.reject({ code: "invalid_argument", message: "Log in to edit." });
    pending[c].push(op); emit(c);
    clearTimeout(timers[c]); timers[c] = setTimeout(() => flush(c), 700);
    return Promise.resolve();
  }
  async function flush(c) {
    if (saving[c]) { clearTimeout(timers[c]); timers[c] = setTimeout(() => flush(c), 500); return; }
    if (!pending[c].length || !token) return;
    saving[c] = true; const ops = pending[c]; pending[c] = [];
    status("Saving to GitHub…");
    try {
      let done = false;
      for (let attempt = 0; attempt < 3 && !done; attempt++) {
        const f = await fetchRemote(c);
        const next = applyOps(f.rows, ops);
        const r = await gh(FILES[c], { method: "PUT", body: JSON.stringify({
          message: "Timeline edit on GitHub by " + who + ": " + describe(c, ops), content: toB64(JSON.stringify(next, null, 1) + "\n"), branch: BRANCH, ...(f.sha ? { sha: f.sha } : {}) }) });
        if (r.ok) { rows[c] = next; done = true; }
        else if (r.status !== 409 && r.status !== 422) throw new Error("GitHub said " + r.status);
      }
      if (!done) throw new Error("someone else kept saving at the same time");
      emit(c);
      status("Saved to GitHub as " + who + ". This page shows it to others in about a minute, and the Claude artifact within the hour.");
    } catch (e) {
      pending[c] = ops.concat(pending[c]); emit(c);
      status("Couldn't save to GitHub (" + (e.message || e) + "). Your change is kept in this tab; make another edit or reload to retry.");
    }
    saving[c] = false;
    if (pending[c].length) { clearTimeout(timers[c]); timers[c] = setTimeout(() => flush(c), 1500); }
  }
  window.addEventListener("beforeunload", (e) => { if (pending.tasks.length || pending.kpis.length || saving.tasks || saving.kpis) { e.preventDefault(); e.returnValue = ""; } });

  // ---------- keep an open page up to date: others' adds, edits and deletes show without reloading ----------
  async function pull(c) {
    if (token) return (await fetchRemote(c)).rows;
    try {  // straight from the repo (fresher than the Pages copy, which can lag a few minutes)
      const r = await fetch(API + FILES[c] + "?ref=" + BRANCH, { cache: "no-store", headers: { Accept: "application/vnd.github.raw+json" } });
      if (r.ok) return await r.json();
    } catch (e) {}
    return await loadJson("data/" + c + ".json");
  }
  let refreshing = false, lastRefresh = Date.now();
  async function refresh() {
    if (refreshing || document.hidden || Date.now() - lastRefresh < 20000) return;
    refreshing = true; lastRefresh = Date.now();
    try {
      // Logged out: tasks only (GitHub allows about 60 reads an hour without a login); logged in: tasks and KPIs
      for (const c of token ? Object.keys(FILES) : ["tasks"]) {
        if (pending[c].length || saving[c]) continue;   // don't overwrite an edit that is still saving
        const next = await pull(c);
        if (Array.isArray(next) && JSON.stringify(next) !== JSON.stringify(rows[c])) { rows[c] = next; emit(c); }
      }
    } catch (e) {}
    refreshing = false;
  }
  ready.then(() => setInterval(refresh, token ? 45000 : 180000));
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
  window.addEventListener("focus", refresh);

  // ---------- the db and user stand-ins the page uses ----------
  const stamp = (d) => ({ ...d, updatedAt: Date.now() });
  const docRef = (path) => {
    const [c, id] = path.split("/"); const ok = c in FILES;
    return { id, path,
      get: async () => { await ready; const r = ok ? current(c).find((x) => x.id === id) : null; return { id, exists: !!r, data: () => (r ? r.data : undefined), metadata: meta0 }; },
      set: (data) => (ok ? queue(c, { op: "set", id, data: stamp(data) }) : Promise.reject({ code: "invalid_argument", message: "Not available on GitHub." })),
      update: (data) => (ok ? queue(c, { op: "update", id, data: stamp(data) }) : Promise.resolve()),
      delete: () => (ok ? queue(c, { op: "delete", id, at: Date.now() }) : Promise.resolve()) };
  };
  const newId = () => "gh-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
  const collRef = (c) => ({ path: c,
    doc: (id) => docRef(c + "/" + (id || newId())),
    add: async (data) => { const ref = docRef(c + "/" + newId()); await ref.set(data); return ref; },
    where() { return this; }, orderBy() { return this; }, limit() { return this; },
    get: async () => { await ready; return snap(c in FILES ? current(c) : []); },
    onSnapshot: (next) => { if (!(c in FILES)) return () => {}; listeners[c].add(next); ready.then(() => { next(snap(current(c))); setTimeout(note, 0); }); return () => listeners[c].delete(next); } });
  const db = { doc: docRef, collection: collRef };
  const user = {
    can: async () => { await ready; return !!token; },
    canEdit: async () => { await ready; return !!token; },
    isOwner: async () => { await ready; return !!token && who === "Ryan"; },
    id: async () => { await ready; return token ? IDS[who] : null; },
    me: async () => ({ name: token ? who : "" }),
    profiles: async (ids) => { await ready; const o = {}; ids.forEach((i) => { if (people[i]) o[i] = { name: people[i] }; }); return o; } };
  window.claude = { use: async (name) => (name === "db" ? db : name === "user" ? user : null) };

  // ---------- log in / log out, page notes ----------
  function note() {
    if (token) { status("Logged in on GitHub as " + who + ". Changes save to GitHub and reach the Claude artifact within the hour."); return; }
    const when = meta && meta.snapshotAt ? new Date(meta.snapshotAt).toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
    status("GitHub copy" + (when ? ", synced " + when : "") + ". " + (editKey ? "Log in to add or edit tasks." : "Read-only until the owner sets up editing."));
  }
  function modal(html) {
    const wrap = document.createElement("div"); wrap.className = "modal-back"; wrap.innerHTML = '<form class="modal gh-modal">' + html + "</form>";
    document.body.append(wrap);
    const close = () => { wrap.remove(); if (location.hash === "#setup-editing") history.replaceState(null, "", location.pathname); };
    wrap.addEventListener("click", (e) => { if (e.target === wrap) close(); });
    wrap.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } });
    wrap.querySelector("[data-cancel]").onclick = close;
    wrap.querySelectorAll('input[type="password"]').forEach(addReveal);
    return { wrap, form: wrap.querySelector("form"), close, err: (t, ok) => { const m = wrap.querySelector(".msg"); m.textContent = t; m.className = "msg" + (ok ? "" : " err"); } };
  }
  // Show/Hide button inside a password field
  function addReveal(input) {
    const box = document.createElement("span"); box.className = "pw-box";
    input.replaceWith(box); box.append(input);
    const b = document.createElement("button"); b.type = "button"; b.className = "pw-eye";
    const sync = () => { const shown = input.type === "text"; b.textContent = shown ? "Hide" : "Show"; b.setAttribute("aria-pressed", shown); b.setAttribute("aria-label", (shown ? "Hide" : "Show") + " password"); };
    b.onclick = () => { input.type = input.type === "password" ? "text" : "password"; sync(); input.focus(); };
    b.addEventListener("mousedown", (e) => e.preventDefault()); // keep the cursor in the field
    sync(); box.append(b);
  }
  function openLogin() {
    const names = PEOPLE.filter((p) => editKey && editKey.people[p]);
    const m = modal('<h2>Log in to edit</h2><p>Pick your name and enter your edit password. Ryan sets the passwords.</p>' +
      '<label>Who are you<select id="gh-who">' + names.map((p) => `<option>${p}</option>`).join("") + "</select></label>" +
      '<label>Edit password<input type="password" id="gh-pw" autocomplete="current-password" required></label>' +
      '<p class="msg" role="alert"></p><div class="modal-acts"><button class="btn ghost" type="button" data-cancel>Cancel</button><button class="btn" type="submit">Log in</button></div>');
    try { const last = ls.get("tl26-gh-last"); if (names.includes(last)) m.form.querySelector("#gh-who").value = last; } catch (e) {}
    m.form.querySelector("#gh-pw").focus();
    m.form.onsubmit = async (e) => {
      e.preventDefault();
      const p = m.form.querySelector("#gh-who").value, pw = m.form.querySelector("#gh-pw").value;
      m.err("Checking…", true);
      let t;
      try { t = await unseal(pw, editKey.people[p], editKey.iter); } catch (x) { m.err("That password isn't right for " + p + ". Try again."); return; }
      const r = await gh("", {}, t).catch(() => null);
      if (!r || !r.ok) { m.err("The password is right, but GitHub refused the saved access (" + (r ? r.status : "offline") + "). Ryan needs to set editing up again."); return; }
      ls.set(TOK, t); ls.set(WHO, p); ls.set("tl26-gh-last", p);
      location.reload();
    };
  }
  function logout() {
    if (pending.tasks.length || pending.kpis.length) { status("Still saving your last change. Try logging out again in a moment."); return; }
    ls.del(TOK); ls.del(WHO); location.reload();
  }
  function openSetup() {
    const have = token && who === "Ryan" ? token : null, roadmap = ls.get("rm27-gh-token");
    const m = modal('<h2>Set up editing on GitHub</h2>' +
      '<p>Give each person an edit password. They unlock one GitHub token (Contents: Read and write on ' + REPO + ' only), which is encrypted with each password in this browser and saved to the repo. Passwords are never saved.</p>' +
      '<label>GitHub token<input type="password" id="gh-token" autocomplete="off" placeholder="' + (have ? "Leave empty to keep the current token" : roadmap ? "Leave empty to use the 2027 Roadmap token saved in this browser" : "github_pat_…") + '"></label>' +
      PEOPLE.map((p) => `<label>${p}'s password${p === "Ryan" ? " (admin)" : ""}<input type="password" data-pw="${p}" autocomplete="new-password" placeholder="${editKey && editKey.people[p] && have ? "Leave empty to keep" : p === "Ryan" ? "Required" : "Leave empty for no access"}"></label>`).join("") +
      '<p class="msg" role="alert"></p><div class="modal-acts"><button class="btn ghost" type="button" data-cancel>Cancel</button><button class="btn" type="submit">Save</button></div>');
    m.form.querySelector("#gh-token").focus();
    m.form.onsubmit = async (e) => {
      e.preventDefault();
      const typed = m.form.querySelector("#gh-token").value.trim(), t = typed || have || roadmap;
      if (!t) return m.err("Paste the GitHub token.");
      const keep = !typed && !!have && !!editKey; // same token as now: empty passwords keep the current ones
      const pws = {}; m.form.querySelectorAll("[data-pw]").forEach((i) => { if (i.value) pws[i.dataset.pw] = i.value; });
      if (Object.values(pws).some((v) => v.length < 6)) return m.err("Use passwords of at least 6 characters.");
      if (new Set(Object.values(pws)).size !== Object.keys(pws).length) return m.err("Give each person a different password.");
      if (!pws.Ryan && !(keep && editKey.people.Ryan)) return m.err("Set Ryan's password.");
      m.err("Checking the token…", true);
      try {
        const repo = await fetch("https://api.github.com/repos/" + REPO, { headers: { Accept: "application/vnd.github+json", Authorization: "Bearer " + t } });
        if (!repo.ok) throw new Error("GitHub refused the token (" + repo.status + ")");
        const out = {};
        for (const p of PEOPLE) { if (pws[p]) out[p] = await seal(pws[p], t); else if (keep && editKey.people[p]) out[p] = editKey.people[p]; }
        const body = { v: 2, kdf: "PBKDF2-SHA256", iter: 600000, people: out, setAt: new Date().toISOString() };
        const old = await gh(KEY_PATH + "?ref=" + BRANCH, {}, t); const sha = old.ok ? (await old.json()).sha : undefined;
        const r = await gh(KEY_PATH, { method: "PUT", body: JSON.stringify({ message: "Timeline: set up editing on GitHub (" + Object.keys(out).join(", ") + ")", content: toB64(JSON.stringify(body, null, 1) + "\n"), branch: BRANCH, ...(sha ? { sha } : {}) }) }, t);
        if (!r.ok) throw new Error("GitHub refused to save it (" + r.status + "). The token needs Contents: Read and write on " + REPO);
        ls.set(TOK, t); ls.set(WHO, "Ryan"); ls.set("tl26-gh-last", "Ryan");
        m.close(); location.reload();
      } catch (x) { m.err(x.message || String(x)); }
    };
  }
  document.addEventListener("DOMContentLoaded", () => {
    const st = document.createElement("style");
    st.textContent = ".gh-acct{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;font-size:13px}.gh-modal select{appearance:auto}" +
      ".pw-box{position:relative;display:block}.pw-box input{padding-right:64px}" +
      ".pw-eye{position:absolute;right:4px;top:50%;transform:translateY(-50%);appearance:none;border:0;background:var(--sunk);color:var(--fg);font:600 12px var(--font-body);text-transform:none;letter-spacing:0;padding:5px 9px;border-radius:6px;cursor:pointer}" +
      ".pw-eye:hover{background:var(--line)}.pw-eye:focus-visible{outline:2px solid var(--accent);outline-offset:1px}";
    document.head.append(st);
    ready.then(() => {
      const slot = document.querySelector(".hdr-acts");
      if (slot && (editKey || token)) {
        const b = document.createElement("button"); b.type = "button"; b.className = "btn ghost gh-acct";
        b.textContent = token ? "Log out (" + who + ")" : "Log in to edit";
        b.onclick = token ? logout : openLogin;
        slot.append(b);
      }
      if (location.hash === "#setup-editing") openSetup();
      note();
    });
  });
})();
