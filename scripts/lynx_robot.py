# Lynx robot (cloud runner, GitHub Actions). Logs into AccuLynx as the DFW Command Center user and
#   * default mode  - runs one-off tasks from the Master System (password reset steps) and places queued material orders
#   * notes mode    - `python scripts/lynx_robot.py notes`: reads each due job's Communications page (job messages,
#                     texts, emails) and posts them to the lynx-notes-sync edge function (action=ingest), because the
#                     AccuLynx API v2 has no GET for job messages. Which jobs are due comes from action=jobs.
# Secrets: only LYNX_ROBOT_TOKEN (GitHub secret). The Lynx login, browser state and MFA code are fetched from the Master
# System through lynx-robot-api. Nothing secret is printed to the log.
import os, sys, json, base64, time, re, requests
API = "https://lhnjdzurujbwfhhybkcv.supabase.co/functions/v1/lynx-robot-api"
NOTES_API = "https://lhnjdzurujbwfhhybkcv.supabase.co/functions/v1/lynx-notes-sync"
TOKEN = os.environ["LYNX_ROBOT_TOKEN"]
LYNX = "https://my.acculynx.com"
def api(body):
    r = requests.post(API, json=body, headers={"x-worker-token": TOKEN}, timeout=60); r.raise_for_status(); return r.json()
def napi(action, body=None):
    r = requests.post(NOTES_API + "?action=" + action, json=body or {}, headers={"x-worker-token": TOKEN}, timeout=120); r.raise_for_status(); return r.json()
from playwright.sync_api import sync_playwright
def report(page, step, note="", order_id=None, job=""):
    try: png = base64.b64encode(page.screenshot()).decode()
    except Exception: png = ""
    txt = ""
    try: txt = page.inner_text("body")[:3000]
    except Exception: pass
    api({"action": "shot", "order_id": order_id, "job_number": job, "step": step, "note": (note + "\n--- page text ---\n" + txt + "\n--- url: " + page.url)[:4000], "png_b64": png})
def fields(page):
    out = []
    for i in page.locator("input").all()[:15]:
        try: out.append((i.get_attribute("type"), i.get_attribute("name"), i.get_attribute("id"), i.get_attribute("placeholder")))
        except Exception: pass
    return out

# ---------------------------------------------------------------- login (shared) ----------------------------------
def logged_in(page):
    try:
        if page.locator("input[type=password]").count(): return False
        return "/signin" not in page.url.lower() and "login" not in page.url.lower()
    except Exception: return False
def code_prompt(page):
    """AccuLynx asks for an emailed verification code on a browser it has not seen. Returns the input locator or None."""
    try:
        box = page.locator("input[autocomplete='one-time-code'], input[name*=code i], input[id*=code i], input[placeholder*=code i], input[aria-label*=code i]").first
        if box.count(): return box
        if page.locator("text=/verification code|security code|enter the code|verify your identity|one-time code/i").count():
            t = page.locator("input[type=text], input[type=tel], input[type=number]").first
            if t.count(): return t
    except Exception: pass
    return None
def wait_for_mfa_code(max_wait_s=240):
    """The code lands in the Command Center mailbox; the Master System exposes it as action=mfa once something files it
    (comp_private.settings key lynx_mfa_code - Blake or a mail watcher can set it). Polls, then gives up."""
    t0 = time.time()
    while time.time() - t0 < max_wait_s:
        try:
            c = (api({"action": "mfa"}) or {}).get("code")
            if c:
                code = re.sub(r"\D", "", str(c))
                if len(code) >= 4: api({"action": "mfa", "clear": True}); return code
        except Exception: pass
        time.sleep(15)
    return None
