# County appraisal loader: downloads a county's public property data, builds address -> stories/areas/roof,
# posts it to the DFW Master System in chunks. Runs monthly in GitHub Actions. No secrets in the data.
import os, sys, io, csv, zipfile, json, time, requests
TOKEN = os.environ["CAD_LOADER_TOKEN"]; LOAD = "https://lhnjdzurujbwfhhybkcv.supabase.co/functions/v1/cad-load"
H = {"User-Agent": "Mozilla/5.0"}
def post(body):
    for i in range(4):
        r = requests.post(LOAD, json=body, headers={"x-worker-token": TOKEN}, timeout=120)
        if r.status_code == 200: return r.json()
        time.sleep(3 * (i + 1))
    raise SystemExit("load failed: %s %s" % (r.status_code, r.text[:200]))
def dallas():
    url = "https://www.dallascad.org/ViewPDFs.aspx?type=3&id=\\\\DCAD.ORG\\WEB\\WEBDATA\\WEBFORMS\\DATA PRODUCTS\\DCAD2026_CURRENT.ZIP"
    r = requests.get(url, headers=H, timeout=900, stream=True)
    with open("dcad.zip", "wb") as f:
        for c in r.iter_content(1 << 20): f.write(c)
    z = zipfile.ZipFile("dcad.zip")
    def rows(name, cols):
        with z.open(name) as fh:
            rd = csv.reader(io.TextIOWrapper(fh, encoding="latin-1", newline=""))
            hdr = next(rd); idx = [hdr.index(c) for c in cols]
            for row in rd:
                if len(row) >= len(hdr): yield [row[i] for i in idx]
    addr = {}
    for acct, num, street, city, zc in rows("ACCOUNT_INFO.CSV", ["ACCOUNT_NUM","STREET_NUM","FULL_STREET_NAME","PROPERTY_CITY","PROPERTY_ZIPCODE"]):
        if num.strip(): addr[acct] = (num.strip(), street.strip(), city.strip(), zc.strip()[:5])
    print("addresses", len(addr), flush=True)
    lid = post({"county": "dallas", "op": "begin"})["load_id"]; batch = []; n = 0
    for acct, cls, main_sf, living, stories, rtyp, rmat in rows("RES_DETAIL.CSV", ["ACCOUNT_NUM","BLDG_CLASS_DESC","TOT_MAIN_SF","TOT_LIVING_AREA_SF","NUM_STORIES_DESC","ROOF_TYP_DESC","ROOF_MAT_DESC"]):
        a = addr.get(acct)
        if not a: continue
        batch.append([a[0], a[1], a[2], a[3], stories.strip(), main_sf.strip() or 0, living.strip() or 0, rtyp.strip(), rmat.strip(), cls.strip()]); n += 1
        if len(batch) >= 4000: post({"county": "dallas", "rows": batch}); batch = []; print("loaded", n, flush=True)
    if batch: post({"county": "dallas", "rows": batch})
    post({"county": "dallas", "op": "done", "load_id": lid, "rows": n}); print("dallas done", n)
if __name__ == "__main__":
    dallas()
