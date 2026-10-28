// Shared helpers for every page.
const CFG = window.LAB_CONFIG;
const sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);

// Build a DOM element. Text is always inserted as text, never as HTML.
function h(tag, attrs, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === "class") node.className = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const kid of kids.flat()) {
    if (kid == null) continue;
    node.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return node;
}

function say(id, text, ok) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text || "";
  el.className = "msg " + (text ? (ok ? "ok" : "bad") : "");
}

function fmt(dt) {
  return dt ? new Date(dt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "";
}

function table(headers, rows) {
  return h("div", { class: "table-wrap" },
    h("table", {},
      h("thead", {}, h("tr", {}, headers.map((x) => h("th", {}, x)))),
      h("tbody", {}, rows.map((r) => h("tr", {}, r.map((c) => h("td", {}, c)))))
    )
  );
}

const STAFF = ["lab_admin", "super_admin"];

// Make sure someone is signed in; send them to the login page if not.
async function requireUser(staffOnly) {
  const { data } = await sb.auth.getSession();
  if (!data.session) { location.href = "index.html"; return null; }
  const { data: profile } = await sb.from("profiles").select("*").eq("id", data.session.user.id).single();
  if (!profile || !profile.active) {
    await sb.auth.signOut();
    location.href = "index.html";
    return null;
  }
  if (staffOnly && !STAFF.includes(profile.role)) { location.href = "booking.html"; return null; }
  renderNav(profile);
  return profile;
}

function renderNav(profile) {
  const here = location.pathname.split("/").pop() || "index.html";
  const link = (href, text) => h("a", { href, class: here === href ? "on" : "" }, text);
  const nav = h("nav", {},
    h("span", { class: "brand" }, h("span", { class: "mark" }), CFG.LAB_NAME),
    link("booking.html", "Book a slot"),
    link("helpdesk.html", "Report a fault"),
    STAFF.includes(profile.role) ? link("admin.html", "Admin") : null,
    h("a", { href: CFG.GUACAMOLE_URL }, "Open lab software"),
    h("a", { href: "#", onclick: async (e) => { e.preventDefault(); await sb.auth.signOut(); location.href = "index.html"; } },
      "Sign out (" + (profile.full_name || "me") + ")")
  );
  const holder = document.getElementById("nav");
  holder.replaceChildren(nav);
}