def login(page, ctx, email, password, label="login"):
    """Returns (ok, blocker). Saves the browser state on success so later runs skip the password and the device check."""
    page.goto(LYNX + "/", wait_until="domcontentloaded"); time.sleep(4)
    if logged_in(page): return True, None
    em = page.locator("input[type=email], input[name*=mail i], input[id*=mail i], input[name*=user i], input[type=text]").first
    pw = page.locator("input[type=password]").first
    if not (em.count() and pw.count()): report(page, label + "_no_form", "inputs: " + json.dumps(fields(page))); return False, "login_form_not_found"
    em.fill(email); pw.fill(password)
    try:
        rem = page.locator("input[type=checkbox]").first
        if rem.count() and not rem.is_checked(): rem.check()
    except Exception: pass
    btn = page.locator("button[type=submit], input[type=submit], button:has-text('Sign In'), button:has-text('Log In')").first
    if btn.count(): btn.click()
    else: page.keyboard.press("Enter")
    time.sleep(8)
    box = code_prompt(page)
    if box is not None:
        report(page, label + "_code_prompt", "AccuLynx asked for a verification code")
        code = wait_for_mfa_code()
        if not code: return False, "mfa_code_required"
        box.fill(code)
        try:
            trust = page.locator("input[type=checkbox]").first
            if trust.count() and not trust.is_checked(): trust.check()
        except Exception: pass
        b2 = page.locator("button[type=submit], button:has-text('Verify'), button:has-text('Continue'), button:has-text('Submit')").first
        if b2.count(): b2.click()
        else: page.keyboard.press("Enter")
        time.sleep(8)
    if page.locator("input[type=password]").count():
        report(page, label + "_failed", "still on the sign-in form (wrong password, locked, or a prompt we do not handle)")
        return False, "login_rejected"
    try: api({"action": "set_state", "state": ctx.storage_state()})
    except Exception: pass
    return True, None

# ---------------------------------------------------------------- notes mode --------------------------------------
NOTE_URL_RE = re.compile(r"message|communication|thread|note|sms|text|email|conversation|activity|feed|comment|graphql", re.I)
MAX_CAPTURE = 1_500_000
import datetime as _dt
REL_RE = re.compile(r"^(?:(\d+)\s+(minute|hour|day|week|month|year)s?\s+ago|(today|yesterday)|just now|a (minute|hour|day|week|month|year) ago)$", re.I)
def absolutize(at):
    """Lynx shows relative times for recent items; turn them into ISO so the server can order them."""
    if not at: return at
    m = REL_RE.match(str(at).strip())
    if not m: return at
    now = _dt.datetime.now(_dt.timezone.utc)
    if m.group(3): d = now if m.group(3).lower() == "today" else now - _dt.timedelta(days=1); return d.isoformat()
    n = int(m.group(1) or 1); unit = (m.group(2) or m.group(4) or "minute").lower()
    span = {"minute": 60, "hour": 3600, "day": 86400, "week": 604800, "month": 2629800, "year": 31557600}[unit]
    return (now - _dt.timedelta(seconds=n * span)).isoformat()
