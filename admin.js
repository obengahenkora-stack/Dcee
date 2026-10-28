// Admin page: software, assets, faults, usage, users and backups.
let ME;
const TABS = {
  software: ["Software", tabSoftware],
  assets: ["Assets", tabAssets],
  tickets: ["Faults", tabTickets],
  usage: ["Usage", tabUsage],
  users: ["Users", tabUsers],
  backups: ["Backups", tabBackups],
};

(async () => {
  ME = await requireUser(true);
  if (!ME) return;
  show("software");
})();

function show(key) {
  const tabs = document.getElementById("tabs");
  tabs.replaceChildren(...Object.entries(TABS).map(([k, [label]]) =>
    h("button", { class: k === key ? "on" : "", onclick: () => show(k) }, label)));
  TABS[key][1](document.getElementById("view"));
}

// A small form: fields = [id, label, type, required]. onSave gets an object of values.
function form(fields, submitText, onSave) {
  const msgId = "m" + Math.random().toString(36).slice(2);
  const inputs = {};
  const f = h("form", { class: "card" },
    h("div", { class: "grid" }, fields.map(([id, label, type, req]) => {
      const input = h("input", { type: type || "text", id: msgId + id });
      if (req) input.required = true;
      inputs[id] = input;
      return h("div", {}, h("label", { for: msgId + id }, label), input);
    })),
    h("button", { type: "submit" }, submitText),
    h("p", { class: "msg", id: msgId })
  );
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const values = {};
    for (const [id] of fields) values[id] = inputs[id].value.trim() || null;
    const err = await onSave(values);
    if (err) say(msgId, err.message, false);
    else { f.reset(); say(msgId, "Saved.", true); }
  });
  return f;
}

async function tabSoftware(view) {
  const load = async () => {
    const { data, error } = await sb.from("software").select("*").order("name");
    if (error) return list.replaceChildren(h("p", { class: "msg bad" }, error.message));
    const soon = Date.now() + 30 * 864e5;
    list.replaceChildren(table(["Name", "Licence", "Seats", "Expires", "Host", "Active", ""],
      data.map((s) => [
        s.name + (s.version ? " " + s.version : ""), s.licence_type || "", s.seats,
        s.expiry_date ? (new Date(s.expiry_date) < new Date() ? "EXPIRED " : new Date(s.expiry_date) < soon ? "Soon: " : "") + s.expiry_date : "",
        s.host_machine || "", s.active ? "yes" : "no",
        h("button", { class: "ghost", onclick: async () => {
          await sb.from("software").update({ active: !s.active }).eq("id", s.id); load();
        } }, s.active ? "Disable" : "Enable"),
      ])));
  };
  const list = h("div", { class: "card" });
  view.replaceChildren(
    form([["name", "Name", "text", true], ["version", "Version"], ["vendor", "Vendor"],
      ["licence_type", "Licence type"], ["seats", "Seats", "number", true],
      ["expiry_date", "Expiry date", "date"], ["host_machine", "Host machine"]],
      "Add software", async (v) => {
        v.seats = Number(v.seats);
        const { error } = await sb.from("software").insert(v);
        if (!error) load();
        return error;
      }),
    list);
  load();
}

async function tabAssets(view) {
  const load = async () => {
    const { data, error } = await sb.from("assets").select("*").order("name");
    if (error) return list.replaceChildren(h("p", { class: "msg bad" }, error.message));
    list.replaceChildren(table(["Name", "Type", "Serial", "Location", "Condition", "Next service"],
      data.map((a) => [a.name, a.asset_type || "", a.serial_number || "", a.location || "", a.condition || "", a.next_service || ""])));
  };
  const list = h("div", { class: "card" });
  view.replaceChildren(
    form([["name", "Name", "text", true], ["asset_type", "Type (PC, UPS, switch...)"], ["serial_number", "Serial number"],
      ["location", "Location"], ["condition", "Condition"], ["next_service", "Next service", "date"]],
      "Add asset", async (v) => {
        const { error } = await sb.from("assets").insert(v);
        if (!error) load();
        return error;
      }),
    list);
  load();
}

