import os
import sqlite3
import asyncio
import httpx
from datetime import date, timedelta
from contextlib import asynccontextmanager
from fastapi import FastAPI, Query
from fastapi.responses import HTMLResponse, StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
import json

TRACKER_TOKEN = os.environ.get("TRACKER_TOKEN", "")
ORG_ID = os.environ.get("ORG_ID", "7405124")
QUEUES = ["POOLING", "DOSTAVKAPIKO", "UDOSTAVKA"]
DB_PATH = "/data/tracker.db"

ENTRY_STATUS = "180"   # analiticeskaaProrabotkaGotovo
V1_FROM = "180"        # → reviewofanalytics   (АрхКом)
V1_TO   = "151"
V2_FROM = "145"        # architecturealignment → naUtocnenii (ТА)
V2_TO   = "132"

# ── DB ────────────────────────────────────────────────────────────────────────

def get_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    return con

def init_db():
    con = get_db()
    con.executescript("""
        CREATE TABLE IF NOT EXISTS tasks (
            key         TEXT PRIMARY KEY,
            title       TEXT,
            queue       TEXT,
            created_at  TEXT
        );
        CREATE TABLE IF NOT EXISTS transitions (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            issue_key   TEXT NOT NULL,
            from_status TEXT,
            to_status   TEXT,
            ts          TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_trans_key ON transitions(issue_key);
        CREATE INDEX IF NOT EXISTS idx_trans_ts  ON transitions(ts);
        CREATE INDEX IF NOT EXISTS idx_trans_to  ON transitions(to_status);
        CREATE TABLE IF NOT EXISTS sync_log (
            queue       TEXT PRIMARY KEY,
            last_synced TEXT
        );
    """)
    con.commit()
    con.close()

# ── Tracker API ───────────────────────────────────────────────────────────────

def tracker_headers():
    return {
        "Authorization": f"OAuth {TRACKER_TOKEN}",
        "X-Org-ID": ORG_ID,
        "Content-Type": "application/json",
    }

# Semaphore: max 3 concurrent requests to Tracker to avoid 429
_sem = asyncio.Semaphore(3)

async def tracker_request(client: httpx.AsyncClient, method: str, path: str, body: dict = None):
    """Single Tracker request with retry + exponential backoff on 429/5xx."""
    url = f"https://api.tracker.yandex.net{path}"
    for attempt in range(6):
        async with _sem:
            try:
                if method == "GET":
                    r = await client.get(url, headers=tracker_headers())
                else:
                    r = await client.post(url, headers=tracker_headers(), json=body)
            except Exception as e:
                if attempt == 5:
                    raise
                await asyncio.sleep(2 ** attempt)
                continue

        if r.status_code == 429:
            wait = 2 ** (attempt + 1)   # 2, 4, 8, 16, 32, 64
            await asyncio.sleep(wait)
            continue
        if r.status_code >= 500:
            await asyncio.sleep(2 ** attempt)
            continue
        r.raise_for_status()
        return r.json()
    raise Exception(f"Failed after retries: {url}")

async def fetch_issues_page(client, queue, updated_from, page):
    data = await tracker_request(client, "POST",
        f"/v2/issues/_search?perPage=100&page={page}",
        {"filter": {"queue": queue, "type": "story",
                    "updatedAt": {"from": f"{updated_from}T00:00:00", "to": "2099-01-01T00:00:00"}}}
    )
    return data if isinstance(data, list) else []

async def fetch_changelog(client, key):
    """Fetch all IssueWorkflow changelog entries for an issue (sequential pages)."""
    all_entries = []
    page = 1
    while True:
        try:
            data = await tracker_request(client, "GET",
                f"/v2/issues/{key}/changelog?perPage=100&page={page}&type=IssueWorkflow"
            )
        except Exception:
            break
        if not isinstance(data, list) or not data:
            break
        all_entries.extend(data)
        if len(data) < 100:
            break
        page += 1
    return all_entries

# ── Sync logic ────────────────────────────────────────────────────────────────

def upsert_task(con, key, title, queue, created_at):
    con.execute(
        "INSERT INTO tasks(key,title,queue,created_at) VALUES(?,?,?,?) "
        "ON CONFLICT(key) DO UPDATE SET title=excluded.title",
        (key, title, queue, created_at)
    )

