import { useState, useEffect, useCallback } from "react"
import { RefreshCw, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/ui/theme-toggle"
import { Skeleton } from "@/components/ui/skeleton"
import { StatCard } from "@/components/StatCard"
import { FlowCard } from "@/components/FlowCard"
import { FunnelChart } from "@/components/FunnelChart"
import { TimelineChart } from "@/components/TimelineChart"
import { QueueBreakdown } from "@/components/QueueBreakdown"
import { TypeFilter } from "@/components/TypeFilter"
import { MonthlyChart } from "@/components/MonthlyChart"
import { TaskTable } from "@/components/TaskTable"
import { SyncBar } from "@/components/SyncBar"
import { SyncProgress } from "@/components/SyncProgress"
import { fetchDashboard, fetchSyncInfo, startSync } from "@/lib/api"
import type { DashboardData, SyncInfo } from "@/lib/types"
import { cn } from "@/lib/utils"

const QUEUES = ["ALL", "POOLING", "DOSTAVKAPIKO", "UDOSTAVKA"] as const
type Queue = typeof QUEUES[number]

function fmt(d: Date) { return d.toISOString().slice(0, 10) }

function plural(n: number) {
  const m10 = n % 10, m100 = n % 100
  if (m100 >= 11 && m100 <= 19) return "задач"
  if (m10 === 1) return "задача"
  if (m10 >= 2 && m10 <= 4) return "задачи"
  return "задач"
}

function initDates() {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 30)
  return { from: fmt(start), to: fmt(end) }
}

// Пресеты периодов
const PRESETS = [
  {
    label: "7 дней",
    getDates: () => { const e = new Date(), s = new Date(); s.setDate(s.getDate() - 7); return { from: fmt(s), to: fmt(e) } }
  },
  {
    label: "Месяц",
    getDates: () => { const e = new Date(), s = new Date(); s.setDate(s.getDate() - 30); return { from: fmt(s), to: fmt(e) } }
  },
  {
    label: "Пр. месяц",
    getDates: () => {
      const now = new Date()
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const e = new Date(now.getFullYear(), now.getMonth(), 0)  // последний день прошлого месяца
      return { from: fmt(s), to: fmt(e) }
    }
  },
  {
    label: "Квартал",
    getDates: () => { const e = new Date(), s = new Date(); s.setDate(s.getDate() - 90); return { from: fmt(s), to: fmt(e) } }
  },
]