async function tabTickets(view) {
  const box = h("div", { class: "card" });
  view.replaceChildren(box);
  const { data, error } = await sb.from("tickets")
    .select("id,description,status,created_at,software(name),reporter:profiles!tickets_reporter_id_fkey(full_name,student_id)")
    .order("created_at", { ascending: false }).limit(200);
  if (error) return box.replaceChildren(h("p", { class: "msg bad" }, error.message));
  if (!data.length) return box.replaceChildren(h("p", { class: "muted" }, "No fault reports."));
  box.replaceChildren(table(["Sent", "From", "Software", "Problem", "Status"],
    data.map((t) => {
      const sel = h("select", { onchange: async () => {
        await sb.from("tickets").update({
          status: sel.value,
          closed_at: sel.value === "resolved" ? new Date().toISOString() : null,
        }).eq("id", t.id);
      } }, ["open", "in_progress", "resolved"].map((s) =>
        h("option", { value: s, ...(s === t.status ? { selected: "selected" } : {}) }, s.replace("_", " "))));
      return [fmt(t.created_at),
        t.reporter ? t.reporter.full_name + " (" + (t.reporter.student_id || "") + ")" : "",
        t.software ? t.software.name : "", t.description, sel];
    })));
}

async function tabUsage(view) {
  const box = h("div", {});
  view.replaceChildren(box);
  const { data: bookings, error } = await sb.from("bookings")
    .select("starts_at,ends_at,status,software(name),user:profiles!bookings_user_id_fkey(full_name)")
    .order("starts_at", { ascending: false }).limit(200);
  if (error) return box.replaceChildren(h("p", { class: "msg bad" }, error.message));
  const counts = {};
  bookings.filter((b) => b.status === "booked").forEach((b) => {
    const n = b.software ? b.software.name : "?";
    counts[n] = (counts[n] || 0) + 1;
  });
  box.append(
    h("div", { class: "card" }, h("h2", {}, "Bookings per software (latest 200)"),
      Object.keys(counts).length
        ? table(["Software", "Bookings"], Object.entries(counts).sort((a, b) => b[1] - a[1]))
        : h("p", { class: "muted" }, "No bookings yet.")),
    h("div", { class: "card" }, h("h2", {}, "Recent bookings"),
      table(["Who", "Software", "Start", "End", "Status"],
        bookings.map((b) => [b.user ? b.user.full_name : "", b.software ? b.software.name : "", fmt(b.starts_at), fmt(b.ends_at), b.status]))));
}

async function tabUsers(view) {
  const box = h("div", { class: "card" });
  view.replaceChildren(box);
  const { data, error } = await sb.from("profiles").select("*").order("full_name");
  if (error) return box.replaceChildren(h("p", { class: "msg bad" }, error.message));
  const msg = h("p", { class: "msg", id: "users-msg" });
  const canEdit = ME.role === "super_admin";
  box.replaceChildren(
    h("p", { class: "muted" }, canEdit ? "You can change roles and deactivate accounts." : "Only a super admin can change roles."),
    table(["Name", "Student ID", "Role", "Active"],
      data.map((u) => {
        const role = h("select", { onchange: async () => {
          const { error: e } = await sb.from("profiles").update({ role: role.value }).eq("id", u.id);
          say("users-msg", e ? e.message : "Role updated.", !e);
        } }, ["student", "lecturer", "lab_admin", "super_admin"].map((r) =>
          h("option", { value: r, ...(r === u.role ? { selected: "selected" } : {}) }, r.replace("_", " "))));
        role.disabled = !canEdit;
        const act = h("input", { type: "checkbox", style: "width:auto", onchange: async () => {
          const { error: e } = await sb.from("profiles").update({ active: act.checked }).eq("id", u.id);
          say("users-msg", e ? e.message : "Account updated.", !e);
        } });
        act.checked = u.active; act.disabled = !canEdit;
        return [u.full_name || "", u.student_id || "", role, act];
      })),
    msg);
}

async function tabBackups(view) {
  const load = async () => {
    const { data, error } = await sb.from("backups").select("*").order("backup_date", { ascending: false }).limit(60);
    if (error) return list.replaceChildren(h("p", { class: "msg bad" }, error.message));
    list.replaceChildren(table(["Date", "What was copied", "Result"], data.map((b) => [b.backup_date, b.what || "", b.result || ""])));
  };
  const list = h("div", { class: "card" });
  view.replaceChildren(
    form([["backup_date", "Date", "date", true], ["what", "What was copied"], ["result", "Result (ok or failed)", "text", true]],
      "Log backup", async (v) => {
        const { error } = await sb.from("backups").insert(v);
        if (!error) load();
        return error;
      }),
    list);
  load();
}
