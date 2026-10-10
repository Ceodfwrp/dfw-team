/* Shared helpers for the office desk pages (supps.html, billing.html, comms.html). Same sign-in token as the team app. */
window.DESK = (function () {
  "use strict";
  var API = "https://lhnjdzurujbwfhhybkcv.supabase.co/functions/v1/office-desks/api/";
  var LS = "dfw_team_token", TZ = "America/Chicago", FIVE = 5 * 60 * 1000;
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var token = function () { try { return localStorage.getItem(LS); } catch (e) { return null; } };
  var money = function (v) { v = +v || 0; return (v < 0 ? "-" : "") + "$" + Math.abs(Math.round(v)).toLocaleString("en-US"); };
  var cents = function (v) { v = +v || 0; return (v < 0 ? "-" : "") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  var stamp = function (s) { return s ? new Date(s).toLocaleString("en-US", { timeZone: TZ, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—"; };
  var day = function (s) { return s ? new Date(s).toLocaleDateString("en-US", { timeZone: TZ, weekday: "short", month: "numeric", day: "numeric" }) : "—"; };
  var dOnly = function (iso) { if (!iso) return "—"; return new Date(String(iso).slice(0, 10) + "T12:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", month: "numeric", day: "numeric", year: "2-digit" }); };
  var ago = function (s) { if (!s) return "never"; var d = Math.floor((Date.now() - new Date(s)) / 86400000); return d <= 0 ? "today" : d === 1 ? "yesterday" : d + " days ago"; };
  var plural = function (n, w) { return n + " " + w + (n === 1 ? "" : "s"); };
  var phone = function (p) { var d = String(p || "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, ""); return d.length === 10 ? d.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3") : String(p || ""); };
  var tel = function (p) { var d = String(p || "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, ""); return d.length === 10 ? "+1" + d : ""; };
  var opId = function () { var a = new Uint8Array(12); crypto.getRandomValues(a); return Array.from(a).map(function (b) { return b.toString(16).padStart(2, "0"); }).join(""); };
  async function api(action, body) {
    var tok = token(); if (!tok) throw new Error("signin");
    var r = await fetch(API + action, { method: "POST", headers: { "content-type": "application/json", "authorization": "Bearer " + tok }, body: JSON.stringify(body || {}) });
    var j = await r.json().catch(function () { return {}; });
    if (r.status === 401) throw new Error("signin"); if (r.status === 403) throw new Error("forbidden");
    if (!r.ok) throw new Error(j.detail || j.error || ("http_" + r.status)); return j;
  }
  function errorBox(e) {
    if (e === "signin") return '<div class="err">Your sign-in has expired. Sign out of the team app and back in, then open this page again.</div>';
    if (e === "forbidden") return '<div class="err">This desk is for the office and managers. Ask Blake if you need it.</div>';
    return '<div class="err">Couldn’t load (' + esc(e) + '). It will try again in 5 minutes. <button class="btn ghost" type="button" data-retry>Try now</button></div>';
  }
  // Load now, every 5 minutes while visible, and when the tab comes back after going stale.
  function poll(load) { var at = 0; var run = function () { at = Date.now(); load(); }; setInterval(function () { if (document.visibilityState === "visible") run(); }, FIVE); document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible" && Date.now() - at > FIVE) run(); }); run(); }
  var row = function (href, inner, right) { var a = !!href; return (a ? '<a class="row" href="' + esc(href) + '" target="_blank" rel="noopener">' : '<div class="row">') + "<div>" + inner + "</div>" + (right ? '<div class="r">' + right + "</div>" : "<div></div>") + (a ? "</a>" : "</div>"); };
  var title = function (x) { return (x.job_number ? '<span class="num">#' + esc(x.job_number) + "</span> " : "") + esc(x.customer || "Job"); };
  return { api: api, esc: esc, money: money, cents: cents, stamp: stamp, day: day, dOnly: dOnly, ago: ago, plural: plural, phone: phone, tel: tel, opId: opId, errorBox: errorBox, poll: poll, row: row, title: title };
})();