def save_transitions(con, key, entries):
    """Save only new transitions (avoid duplicates by ts+key+to_status)."""
    for e in entries:
        ts = e.get("updatedAt") or e.get("createdAt") or ""
        for f in e.get("fields", []):
            if f.get("field", {}).get("id") == "status":
                from_s = str(f.get("from", {}).get("id", ""))
                to_s   = str(f.get("to",   {}).get("id", ""))
                # deduplicate
                exists = con.execute(
                    "SELECT 1 FROM transitions WHERE issue_key=? AND ts=? AND to_status=?",
                    (key, ts, to_s)
                ).fetchone()
                if not exists:
                    con.execute(
                        "INSERT INTO transitions(issue_key,from_status,to_status,ts) VALUES(?,?,?,?)",
                        (key, from_s, to_s, ts)
                    )

async def sync_queue(client, queue, updated_from, send):
    """Sync one queue: fetch issues updated since updated_from, store transitions."""
    con = get_db()

    await send({"type": "progress", "msg": f"{queue}: загружаем список задач…", "pct": 5})

    # Fetch page 1 to get total
    page1 = await fetch_issues_page(client, queue, updated_from, 1)
    issues = list(page1)

    # Fetch remaining pages sequentially (avoid 429)
    if len(issues) == 100:
        page = 2
        while True:
            data = await fetch_issues_page(client, queue, updated_from, page)
            issues.extend(data)
            await asyncio.sleep(0.3)   # small pause between pages
            if len(data) < 100:
                break
            page += 1

    await send({"type": "progress", "msg": f"{queue}: {len(issues)} задач, загружаем историю…", "pct": 15})

    # Process changelogs in small batches of 5 with pause between batches
    BATCH = 5
    for i in range(0, len(issues), BATCH):
        chunk = issues[i:i + BATCH]
        changelogs = await asyncio.gather(*[fetch_changelog(client, iss["key"]) for iss in chunk])
        await asyncio.sleep(0.5)   # pause after each batch
        for iss, cl in zip(chunk, changelogs):
            upsert_task(con, iss["key"], iss.get("summary", "—"), queue, iss.get("createdAt", ""))
            save_transitions(con, iss["key"], cl)
        con.commit()

        pct = 15 + round((i + len(chunk)) / len(issues) * 70)
        await send({"type": "progress", "msg": f"{queue}: {i+len(chunk)}/{len(issues)}", "pct": pct})

    # Update sync_log
    con.execute(
        "INSERT INTO sync_log(queue,last_synced) VALUES(?,?) "
        "ON CONFLICT(queue) DO UPDATE SET last_synced=excluded.last_synced",
        (queue, date.today().isoformat())
    )
    con.commit()
    con.close()

# ── Query from DB ─────────────────────────────────────────────────────────────

def query_dashboard(date_from: str, date_to: str, queues: list[str]):
    con = get_db()

    queue_ph = ",".join("?" * len(queues))

    # Tasks that entered ENTRY_STATUS within [date_from, date_to]
    rows = con.execute(f"""
        SELECT DISTINCT t.issue_key, t.ts AS entry_ts,
               tk.title, tk.queue
        FROM transitions t
        JOIN tasks tk ON tk.key = t.issue_key
        WHERE t.to_status = ?
          AND substr(t.ts,1,10) >= ?
          AND substr(t.ts,1,10) <= ?
          AND tk.queue IN ({queue_ph})
    """, [ENTRY_STATUS, date_from, date_to, *queues]).fetchall()

    task_keys = [r["issue_key"] for r in rows]
    if not task_keys:
        con.close()
        return {"tasks": [], "queues": {q: {"tasks": []} for q in queues}, "dateFrom": date_from, "dateTo": date_to}

    # For each task count АрхКом and ТА transitions within period
    key_ph = ",".join("?" * len(task_keys))
    trans = con.execute(f"""
        SELECT issue_key,
               SUM(CASE WHEN from_status=? AND to_status=? AND substr(ts,1,10)>=? AND substr(ts,1,10)<=? THEN 1 ELSE 0 END) as v1n,
               SUM(CASE WHEN from_status=? AND to_status=? AND substr(ts,1,10)>=? AND substr(ts,1,10)<=? THEN 1 ELSE 0 END) as v2n
        FROM transitions
        WHERE issue_key IN ({key_ph})
        GROUP BY issue_key
    """, [V1_FROM, V1_TO, date_from, date_to,
          V2_FROM, V2_TO, date_from, date_to,
          *task_keys]).fetchall()

    cuts = {r["issue_key"]: {"v1n": r["v1n"] or 0, "v2n": r["v2n"] or 0} for r in trans}

    tasks = []
    queues_out = {q: {"tasks": []} for q in queues}
    for r in rows:
        key = r["issue_key"]
        c = cuts.get(key, {"v1n": 0, "v2n": 0})
        task = {
            "key": key,
            "title": r["title"] or "—",
            "url": f"https://tracker.yandex.ru/{key}",
            "queue": r["queue"],
            "entryDate": (r["entry_ts"] or "")[:10],
            "v1n": c["v1n"],
            "v2n": c["v2n"],
            "total": c["v1n"] + c["v2n"],
        }
        tasks.append(task)
        if r["queue"] in queues_out:
            queues_out[r["queue"]]["tasks"].append(task)

    con.close()
    return {"tasks": tasks, "queues": queues_out, "dateFrom": date_from, "dateTo": date_to}

