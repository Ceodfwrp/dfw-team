# Lynx order robot: logs into AccuLynx as the Command Center user, opens each queued material order's job,
# and works through Order Materials -> ABC Supply. Every step is screenshotted back to the Master System so
# the flow can be finished and verified. Runs on the cloud runner every 15 minutes. Stops quietly until the login exists.
import os, sys, json, base64, time, requests
API = "https://lhnjdzurujbwfhhybkcv.supabase.co/functions/v1/lynx-robot-api"
TOKEN = os.environ["LYNX_ROBOT_TOKEN"]
def api(body):
    r = requests.post(API, json=body, headers={"x-worker-token": TOKEN}, timeout=60); r.raise_for_status(); return r.json()
w = api({"action": "work"})
if not w.get("ready"):
    print("not ready:", w.get("reason")); sys.exit(0)
orders = w.get("orders") or []
if not orders:
    print("no queued orders"); sys.exit(0)
from playwright.sync_api import sync_playwright
def shot(page, order, step, note=""):
    png = page.screenshot(full_page=False)
    api({"action": "shot", "order_id": order["id"], "job_number": order["job_number"], "step": step, "note": note, "png_b64": base64.b64encode(png).decode()})
with sync_playwright() as p:
    b = p.chromium.launch(headless=True); ctx = b.new_context(viewport={"width": 1400, "height": 950}); page = ctx.new_page()
    page.goto("https://my.acculynx.com/", wait_until="domcontentloaded"); time.sleep(2)
    try:
        page.fill("input[type=email], input[name*=mail], input[name*=user]", w["email"]); page.fill("input[type=password]", w["password"]); page.keyboard.press("Enter"); page.wait_for_load_state("networkidle", timeout=60000)
    except Exception as ex:
        print("login step:", ex)
    for o in orders:
        try:
            page.goto("https://my.acculynx.com/jobs/" + o["source_job_id"], wait_until="domcontentloaded"); time.sleep(3)
            shot(page, o, "job_open", "Job page after login")
            # Find the material ordering entry point; capture what the page offers so the flow can be completed.
            cands = page.locator("text=/order materials|material order|abc supply|supplier/i")
            n = cands.count(); shot(page, o, "find_order_tool", f"{n} candidate link(s) for ordering")
            if n:
                cands.first.click(); time.sleep(3); shot(page, o, "order_tool_open", "Ordering screen")
            api({"action": "result", "order_id": o["id"], "ok": False, "ref": "mapping"})
        except Exception as ex:
            try: shot(page, o, "error", str(ex)[:500])
            except Exception: pass
            api({"action": "result", "order_id": o["id"], "ok": False, "ref": "error"})
    b.close()
