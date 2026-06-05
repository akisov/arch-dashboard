import os
import re
import asyncio
import httpx
from datetime import date, datetime, timedelta, timezone

MSK = timezone(timedelta(hours=3))   # даты статусов в Трекере — по московскому времени
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

_TEST_RE = re.compile(r"\b(?:test|тест|тестов\w*)\b", re.IGNORECASE)

def is_test_task(title: str) -> bool:
    """Тестовые задачи: слово «тест»/«test» или «тестовый/тестовая/тестовое».
    «Тестирование», «документация» и т.п. — НЕ тестовые."""
    return bool(_TEST_RE.search(title or ""))

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
    # updated_from может быть датой ("2024-06-05") или полной меткой
    # ("2026-06-05T14:30:00") — для даты добавляем начало суток
    frm = updated_from if "T" in updated_from else f"{updated_from}T00:00:00"
    data = await tracker_request(client, "POST",
        f"/v2/issues/_search?perPage=100&page={page}",
        {"filter": {"queue": queue, "type": ISSUE_TYPES,
                    "updatedAt": {"from": frm, "to": "2099-01-01T00:00:00"}}})
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
        [queue, datetime.now(MSK).strftime("%Y-%m-%dT%H:%M:%S")]
    )])

# ── Query ─────────────────────────────────────────────────────────────────────

