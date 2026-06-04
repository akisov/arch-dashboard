import os
import asyncio
import httpx
from datetime import date, timedelta
from contextlib import asynccontextmanager
from fastapi import FastAPI, Query
from fastapi.responses import StreamingResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
import json

TRACKER_TOKEN = os.environ.get("TRACKER_TOKEN", "")
ORG_ID        = os.environ.get("ORG_ID", "7405124")
TURSO_URL     = os.environ.get("TURSO_URL", "").replace("libsql://", "https://")
TURSO_TOKEN   = os.environ.get("TURSO_TOKEN", "")

QUEUES       = ["POOLING", "DOSTAVKAPIKO", "UDOSTAVKA"]
ENTRY_STATUS = "180"   # analiticeskaaProrabotkaGotovo — задача пришла к техархам
V1_FROM, V1_TO = "180", "151"   # АрхКом: аналит.проработка готово → ревью аналитики
V2_FROM, V2_TO = "145", "175"   # ТА: согласование архитектуры → доработка (modification)

# Статусы, в которых задача считается «сейчас в Арх. комитете»
ARCH_STATUSES = {
    "180": "Аналитическая проработка готово",
    "151": "Ревью аналитики",
    "145": "Согласование архитектуры",
    "175": "Доработка",
}

# ── Turso HTTP client ─────────────────────────────────────────────────────────

async def turso_execute(statements: list[dict]) -> list:
    """Execute statements via Turso HTTP API. Returns list of result sets."""
    url = f"{TURSO_URL}/v2/pipeline"
    headers = {"Authorization": f"Bearer {TURSO_TOKEN}", "Content-Type": "application/json"}
    payload = {"requests": [{"type": "execute", "stmt": s} for s in statements]
               + [{"type": "close"}]}
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(url, headers=headers, json=payload)
        r.raise_for_status()
        data = r.json()
    results = []
    for item in data.get("results", []):
        if item.get("type") == "ok":
            results.append(item.get("response", {}).get("result", {}))
    return results

def stmt(sql: str, args: list = None) -> dict:
    """Build a Turso statement dict."""
    s: dict = {"sql": sql}
    if args:
        s["args"] = [_val(a) for a in args]
    return s

def _val(v):
    if v is None:
        return {"type": "null"}
    if isinstance(v, int):
        return {"type": "integer", "value": str(v)}
    return {"type": "text", "value": str(v)}

def rows_to_dicts(result: dict) -> list[dict]:
    """Convert Turso result set to list of dicts."""
    cols = [c["name"] for c in result.get("cols", [])]
    return [dict(zip(cols, [cell.get("value") for cell in row])) for row in result.get("rows", [])]

# ── DB init ───────────────────────────────────────────────────────────────────

async def init_db():
    await turso_execute([
        stmt("""CREATE TABLE IF NOT EXISTS tasks (
            key TEXT PRIMARY KEY, title TEXT, queue TEXT, created_at TEXT,
            issue_type TEXT, issue_type_display TEXT,
            status_key TEXT, status_display TEXT, assignee TEXT, status_start TEXT)"""),
        stmt("""CREATE TABLE IF NOT EXISTS transitions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            issue_key TEXT NOT NULL, from_status TEXT, to_status TEXT, ts TEXT NOT NULL)"""),
        stmt("CREATE INDEX IF NOT EXISTS idx_trans_key ON transitions(issue_key)"),
        stmt("CREATE INDEX IF NOT EXISTS idx_trans_ts  ON transitions(ts)"),
        stmt("CREATE INDEX IF NOT EXISTS idx_trans_to  ON transitions(to_status)"),
        stmt("""CREATE TABLE IF NOT EXISTS sync_log (
            queue TEXT PRIMARY KEY, last_synced TEXT)"""),
    ])
    # Миграция: добавляем колонки если их нет (игнорируем ошибку если уже есть)
    for col_sql in [
        "ALTER TABLE tasks ADD COLUMN issue_type TEXT",
        "ALTER TABLE tasks ADD COLUMN issue_type_display TEXT",
        "ALTER TABLE tasks ADD COLUMN status_key TEXT",
        "ALTER TABLE tasks ADD COLUMN status_display TEXT",
        "ALTER TABLE tasks ADD COLUMN assignee TEXT",
        "ALTER TABLE tasks ADD COLUMN status_start TEXT",
    ]:
        try:
            await turso_execute([stmt(col_sql)])
        except Exception:
            pass  # колонка уже существует

# ── Tracker API ───────────────────────────────────────────────────────────────

_sem = asyncio.Semaphore(3)

def tracker_headers():
    return {"Authorization": f"OAuth {TRACKER_TOKEN}", "X-Org-ID": ORG_ID, "Content-Type": "application/json"}