DOM_READ_JS = r"""
() => {
  // Generic read of the Communications page: find the smallest elements that carry a timestamp, climb to the message
  // card around each, and return author / time / body. The server dedupes and prefers the JSON captures; this is the
  // fallback and the source for the page_text sample.
  const dateRe = /(\d{1,2}\/\d{1,2}\/\d{2,4}(?:,?\s+\d{1,2}:\d{2}(?::\d{2})?\s*[AP]M)?|\d{1,2}:\d{2}\s*[AP]M|\b\d+\s+(?:minute|hour|day|week|month|year)s?\s+ago\b|\b(?:today|yesterday)\b)/i;
  const dateReG = new RegExp(dateRe.source, 'gi');
  const txt = el => (el.innerText || '').trim();
  const skip = new Set(['SCRIPT','STYLE','NOSCRIPT','SVG','PATH','HEAD','TITLE']);
  const hits = [];
  for (const el of document.querySelectorAll('body *')) {
    if (skip.has(el.tagName)) continue;
    const t = txt(el);
    if (t.length < 5 || t.length > 6000 || !dateRe.test(t)) continue;
    let inner = true;
    for (const c of el.children) { if (dateRe.test(txt(c))) { inner = false; break; } }
    if (inner) hits.push(el);
  }
  const hasHit = el => { for (const h of hits) if (el === h || el.contains(h)) return true; return false; };
  // a parent is a *list of messages* (stop climbing) when 2+ of its children each hold a timestamp plus real text
  const isList = p => { let n = 0; for (const c of p.children) if (hasHit(c) && txt(c).length > 40) n++; return n >= 2; };
  const root = document.querySelector('main') || document.body;
  const out = [], seenCards = new Set();
  for (const el of hits) {
    if (!root.contains(el) || el.closest('nav, footer, header')) continue;
    let card = el, up = 0;
    while (card.parentElement && card.parentElement !== document.body && card.parentElement !== root && up < 6) {
      const p = card.parentElement;
      if (txt(p).length < 8000 && !isList(p)) { card = p; up++; } else break;
    }
    if (seenCards.has(card)) continue; seenCards.add(card);
    const text = txt(card); const m = text.match(dateRe);
    const timeEl = card.querySelector('time[datetime], [title*=":"], abbr[title]');
    const atAttr = timeEl ? (timeEl.getAttribute('datetime') || timeEl.getAttribute('title')) : null;
    const lines = text.split(/\n+/).map(s => s.trim()).filter(Boolean);
    let author = null, bodyLines = lines;
    if (lines.length > 1 && dateRe.test(lines[0])) { author = lines[0].replace(dateReG, '').replace(/[\s\u2022|·,-]+$/, '').trim().slice(0, 120) || null; bodyLines = lines.slice(1); }
    else if (lines.length > 2 && dateRe.test(lines[1])) { author = lines[0].slice(0, 120); bodyLines = lines.slice(2); }
    const body = bodyLines.join('\n').trim();
    if (!body) continue;
    const key = card.getAttribute('data-id') || card.getAttribute('data-message-id') || card.getAttribute('id') || null;
    const hint = (card.className || '') + ' ' + (card.getAttribute('data-type') || '') + ' ' + (card.parentElement ? card.parentElement.className || '' : '');
    out.push({ at: atAttr || (m ? m[0] : null), at_text: m ? m[0] : null, author, body: body.slice(0, 20000), key: key && /^[0-9a-f-]{36}$/i.test(key) ? key : null,
               kind: /sms|text/i.test(hint) ? 'text' : (/mail/i.test(hint) ? 'email' : null) });
  }
  const seen = new Set(), uniq = [];
  for (const o of out) { const k = (o.author || '') + '|' + o.body.slice(0, 400); if (seen.has(k)) continue; seen.add(k); uniq.push(o); }
  return uniq.slice(0, 2000);
}
"""
SCROLL_JS = r"""
() => {
  // scroll the window and the tallest scrollable panel to the bottom; returns document text length as a progress signal
  window.scrollTo(0, document.body.scrollHeight);
  let best = null, h = 0;
  for (const el of document.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if (!/auto|scroll/.test(cs.overflowY)) continue;
    if (el.scrollHeight > el.clientHeight + 50 && el.scrollHeight > h) { h = el.scrollHeight; best = el; }
  }
  if (best) best.scrollTop = best.scrollHeight;
  return (document.body.innerText || '').length;
}
"""
def read_job(page, job, max_rounds):
    """Open the job's Communications page, pull in all history (scroll / load more), harvest the JSON the app loaded
    plus a DOM read, and return the ingest payload."""
    pending, captures, seen_urls = [], [], set()
    def on_response(resp):
        try:
            if resp.request.resource_type not in ("xhr", "fetch") or resp.status != 200: return
            if "json" not in (resp.headers.get("content-type") or "").lower(): return
            pending.append(resp)  # every JSON call the app makes while on this page; message-like URLs are sent first
        except Exception: pass
    page.on("response", on_response)
    try:
        page.goto(LYNX + "/jobs/" + job["source_job_id"] + "/communications", wait_until="domcontentloaded"); time.sleep(5)
        try: page.wait_for_load_state("networkidle", timeout=15000)
        except Exception: pass
        if not logged_in(page): return None, "session_lost"
        # the page may split Messages / Texts / Emails into tabs or filters: read the default view, then each tab
        views = [None]
        try:
            for t in page.locator("[role=tab], [class*=tab i] button, [class*=tab i] a, [class*=filter i] button").all()[:12]:
                lbl = (t.inner_text() or "").strip()
                if re.search(r"^(all|messages?|texts?|text messages|sms|emails?|notes?|activity|communications?)$", lbl, re.I) and lbl.lower() not in [v for v in views if v]: views.append(lbl.lower())
        except Exception: pass
        items, complete = [], True
        for v in views:
            if v:
                try:
                    tab = page.locator("[role=tab]:has-text('%s'), [class*=tab i] button:has-text('%s'), [class*=tab i] a:has-text('%s'), [class*=filter i] button:has-text('%s')" % (v, v, v, v)).first
                    if not (tab.count() and tab.is_visible()): continue
                    tab.click(); time.sleep(2.5)
                except Exception: continue
            last, still, rounds = -1, 0, 0
            for rounds in range(1, max_rounds + 1):
                try:
                    more = page.locator("button:has-text('Load More'), button:has-text('Show More'), button:has-text('View More'), a:has-text('Load More'), button:has-text('Older')").first
                    if more.count() and more.is_visible(): more.click(); time.sleep(2)
                except Exception: pass
                n = page.evaluate(SCROLL_JS); time.sleep(1.5)
                if n == last:
                    still += 1
                    if still >= 2: break
                else: still = 0
                last = n
            else: complete = False  # ran out of rounds while the page was still growing
            try:
                for it in (page.evaluate(DOM_READ_JS) or []):
                    if v and not it.get("kind"): it["kind"] = "text" if re.search(r"text|sms", v) else ("email" if "mail" in v else None)
                    items.append(it)
            except Exception: pass
            try: page.keyboard.press("Escape")
            except Exception: pass
        try: page.wait_for_load_state("networkidle", timeout=10000)
        except Exception: pass
        total = 0
        for r in sorted(pending, key=lambda r: 0 if NOTE_URL_RE.search(r.url) else 1):
            try:
                if r.url in seen_urls or len(captures) >= 30: continue
                body = r.text()
                if not body or len(body) > MAX_CAPTURE or total > 6_000_000: continue
                data = json.loads(body); seen_urls.add(r.url); total += len(body)
                captures.append({"url": r.url[:500], "kind": "xhr", "json": data})
            except Exception: pass
        for it in items:
            try: it["at"] = absolutize(it.get("at"))
            except Exception: pass
        try:
            sample = page.inner_text("main") if page.locator("main").count() else page.inner_text("body")
            captures.append({"url": page.url[:500], "kind": "page_text", "json": {"text": sample[:30000], "dom_items": len(items), "xhr": [c["url"] for c in captures][:30]}})
        except Exception: pass
        return {"source_job_id": job["source_job_id"], "job_number": job.get("job_number"), "complete": complete, "items": items, "captures": captures}, None
    finally:
        try: page.remove_listener("response", on_response)
        except Exception: pass