async def query_dashboard(date_from: str, date_to: str, queues: list[str]):
    """Событийная модель: считаем по дате самого перехода.
    Задача попадает в выборку, если в периоде у неё был хотя бы один из событий:
      • вход в комитет        (→ 180)
      • возврат АрхКома       (180 → 151)
      • возврат ТА            (145 → 175)
    Возвраты считаются независимо от того, когда задача пришла в комитет."""
    q_ph = ",".join("?" * len(queues))

    ev = await turso_execute([stmt(f"""
        SELECT tr.issue_key, tr.from_status AS frm, tr.to_status AS too,
               substr(tr.ts,1,10) AS d,
               tk.title, tk.queue, tk.issue_type, tk.issue_type_display
        FROM transitions tr
        JOIN tasks tk ON tk.key = tr.issue_key
        WHERE substr(tr.ts,1,10) >= ? AND substr(tr.ts,1,10) <= ?
          AND tk.queue IN ({q_ph})
          AND ( tr.to_status = ?
             OR (tr.from_status = ? AND tr.to_status = ?)
             OR (tr.from_status = ? AND tr.to_status = ?) )
    """, [date_from, date_to, *queues, ENTRY_STATUS, V1_FROM, V1_TO, V2_FROM, V2_TO])])

    rows = rows_to_dicts(ev[0]) if ev else []
    rows = [r for r in rows if not is_test_task(r.get("title"))]

    if not rows:
        return {"tasks": [], "queues": {q: {"tasks": []} for q in queues},
                "dateFrom": date_from, "dateTo": date_to}

    tmap: dict[str, dict] = {}
    for r in rows:
        k = r["issue_key"]
        t = tmap.get(k)
        if t is None:
            t = tmap[k] = {
                "key": k, "title": r["title"] or "—",
                "url": f"https://tracker.yandex.ru/{k}",
                "queue": r["queue"], "issueType": r.get("issue_type") or "story",
                "issueTypeDisplay": r.get("issue_type_display") or "Story",
                "entryDates": [], "v1Dates": [], "v2Dates": [],
            }
        frm, too, d = str(r["frm"]), str(r["too"]), r["d"]
        if too == ENTRY_STATUS:
            t["entryDates"].append(d)
        elif frm == V1_FROM and too == V1_TO:
            t["v1Dates"].append(d)
        elif frm == V2_FROM and too == V2_TO:
            t["v2Dates"].append(d)

    keys = list(tmap)
    key_ph = ",".join("?" * len(keys))

    # Полная история переходов — для времени прохождения комитета
    trans_results = await turso_execute([stmt(f"""
        SELECT issue_key, to_status, ts FROM transitions
        WHERE issue_key IN ({key_ph})
        ORDER BY ts ASC
    """, keys)])
    seq: dict[str, list] = {}
    for tr in rows_to_dicts(trans_results[0]) if trans_results else []:
        seq.setdefault(tr["issue_key"], []).append(tr)

    def cycle_days(key: str):
        items = seq.get(key, [])
        entry = next((t["ts"] for t in items if str(t["to_status"]) == ENTRY_STATUS), None)
        if not entry:
            return None
        exit_ts = next((t["ts"] for t in items
                        if t["ts"] > entry and str(t["to_status"]) not in ARCH_STATUSES), None)
        if not exit_ts:
            return None  # ещё в комитете
        try:
            return max(0, (date.fromisoformat(exit_ts[:10]) - date.fromisoformat(entry[:10])).days)
        except ValueError:
            return None

    tasks, queues_out = [], {q: {"tasks": []} for q in queues}
    for k, t in tmap.items():
        v1n, v2n = len(t["v1Dates"]), len(t["v2Dates"])
        entered = len(t["entryDates"]) > 0
        task = {
            **t,
            "entered": entered,
            "entryDate": sorted(t["entryDates"])[0] if entered else None,
            "v1n": v1n, "v2n": v2n, "total": v1n + v2n,
            "cycleDays": cycle_days(k),
        }
        tasks.append(task)
        if t["queue"] in queues_out:
            queues_out[t["queue"]]["tasks"].append(task)

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
    rows = [r for r in rows if not is_test_task(r.get("title"))]
    if not rows:
        return []

    # Сколько раз задачу возвращали (за всё время): АрхКом (V1) и ТА (V2)
    keys_all = [r["issue_key"] for r in rows]
    key_ph = ",".join("?" * len(keys_all))
    cut_results = await turso_execute([stmt(f"""
        SELECT issue_key,
               SUM(CASE WHEN from_status=? AND to_status=? THEN 1 ELSE 0 END) AS v1n,
               SUM(CASE WHEN from_status=? AND to_status=? THEN 1 ELSE 0 END) AS v2n
        FROM transitions
        WHERE issue_key IN ({key_ph})
        GROUP BY issue_key
    """, [V1_FROM, V1_TO, V2_FROM, V2_TO, *keys_all])])
    cuts = {r["issue_key"]: (int(r["v1n"] or 0), int(r["v2n"] or 0))
            for r in rows_to_dicts(cut_results[0])} if cut_results else {}

    # Живое обогащение из Трекера: исполнитель, актуальный статус и дата входа.
    # Инкрементальный синк не перезагружает задачи без изменений, поэтому
    # assignee в БД может отсутствовать — берём напрямую из Трекера.
    keys = [r["issue_key"] for r in rows]
    live: dict[str, dict] = {}
    if TRACKER_TOKEN:
        async def _fetch(client, key):
            try:
                return key, await tracker_request(client, "GET", f"/v2/issues/{key}")
            except Exception:
                return key, None
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                fetched = await asyncio.gather(*[_fetch(client, k) for k in keys])
            live = {k: iss for k, iss in fetched if iss}
        except Exception:
            live = {}

    today = datetime.now(MSK).date()
    out = []
    for r in rows:
        key = r["issue_key"]
        iss = live.get(key)
        if iss is not None:
            st = iss.get("status", {}) or {}
            st_id = str(st.get("id", ""))
            # Задача уже вышла из статусов Арх. комитета — не показываем
            if st_id and st_id not in ARCH_STATUSES:
                continue
            status_disp = ARCH_STATUSES.get(st_id) or st.get("display") or "—"
            status_key = st_id or str(r["to_status"])
            assignee = (iss.get("assignee") or {}).get("display", "") or ""
            started = (iss.get("statusStartTime") or r.get("status_start") or r.get("latest_ts") or "")[:10]
        else:
            status_key = str(r["to_status"])
            status_disp = ARCH_STATUSES.get(status_key) or r.get("status_display") or "—"
            assignee = r.get("assignee") or ""
            started = (r.get("status_start") or r.get("latest_ts") or "")[:10]

        # Трекер считает день входа в статус как 1-й день (включительно)
        days = 0
        if started:
            try:
                days = max(1, (today - date.fromisoformat(started)).days + 1)
            except ValueError:
                days = 0

        v1n, v2n = cuts.get(key, (0, 0))
        out.append({
            "key": key,
            "title": r["title"] or "—",
            "url": f"https://tracker.yandex.ru/{key}",
            "queue": r["queue"],
            "issueType": r.get("issue_type") or "story",
            "issueTypeDisplay": r.get("issue_type_display") or "Story",
            "status": status_disp,
            "statusKey": status_key,
            "assignee": assignee,
            "since": started,
            "daysInStatus": days,
            "v1n": v1n,
            "v2n": v2n,
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
                # Инкрементально — от точной метки последнего синка (чч:мм:сс),
                # чтобы тянуть только изменения и синк был быстрым
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