async def tracker_request(client: httpx.AsyncClient, method: str, path: str, body: dict = None):
    url = f"https://api.tracker.yandex.net{path}"
    for attempt in range(6):
        async with _sem:
            try:
                r = await client.get(url, headers=tracker_headers()) if method == "GET" \
                    else await client.post(url, headers=tracker_headers(), json=body)
            except Exception:
                if attempt == 5: raise
                await asyncio.sleep(2 ** attempt)
                continue
        if r.status_code == 429:
            wait = 5 * (2 ** attempt)  # 5, 10, 20, 40, 80 сек
            print(f"  [429] rate limit, ждём {wait}s...")
            await asyncio.sleep(wait)
            continue
        if r.status_code >= 500:
            wait = 3 * (2 ** attempt)
            print(f"  [5xx] {r.status_code}, ждём {wait}s...")
            await asyncio.sleep(wait)
            continue
        r.raise_for_status()
        return r.json()
    raise Exception(f"Failed after retries: {url}")

# Типы задач которые проходят через арх. комитет
ISSUE_TYPES = ["story", "analytics", "technicaldebt", "improvement", "elaboration"]

async def fetch_issues_page(client, queue, updated_from, page):
    data = await tracker_request(client, "POST",
        f"/v2/issues/_search?perPage=100&page={page}",
        {"filter": {"queue": queue, "type": ISSUE_TYPES,
                    "updatedAt": {"from": f"{updated_from}T00:00:00", "to": "2099-01-01T00:00:00"}}})
    return data if isinstance(data, list) else []

async def fetch_changelog(client, key):
    all_entries, page = [], 1
    while True:
        try:
            data = await tracker_request(client, "GET",
                f"/v2/issues/{key}/changelog?perPage=100&page={page}&type=IssueWorkflow")
        except Exception as e:
            print(f"  [WARN] changelog {key} page {page} failed: {e}")
            break
        if not isinstance(data, list) or not data:
            break
        all_entries.extend(data)
        if len(data) < 100:
            break
        page += 1
        await asyncio.sleep(0.2)   # пауза между страницами changelog
    return all_entries

# ── Sync logic ────────────────────────────────────────────────────────────────

async def sync_queue(client, queue, updated_from, send):
    await send({"type": "progress", "msg": f"{queue}: загружаем список задач…", "pct": 5})
    print(f"[{queue}] fetching issues updated since {updated_from}...")

    page1 = await fetch_issues_page(client, queue, updated_from, 1)
    issues = list(page1)
    if len(issues) == 100:
        page = 2
        while True:
            data = await fetch_issues_page(client, queue, updated_from, page)
            issues.extend(data)
            await asyncio.sleep(0.5)   # пауза между страницами задач
            if len(data) < 100:
                break
            page += 1

    print(f"[{queue}] total issues: {len(issues)}")
    await send({"type": "progress", "msg": f"{queue}: {len(issues)} задач, загружаем историю…", "pct": 15})

    # Батч 3 — меньше параллельных запросов, меньше 429
    BATCH = 3
    failed = 0
    for i in range(0, len(issues), BATCH):
        chunk = issues[i:i + BATCH]
        changelogs = await asyncio.gather(
            *[fetch_changelog(client, iss["key"]) for iss in chunk],
            return_exceptions=True
        )
        # пауза между батчами — 1 сек чтобы не словить 429
        await asyncio.sleep(1.0)

        stmts = []
        for iss, cl in zip(chunk, changelogs):
            key = iss["key"]
            if isinstance(cl, Exception):
                failed += 1
                print(f"  [FAIL] {key}: {cl}")
                continue
            itype = iss.get("type", {})
            status = iss.get("status", {}) or {}
            assignee = (iss.get("assignee") or {}).get("display", "")
            # Дата входа в текущий статус = ts последнего перехода статуса в changelog
            status_change_ts = [
                (e.get("updatedAt") or e.get("createdAt") or "")
                for e in cl
                for f in e.get("fields", [])
                if f.get("field", {}).get("id") == "status"
            ]
            status_start = max(status_change_ts) if status_change_ts else iss.get("createdAt", "")
            stmts.append(stmt(
                "INSERT INTO tasks(key,title,queue,created_at,issue_type,issue_type_display,status_key,status_display,assignee,status_start) "
                "VALUES(?,?,?,?,?,?,?,?,?,?) "
                "ON CONFLICT(key) DO UPDATE SET title=excluded.title, issue_type=excluded.issue_type, "
                "issue_type_display=excluded.issue_type_display, status_key=excluded.status_key, "
                "status_display=excluded.status_display, assignee=excluded.assignee, status_start=excluded.status_start",
                [key, iss.get("summary", "—"), queue, iss.get("createdAt", ""),
                 itype.get("key", ""), itype.get("display", ""),
                 str(status.get("id", "")), status.get("display", ""), assignee, status_start]
            ))
            for e in cl:
                ts = e.get("updatedAt") or e.get("createdAt") or ""
                for f in e.get("fields", []):
                    if f.get("field", {}).get("id") == "status":
                        from_s = str(f.get("from", {}).get("id", ""))
                        to_s   = str(f.get("to",   {}).get("id", ""))
                        stmts.append(stmt(
                            "INSERT INTO transitions(issue_key,from_status,to_status,ts) "
                            "SELECT ?,?,?,? WHERE NOT EXISTS ("
                            "SELECT 1 FROM transitions WHERE issue_key=? AND ts=? AND to_status=?)",
                            [key, from_s, to_s, ts, key, ts, to_s]
                        ))

        if stmts:
            await turso_execute(stmts)

        done = i + len(chunk)
        pct = 15 + round(done / len(issues) * 70)
        msg = f"{queue}: {done}/{len(issues)}"
        if failed:
            msg += f" ({failed} ошибок)"
        print(f"  {msg}")
        await send({"type": "progress", "msg": msg, "pct": pct})

        pct = 15 + round((i + len(chunk)) / len(issues) * 70)
        await send({"type": "progress", "msg": f"{queue}: {i+len(chunk)}/{len(issues)}", "pct": pct})

    await turso_execute([stmt(
        "INSERT INTO sync_log(queue,last_synced) VALUES(?,?) "
        "ON CONFLICT(queue) DO UPDATE SET last_synced=excluded.last_synced",
        [queue, date.today().isoformat()]
    )])

