/* 2026 UX/UI Timelines – GitHub Pages runtime (read-only).
   Stands in for the Claude artifact's db and user capabilities so the same page runs on GitHub Pages.
   It reads the saved copies in data/ (tasks.json, kpis.json, people.json, meta.json) and never writes:
   tasks are added and edited in the Claude artifact, and sync/export.py refreshes these files. */
(function () {
  const loadJson = (p) => fetch(p, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  let data = { tasks: [], kpis: [] }, people = {}, meta = null;
  const ready = Promise.all([loadJson("data/tasks.json"), loadJson("data/kpis.json"), loadJson("data/people.json"), loadJson("data/meta.json")])
    .then(([t, k, p, m]) => { data.tasks = t || []; data.kpis = k || []; people = p || {}; meta = m; });
  const meta0 = { fromCache: false, hasPendingWrites: false };
  const snap = (rows) => ({ docs: rows.map((r) => ({ id: r.id, exists: true, data: () => r.data, metadata: meta0 })), size: rows.length, empty: !rows.length, docChanges: () => [], metadata: meta0 });
  const readOnly = () => Promise.reject({ code: "permission_denied", message: "This GitHub copy is read-only. Edit the timeline in Claude." });
  const note = () => {
    const el = document.getElementById("status"); if (!el) return;
    const when = meta && meta.snapshotAt ? new Date(meta.snapshotAt).toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
    el.textContent = "Read-only copy on GitHub" + (when ? ", saved " + when : "") + ". Tasks are added and edited in the Claude artifact.";
  };
  const docRef = (path) => { const [coll, id] = path.split("/"); return { id, path,
    get: async () => { await ready; const r = (data[coll] || []).find((x) => x.id === id); return { id, exists: !!r, data: () => (r ? r.data : undefined), metadata: meta0 }; },
    set: readOnly, update: readOnly, delete: readOnly }; };
  const collRef = (path) => ({ path, doc: (id) => docRef(path + "/" + (id || "new")), add: readOnly,
    where() { return this; }, orderBy() { return this; }, limit() { return this; },
    get: async () => { await ready; return snap(data[path] || []); },
    onSnapshot: (next) => { ready.then(() => { next(snap(data[path] || [])); setTimeout(note, 0); }); return () => {}; } });
  const db = { doc: docRef, collection: collRef };
  const user = { can: async () => false, canEdit: async () => false, isOwner: async () => false, id: async () => null, me: async () => ({}),
    profiles: async (ids) => { await ready; const o = {}; ids.forEach((i) => { if (people[i]) o[i] = { name: people[i] }; }); return o; } };
  window.claude = { use: async (name) => (name === "db" ? db : name === "user" ? user : null) };
})();