def run_notes(p):
    t_start = time.time(); budget_s = int(os.environ.get("NOTES_BUDGET_MIN", "40")) * 60
    max_jobs = int(os.environ.get("NOTES_MAX_JOBS", "40"))
    w = api({"action": "work"})
    if not w.get("ready"):
        napi("robot_status", {"ok": False, "note": "Lynx login not set in Connections", "blocker": "lynx_login_not_set"}); print("notes: lynx login not set"); return
    b = p.chromium.launch(headless=True)
    kw = {"viewport": {"width": 1400, "height": 950}}
    if isinstance(w.get("state"), dict) and w["state"].get("cookies"): kw["storage_state"] = w["state"]  # remembered browser: skips password + device check
    ctx = b.new_context(**kw); page = ctx.new_page()
    ok, blocker = login(page, ctx, w["email"], w["password"], "notes_login")
    if not ok:
        napi("robot_status", {"ok": False, "note": "login failed: " + str(blocker), "blocker": blocker}); print("notes: login failed:", blocker); b.close(); return
    got = napi("jobs", {"limit": max_jobs}); jobs = got.get("jobs") or []
    print("notes: plan", got.get("plan"), "jobs due", len(jobs))
    done, rows, failed, shots = 0, 0, 0, 0
    for j in jobs:
        if time.time() - t_start > budget_s: break
        try:
            payload, err = read_job(page, j, 6 if j.get("mode") == "incremental" and j.get("have_rows") else 60)
            if err:
                napi("ingest", {"source_job_id": j["source_job_id"], "job_number": j.get("job_number"), "error": err}); failed += 1
                if err == "session_lost":
                    ok, blocker = login(page, ctx, w["email"], w["password"], "notes_relogin")
                    if not ok: break
                continue
            if shots < 2: report(page, "notes_page", "job %s: %d dom items, %d captures" % (j.get("job_number"), len(payload["items"]), len(payload["captures"])), None, str(j.get("job_number") or "")); shots += 1
            res = napi("ingest", payload); done += 1; rows += int(res.get("rows") or 0)
            print("notes: job", j.get("job_number"), "->", res.get("rows"), "rows,", res.get("fresh"), "new")
        except Exception as ex:
            failed += 1
            try: napi("ingest", {"source_job_id": j["source_job_id"], "job_number": j.get("job_number"), "error": ("error: " + str(ex))[:200]})
            except Exception: pass
        time.sleep(3 + (done % 3))  # gentle on Lynx
    try: api({"action": "set_state", "state": ctx.storage_state()})
    except Exception: pass
    napi("robot_status", {"ok": failed == 0, "note": "read %d jobs, %d failed, %d rows" % (done, failed, rows), "jobs": done, "rows": rows})
    print("notes: done", done, "failed", failed, "rows", rows); b.close()