# ── Query ─────────────────────────────────────────────────────────────────────

async def query_dashboard(date_from: str, date_to: str, queues: list[str]):
    q_ph = ",".join("?" * len(queues))

    results = await turso_execute([
        stmt(f"""
            SELECT t.issue_key, MIN(t.ts) AS entry_ts, tk.title, tk.queue,
                   tk.issue_type, tk.issue_type_display
            FROM transitions t
            JOIN tasks tk ON tk.key = t.issue_key
            WHERE t.to_status = ?
              AND substr(t.ts,1,10) >= ?
              AND substr(t.ts,1,10) <= ?
              AND tk.queue IN ({q_ph})
            GROUP BY t.issue_key, tk.title, tk.queue, tk.issue_type, tk.issue_type_display
        """, [ENTRY_STATUS, date_from, date_to, *queues]),
    ])

    rows = rows_to_dicts(results[0]) if results else []
    task_keys = [r["issue_key"] for r in rows]

    if not task_keys:
        return {"tasks": [], "queues": {q: {"tasks": []} for q in queues},
                "dateFrom": date_from, "dateTo": date_to}

    key_ph = ",".join("?" * len(task_keys))
    cut_results = await turso_execute([stmt(f"""
        SELECT issue_key,
               SUM(CASE WHEN from_status=? AND to_status=? AND substr(ts,1,10)>=? AND substr(ts,1,10)<=? THEN 1 ELSE 0 END) as v1n,
               SUM(CASE WHEN from_status=? AND to_status=? AND substr(ts,1,10)>=? AND substr(ts,1,10)<=? THEN 1 ELSE 0 END) as v2n
        FROM transitions
        WHERE issue_key IN ({key_ph})
        GROUP BY issue_key
    """, [V1_FROM, V1_TO, date_from, date_to, V2_FROM, V2_TO, date_from, date_to, *task_keys])])

    cuts = {r["issue_key"]: {"v1n": int(r["v1n"] or 0), "v2n": int(r["v2n"] or 0)}
            for r in rows_to_dicts(cut_results[0])} if cut_results else {}

    tasks, queues_out = [], {q: {"tasks": []} for q in queues}
    for r in rows:
        key = r["issue_key"]
        c = cuts.get(key, {"v1n": 0, "v2n": 0})
        task = {
            "key": key,
            "title": r["title"] or "—",
            "url": f"https://tracker.yandex.ru/{key}",
            "queue": r["queue"],
            "issueType": r.get("issue_type") or "story",
            "issueTypeDisplay": r.get("issue_type_display") or "Story",
            "entryDate": (r["entry_ts"] or "")[:10],
            "v1n": c["v1n"], "v2n": c["v2n"],
            "total": c["v1n"] + c["v2n"],
        }
        tasks.append(task)
        if r["queue"] in queues_out:
            queues_out[r["queue"]]["tasks"].append(task)

    return {"tasks": tasks, "queues": queues_out, "dateFrom": date_from, "dateTo": date_to}

