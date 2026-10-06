# Lynx robot (cloud runner). Runs one-off tasks from the Master System (e.g. password reset steps) and places
# queued material orders inside Lynx. Reports page text/screenshots back. No secrets are printed to logs.
import os, sys, json, base64, time, re, requests
API = "https://lhnjdzurujbwfhhybkcv.supabase.co/functions/v1/lynx-robot-api"
TOKEN = os.environ["LYNX_ROBOT_TOKEN"]
def api(body):
    r = requests.post(API, json=body, headers={"x-worker-token": TOKEN}, timeout=60); r.raise_for_status(); return r.json()
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
    if mode == "login_check":
        w = api({"action": "work"})
        page.goto("https://my.acculynx.com/", wait_until="domcontentloaded"); time.sleep(4)
        em = page.locator("input[type=email], input[name*=mail i], input[name*=user i], input[type=text]").first; pw = page.locator("input[type=password]").first
        if em.count() and pw.count():
            em.fill(w["email"]); pw.fill(w["password"]); page.keyboard.press("Enter"); time.sleep(8); report(page, "login_check")
            return {"ok": not page.locator("input[type=password]").count(), "note": page.url}
        return {"ok": False, "note": "no login form"}
    return {"ok": False, "note": "unknown mode"}
with sync_playwright() as p:
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