export default function App() {
  const [dates, setDates] = useState(initDates)
  const [activePreset, setActivePreset] = useState("Месяц")
  const [queue, setQueue] = useState<Queue>("ALL")
  const [filter, setFilter] = useState("all")
  const [typeFilter, setTypeFilter] = useState("all")

  const [data, setData] = useState<DashboardData | null>(null)
  const [syncInfo, setSyncInfo] = useState<SyncInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncTitle, setSyncTitle] = useState("")
  const [syncMsg, setSyncMsg] = useState("")
  const [syncPct, setSyncPct] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [emptyDb, setEmptyDb] = useState(false)

  const loadSyncInfo = useCallback(async () => {
    try {
      const info = await fetchSyncInfo()
      setSyncInfo(info)
      return info
    } catch { return null }
  }, [])

  const load = useCallback(async (df = dates.from, dt = dates.to) => {
    setError(null)
    setEmptyDb(false)
    const info = await loadSyncInfo()
    const hasDb = info && Object.values(info).some(v => v)
    if (!hasDb) { setEmptyDb(true); setData(null); return }
    setLoading(true)
    try {
      const d = await fetchDashboard(df, dt)
      setData(d)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [dates, loadSyncInfo])

  const doSync = useCallback((full: boolean) => {
    setSyncing(true)
    setSyncPct(2)
    setSyncTitle(full ? "Полная синхронизация…" : "Инкрементальный синк…")
    setSyncMsg("Подключаемся к Трекеру…")
    const es = startSync(full, (msg: { type: string; msg?: string; pct?: number }) => {
      if (msg.type === "progress") { setSyncTitle(msg.msg ?? ""); setSyncPct(msg.pct ?? 0) }
      else if (msg.type === "done") {
        es.close(); setSyncing(false)
        loadSyncInfo().then(() => load())
      } else if (msg.type === "error") {
        es.close(); setSyncing(false)
        setError(msg.msg ?? "Ошибка синхронизации")
      }
    })
    es.onerror = () => { es.close(); setSyncing(false); setError("Ошибка соединения при синхронизации") }
  }, [load, loadSyncInfo])

  useEffect(() => { load() }, [])

  // Авто-обновление данных из БД каждые 30 минут (тихо, без спиннера)
  useEffect(() => {
    const interval = setInterval(() => {
      if (!syncing) load(dates.from, dates.to)
    }, 30 * 60 * 1000)
    return () => clearInterval(interval)
  }, [dates, syncing, load])

  // Derive view based on selected queue + type filter
  const viewByQueue = !data ? [] : queue === "ALL" ? data.tasks : (data.queues[queue]?.tasks ?? [])
  const view = typeFilter === "all" ? viewByQueue : viewByQueue.filter(t => t.issueType === typeFilter)

  // Counts per type for TypeFilter badges
  const typeCounts = { all: viewByQueue.length } as Record<string, number>
  for (const t of viewByQueue) {
    typeCounts[t.issueType] = (typeCounts[t.issueType] ?? 0) + 1
  }
  const total = view.length
  const v1tasks = view.filter((t) => t.v1n > 0).length
  const v2tasks = view.filter((t) => t.v2n > 0).length
  const both = view.filter((t) => t.v1n > 0 && t.v2n > 0).length
  const cuts = view.reduce((s, t) => s + t.total, 0)
  const v1cuts = view.reduce((s, t) => s + t.v1n, 0)
  const v2cuts = view.reduce((s, t) => s + t.v2n, 0)

  return (
    <div className="min-h-screen bg-background">
      {/* Topnav */}
      <header className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="max-w-screen-xl mx-auto px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center text-base">🏛</div>
            <div>
              <p className="text-sm font-bold leading-none">Арх. комитет</p>
              <p className="text-[11px] text-muted-foreground leading-none mt-0.5">Story · Аналитика · ТехДолг · Улучшение</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => doSync(false)} disabled={syncing}>
              <RefreshCw className="w-3.5 h-3.5" /> Синк
            </Button>
            <Button variant="ghost" size="sm" disabled={syncing}
              onClick={() => { if (confirm("Полный синк перезагрузит всю историю (5–15 мин). Продолжить?")) doSync(true) }}>
              <RotateCcw className="w-3.5 h-3.5" /> Полный
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="max-w-screen-xl mx-auto px-6 py-8 space-y-6">
        {/* Page header */}
        <div>
          <h1 className="text-3xl font-black tracking-tight text-foreground">Аналитика переходов</h1>
          <p className="text-sm text-muted-foreground mt-1">Story-задачи · POOLING · DOSTAVKAPIKO · UDOSTAVKA</p>
        </div>

        {/* Period controls — own row */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Presets */}
          <div className="flex gap-1 bg-card border border-border rounded-lg p-1">
            {PRESETS.map(p => (
              <button key={p.label}
                onClick={() => { const d = p.getDates(); setDates(d); setActivePreset(p.label); load(d.from, d.to) }}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-semibold transition-all whitespace-nowrap",
                  activePreset === p.label
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                )}>
                {p.label}
              </button>
            ))}
          </div>

          {/* Divider */}
          <div className="h-6 w-px bg-border" />

          {/* Date range */}
          <div className="flex items-center gap-1.5 bg-card border border-border rounded-lg px-3 h-9">
            <span className="text-xs text-muted-foreground whitespace-nowrap">с</span>
            <input type="date" value={dates.from}
              onChange={e => { setDates(d => ({ ...d, from: e.target.value })); setActivePreset("") }}
              className="bg-transparent border-none text-sm text-foreground outline-none w-[110px] [color-scheme:light] dark:[color-scheme:dark]" />
            <span className="text-muted-foreground text-xs">—</span>
            <span className="text-xs text-muted-foreground whitespace-nowrap">по</span>
            <input type="date" value={dates.to}
              onChange={e => { setDates(d => ({ ...d, to: e.target.value })); setActivePreset("") }}
              className="bg-transparent border-none text-sm text-foreground outline-none w-[110px] [color-scheme:light] dark:[color-scheme:dark]" />
          </div>

          <Button onClick={() => load(dates.from, dates.to)} disabled={loading || syncing}>
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
            Показать
          </Button>
        </div>

        {/* Sync info */}
        <SyncBar info={syncInfo} loading={!syncInfo} />

        {/* Error */}
        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            ⚠️ {error}
          </div>
        )}

        {/* Sync progress */}
        {syncing && <SyncProgress title={syncTitle} msg={syncMsg} pct={syncPct} hint="Загружаем историю переходов…" />}

        {/* Empty DB */}
        {!syncing && emptyDb && (
          <div className="rounded-xl border border-border bg-card p-16 text-center">
            <div className="text-5xl mb-5">🗄️</div>
            <h2 className="text-2xl font-black tracking-tight mb-3">База данных пустая</h2>
            <p className="text-sm text-muted-foreground mb-8 max-w-md mx-auto leading-relaxed">
              Данные из Яндекс Трекера ещё не загружены. Запустите полный синк — он загрузит историю переходов за 2 года и сохранит в базу. Следующие обновления займут секунды.
            </p>
            <Button size="lg" onClick={() => doSync(true)} className="text-base h-12 px-8">
              <RotateCcw className="w-4 h-4" /> Запустить полный синк
            </Button>
            <p className="text-xs text-muted-foreground mt-4">Займёт 5–15 минут · Один раз</p>
          </div>
        )}

        {/* Dashboard */}
        {!syncing && !emptyDb && (
          <>
            {/* Queue tabs */}
            <div className="flex gap-3 flex-wrap">
              {QUEUES.map(q => {
                const tasks = q === "ALL" ? (data?.tasks ?? []) : (data?.queues[q]?.tasks ?? [])
                const isActive = queue === q
                return (
                  <button key={q} onClick={() => { setQueue(q); setTypeFilter("all") }}
                    className={cn(
                      "flex flex-col text-left px-4 py-3 rounded-xl border transition-all duration-200 min-w-[140px]",
                      "hover:-translate-y-0.5 active:scale-[0.98]",
                      isActive
                        ? "border-primary bg-card shadow-[0_4px_20px_rgba(108,99,255,0.3)]"
                        : "border-border bg-card hover:border-primary/50 hover:shadow-[0_4px_16px_rgba(108,99,255,0.12)]"
                    )}>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">
                      {q === "ALL" ? "Все очереди" : q}
                    </span>
                    {loading ? <Skeleton className="h-8 w-12 mb-1" /> : (
                      <div className="mb-1 flex items-baseline gap-1">
                        <span className="text-3xl font-black tracking-tighter text-primary leading-none">{tasks.length}</span>
                        <span className="text-xs text-muted-foreground">{plural(tasks.length)}</span>
                      </div>
                    )}
                    <div className="flex gap-3 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-[hsl(166,76%,40%)] inline-block" />
                        {tasks.filter(t => t.v1n > 0).length} АрхКом
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-[hsl(350,89%,60%)] inline-block" />
                        {tasks.filter(t => t.v2n > 0).length} ТА
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Type filter */}
            {data && (
              <TypeFilter active={typeFilter} counts={typeCounts} onChange={setTypeFilter} />
            )}

            {/* Stat cards */}
            {loading ? (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-36 rounded-xl" />)}
              </div>
            ) : data && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <StatCard label="Пришло в АрхКом" value={total} sub="задач за период"           icon="📋" color="purple" />
                <StatCard label="АрхКом"        value={v1tasks} sub="задач на ревью аналитики"  icon="✅" color="teal" />
                <StatCard label="ТА"            value={v2tasks} sub="задач вернули на уточнение" icon="🔴" color="rose" />
                <StatCard label="Оба типа"      value={both}    sub="вернули и АрхКом и ТА"      icon="⚡" color="amber" />
                <StatCard label="Всего возвратов" value={cuts}  sub="суммарно переходов"         icon="🔁" color="sky" />
              </div>
            )}

            {/* Funnel + Flow cards */}
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Skeleton className="h-64 rounded-xl" />
                <Skeleton className="h-64 rounded-xl" />
              </div>
            ) : data && (
              <div className="grid grid-cols-1 xl:grid-cols-[1fr_1fr] gap-4">
                <FunnelChart tasks={view} />
                <div className="grid grid-cols-1 gap-4">
                  <FlowCard type="ak" tasks={view} totalTasks={total} />
                  <FlowCard type="ta" tasks={view} totalTasks={total} />
                </div>
              </div>
            )}

            {/* Timeline + Monthly */}
            {loading ? (
              <div className="space-y-4">
                <Skeleton className="h-64 rounded-xl" />
                <Skeleton className="h-64 rounded-xl" />
              </div>
            ) : data && (
              <div className="space-y-4">
                <TimelineChart tasks={view} dateFrom={data.dateFrom} dateTo={data.dateTo} />
                <MonthlyChart tasks={view} />
              </div>
            )}

            {/* Breakdown + Table */}
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Skeleton className="h-72 rounded-xl" />
                <Skeleton className="h-72 rounded-xl" />
              </div>
            ) : data && (
              <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-4">
                <QueueBreakdown tasks={view} onQueueClick={(q) => setQueue(q as typeof QUEUES[number])} />
                <TaskTable tasks={view} activeFilter={filter} onFilter={setFilter} />
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