async def get_sync_info():
    results = await turso_execute([stmt("SELECT queue, last_synced FROM sync_log")])
    return {r["queue"]: r["last_synced"] for r in rows_to_dicts(results[0])} if results else {}

async def query_arch_current(queues: list[str]):
    """Задачи, которые сейчас находятся в одном из статусов Арх. комитета.
    Текущий статус определяем по последнему переходу в истории."""
    q_ph = ",".join("?" * len(queues))
    st_ph = ",".join("?" * len(ARCH_STATUSES))
    results = await turso_execute([stmt(f"""
        WITH latest AS (
            SELECT issue_key, to_status, ts,
                   ROW_NUMBER() OVER (PARTITION BY issue_key ORDER BY ts DESC, id DESC) AS rn
            FROM transitions
        )
        SELECT l.issue_key, l.to_status, l.ts AS latest_ts,
               tk.title, tk.queue, tk.issue_type, tk.issue_type_display,
               tk.assignee, tk.status_start, tk.status_display
        FROM latest l
        JOIN tasks tk ON tk.key = l.issue_key
        WHERE l.rn = 1
          AND l.to_status IN ({st_ph})
          AND tk.queue IN ({q_ph})
    """, [*ARCH_STATUSES.keys(), *queues])])

    rows = rows_to_dicts(results[0]) if results else []
    today = date.today()
    out = []
    for r in rows:
        started = (r.get("status_start") or r.get("latest_ts") or "")[:10]
        days = 0
        if started:
            try:
                days = max(0, (today - date.fromisoformat(started)).days)
            except ValueError:
                days = 0
        out.append({
            "key": r["issue_key"],
            "title": r["title"] or "—",
            "url": f"https://tracker.yandex.ru/{r['issue_key']}",
            "queue": r["queue"],
            "issueType": r.get("issue_type") or "story",
            "issueTypeDisplay": r.get("issue_type_display") or "Story",
            "status": ARCH_STATUSES.get(str(r["to_status"])) or r.get("status_display") or "—",
            "statusKey": str(r["to_status"]),
            "assignee": r.get("assignee") or "",
            "since": started,
            "daysInStatus": days,
        })
    out.sort(key=lambda t: t["daysInStatus"], reverse=True)
    return out

# ── FastAPI ───────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield

app = FastAPI(lifespan=lifespan)

@app.get("/sync-info")
async def sync_info():
    return await get_sync_info()

@app.get("/sync")
async def sync(full: bool = Query(False), queues: str = Query("POOLING,DOSTAVKAPIKO,UDOSTAVKA")):
    selected = [q for q in queues.split(",") if q in QUEUES] or QUEUES

    async def generate():
        async def send(msg):
            yield f"data: {json.dumps(msg)}\n\n"

        info = await get_sync_info()
        async with httpx.AsyncClient(timeout=60) as client:
            for qi, queue in enumerate(selected):
                updated_from = (date.today() - timedelta(days=730)).isoformat() \
                    if full or queue not in info else info[queue]
                q_msgs: asyncio.Queue = asyncio.Queue()

                async def _send(m, q=q_msgs):
                    await q.put(m)

                task = asyncio.create_task(sync_queue(client, queue, updated_from, _send))
                while not task.done() or not q_msgs.empty():
                    try:
                        m = q_msgs.get_nowait()
                        yield f"data: {json.dumps(m)}\n\n"
                    except asyncio.QueueEmpty:
                        await asyncio.sleep(0.1)
                await task
                while not q_msgs.empty():
                    yield f"data: {json.dumps(q_msgs.get_nowait())}\n\n"

        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

@app.get("/data")
async def data(date_from: str = Query(None), date_to: str = Query(None),
               queues: str = Query("POOLING,DOSTAVKAPIKO,UDOSTAVKA")):
    if not date_from:
        date_from = (date.today() - timedelta(days=30)).isoformat()
    if not date_to:
        date_to = date.today().isoformat()
    selected = [q for q in queues.split(",") if q in QUEUES] or QUEUES
    return JSONResponse(await query_dashboard(date_from, date_to, selected))

@app.get("/arch-current")
async def arch_current(queues: str = Query("POOLING,DOSTAVKAPIKO,UDOSTAVKA")):
    selected = [q for q in queues.split(",") if q in QUEUES] or QUEUES
    return JSONResponse(await query_arch_current(selected))

# ── Static (React build) ──────────────────────────────────────────────────────

import os as _os

@app.get("/{full_path:path}", include_in_schema=False)
async def spa_fallback(full_path: str):
    file = f"static/{full_path}"
    if _os.path.isfile(file):
        return FileResponse(file)
    return FileResponse("static/index.html")

app.mount("/assets", StaticFiles(directory="static/assets"), name="assets")