def get_sync_info():
    con = get_db()
    rows = con.execute("SELECT queue, last_synced FROM sync_log").fetchall()
    con.close()
    return {r["queue"]: r["last_synced"] for r in rows}

# ── FastAPI ───────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield

app = FastAPI(lifespan=lifespan)

@app.get("/sync-info")
async def sync_info():
    return get_sync_info()

@app.get("/sync")
async def sync(
    full: bool = Query(False),
    queues: str = Query("POOLING,DOSTAVKAPIKO,UDOSTAVKA")
):
    """SSE endpoint: sync tracker data into SQLite."""
    selected = [q for q in queues.split(",") if q in QUEUES]
    if not selected:
        selected = QUEUES

    async def generate():
        async def send(msg):
            yield f"data: {json.dumps(msg)}\n\n"

        # Determine updated_from per queue
        sync_info_data = get_sync_info()

        async with httpx.AsyncClient(timeout=30) as client:
            for qi, queue in enumerate(selected):
                if full or queue not in sync_info_data:
                    # Full sync: go back 2 years
                    updated_from = (date.today() - timedelta(days=730)).isoformat()
                else:
                    # Incremental: from last sync date
                    updated_from = sync_info_data[queue]

                # Use a local send queue
                msgs = []
                async def local_send(m):
                    msgs.append(m)

                # Run sync
                try:
                    async with httpx.AsyncClient(timeout=60) as cl:
                        # stream progress through a queue
                        q_msgs = asyncio.Queue()
                        async def _send(m):
                            await q_msgs.put(m)

                        task = asyncio.create_task(sync_queue(cl, queue, updated_from, _send))
                        while not task.done() or not q_msgs.empty():
                            try:
                                m = q_msgs.get_nowait()
                                yield f"data: {json.dumps(m)}\n\n"
                            except asyncio.QueueEmpty:
                                await asyncio.sleep(0.1)
                        await task
                        # drain
                        while not q_msgs.empty():
                            m = q_msgs.get_nowait()
                            yield f"data: {json.dumps(m)}\n\n"
                except Exception as e:
                    yield f"data: {json.dumps({'type':'error','msg':str(e)})}\n\n"
                    return

        yield f"data: {json.dumps({'type':'done'})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

@app.get("/data")
async def data(
    date_from: str = Query(None),
    date_to:   str = Query(None),
    queues:    str = Query("POOLING,DOSTAVKAPIKO,UDOSTAVKA")
):
    if not date_from:
        date_from = (date.today() - timedelta(days=30)).isoformat()
    if not date_to:
        date_to = date.today().isoformat()
    selected = [q for q in queues.split(",") if q in QUEUES]
    if not selected:
        selected = QUEUES
    result = query_dashboard(date_from, date_to, selected)
    return JSONResponse(result)

# ── Static files (React build) — MUST be last ─────────────────────────────────
# Catch-all: serve index.html for any unmatched route (React Router)
from fastapi.responses import FileResponse
import os as _os

@app.get("/{full_path:path}", include_in_schema=False)
async def spa_fallback(full_path: str):
    file = f"static/{full_path}"
    if _os.path.isfile(file):
        return FileResponse(file)
    return FileResponse("static/index.html")

app.mount("/assets", StaticFiles(directory="static/assets"), name="assets")