# ---------------------------------------------------------------- default mode (tasks + material orders) -----------
def run_task(page, task):
    mode = task.get("mode")
    if mode == "forgot":
        page.goto("https://my.acculynx.com/", wait_until="domcontentloaded"); time.sleep(5)
        report(page, "login_page", "inputs: " + json.dumps(fields(page)))
        link = page.locator("a:has-text('Forgot'), button:has-text('Forgot'), a:has-text('forgot'), a:has-text('Reset')").first
        if link.count(): link.click(); time.sleep(3)
        report(page, "forgot_page", "inputs: " + json.dumps(fields(page)))
        em = page.locator("input[type=email], input[name*=mail i], input[id*=mail i], input[name*=user i], input[type=text]").first
        if em.count():
            em.fill(task["email"]); time.sleep(1)
            btn = page.locator("button[type=submit], input[type=submit], button:has-text('Send'), button:has-text('Reset'), button:has-text('Submit'), button:has-text('Continue')").first
            if btn.count(): btn.click()
            else: page.keyboard.press("Enter")
            time.sleep(5); report(page, "forgot_submitted")
            return {"ok": True, "note": "forgot submitted"}
        return {"ok": False, "note": "no email field found"}
    if mode == "reset":
        page.goto(task["reset_url"], wait_until="domcontentloaded"); time.sleep(5)
        report(page, "reset_page", "inputs: " + json.dumps(fields(page)))
        pws = page.locator("input[type=password]")
        n = pws.count()
        if n == 0: return {"ok": False, "note": "no password fields"}
        for k in range(n): pws.nth(k).fill(task["new_password"]); time.sleep(0.5)
        btn = page.locator("button[type=submit], input[type=submit], button:has-text('Reset'), button:has-text('Save'), button:has-text('Submit'), button:has-text('Change')").first
        if btn.count(): btn.click()
        else: page.keyboard.press("Enter")
        time.sleep(6); report(page, "reset_submitted")
        # verify by logging in
        page.goto("https://my.acculynx.com/", wait_until="domcontentloaded"); time.sleep(4)
        em = page.locator("input[type=email], input[name*=mail i], input[name*=user i], input[type=text]").first
        pw = page.locator("input[type=password]").first
        if em.count() and pw.count():
            em.fill(task["email"]); pw.fill(task["new_password"]); page.keyboard.press("Enter"); time.sleep(8)
            report(page, "login_check")
            ok = "my.acculynx.com" in page.url and not page.locator("input[type=password]").count()
            if ok: api({"action": "set_creds", "email": task["email"], "password": task["new_password"]})
            return {"ok": ok, "note": "login " + ("worked" if ok else "did not work")}
        return {"ok": False, "note": "login form not found after reset"}
    if mode in ("login_check", "login_mfa"):
        ok, blocker = login(page, page.context, task["email"], task["password"], mode)
        report(page, mode)
        return {"ok": ok, "note": page.url if ok else str(blocker)}
    return {"ok": False, "note": "unknown mode"}
def run_default(p):
    b = p.chromium.launch(headless=True); ctx = b.new_context(viewport={"width": 1400, "height": 950}); page = ctx.new_page()
    t = api({"action": "task"}).get("task")
    if t:
        try: res = run_task(page, t)
        except Exception as ex: res = {"ok": False, "note": "error: " + str(ex)[:300]}
        api({"action": "task_done", "result": res}); print("task", t.get("mode"), "->", res.get("ok"), res.get("note"))
    else:
        w = api({"action": "work"})
        if not w.get("ready"): print("orders: not ready:", w.get("reason")); b.close(); sys.exit(0)
        orders = w.get("orders") or []
        if not orders: print("orders: none queued"); b.close(); sys.exit(0)
        page.goto("https://my.acculynx.com/", wait_until="domcontentloaded"); time.sleep(4)
        em = page.locator("input[type=email], input[name*=mail i], input[name*=user i], input[type=text]").first; pw = page.locator("input[type=password]").first
        if em.count() and pw.count(): em.fill(w["email"]); pw.fill(w["password"]); page.keyboard.press("Enter"); time.sleep(8)
        for o in orders:
            try:
                page.goto("https://my.acculynx.com/jobs/" + o["source_job_id"], wait_until="domcontentloaded"); time.sleep(4)
                report(page, "job_open", "", o["id"], o["job_number"])
                cands = page.locator("text=/order materials|material order|abc supply|supplier/i")
                n = cands.count(); report(page, "find_order_tool", f"{n} candidate(s)", o["id"], o["job_number"])
                if n: cands.first.click(); time.sleep(4); report(page, "order_tool_open", "", o["id"], o["job_number"])
                api({"action": "result", "order_id": o["id"], "ok": False, "ref": "mapping"})
            except Exception as ex:
                api({"action": "result", "order_id": o["id"], "ok": False, "ref": "error"})
    b.close()
with sync_playwright() as p:
    if len(sys.argv) > 1 and sys.argv[1] == "notes": run_notes(p)
    else: run_default(p)
