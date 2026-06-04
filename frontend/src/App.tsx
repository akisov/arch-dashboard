import { useState, useEffect, useCallback } from "react"
import { RefreshCw } from "lucide-react"
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
import { ArchCommitteeReport } from "@/components/ArchCommitteeReport"
import { TaskListModal, type TaskModalData } from "@/components/TaskListModal"
import { SyncBar } from "@/components/SyncBar"
import { SyncProgress } from "@/components/SyncProgress"
import { fetchDashboard, fetchSyncInfo, fetchArchCurrent, startSync } from "@/lib/api"
import type { DashboardData, SyncInfo, ArchTask } from "@/lib/types"
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
  const [archTasks, setArchTasks] = useState<ArchTask[]>([])
  const [archLoading, setArchLoading] = useState(false)
  const [syncInfo, setSyncInfo] = useState<SyncInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncTitle, setSyncTitle] = useState("")
  const [syncMsg, setSyncMsg] = useState("")
  const [syncPct, setSyncPct] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [emptyDb, setEmptyDb] = useState(false)
  const [taskModal, setTaskModal] = useState<TaskModalData | null>(null)

  const loadSyncInfo = useCallback(async () => {
    try {
      const info = await fetchSyncInfo()
      setSyncInfo(info)
      return info
    } catch { return null }
  }, [])

  const loadArch = useCallback(async () => {
    setArchLoading(true)
    try {
      setArchTasks(await fetchArchCurrent())
    } catch { /* отчёт не критичен */ }
    finally { setArchLoading(false) }
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
      loadArch()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [dates, loadSyncInfo, loadArch])

  const doSync = useCallback(() => {
    setSyncing(true)
    setSyncPct(2)
    setSyncTitle("Синхронизация с Трекером…")
    setSyncMsg("Подключаемся к Трекеру…")
    const es = startSync(false, (msg: { type: string; msg?: string; pct?: number }) => {
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

  // Дата последнего синка — минимальная из всех очередей
  const lastSync = syncInfo
    ? Object.values(syncInfo).filter(Boolean).sort()[0] ?? null
    : null

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

  // Отчёт «сейчас в Арх. комитете» — учитываем фильтры очереди и типа
  const archView = archTasks
    .filter(t => queue === "ALL" || t.queue === queue)
    .filter(t => typeFilter === "all" || t.issueType === typeFilter)

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
          <div className="flex items-center gap-3">
            {/* Кнопка синка с датой последнего синка */}
            <button
              onClick={doSync}
              disabled={syncing}
              className={cn(
                "flex items-center gap-2 px-3 h-9 rounded-lg border text-xs font-semibold transition-all",
                syncing
                  ? "border-primary/40 bg-primary/10 text-primary cursor-not-allowed"
                  : "border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground hover:shadow-[0_2px_12px_rgba(108,99,255,0.2)]"
              )}
            >
              <RefreshCw className={cn("w-3.5 h-3.5", syncing && "animate-spin")} />
              <span>{syncing ? "Синкуем…" : "Синк"}</span>
              {lastSync && !syncing && (
                <span className="text-muted-foreground/60 font-normal">· {lastSync}</span>
              )}
            </button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="max-w-screen-xl mx-auto px-6 py-8 space-y-6">
        {/* Page header */}
        <div>
          <h1 className="text-3xl font-black tracking-tight text-foreground">Аналитика переходов</h1>
          <p className="text-sm text-muted-foreground mt-1">Story · Аналитика · ТехДолг · Улучшение · POOLING · DOSTAVKAPIKO · UDOSTAVKA</p>
        </div>

        {/* Period controls — own row */}
        <div className="flex items-center gap-2 flex-wrap rounded-xl border border-primary/20 bg-card px-4 py-3 shadow-[0_0_24px_rgba(108,99,255,0.08)]">
          <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground mr-1">Период</span>

          {/* Presets */}
          <div className="flex gap-1 bg-secondary/60 rounded-lg p-1">
            {PRESETS.map(p => (
              <button key={p.label}
                onClick={() => { const d = p.getDates(); setDates(d); setActivePreset(p.label); load(d.from, d.to) }}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-semibold transition-all whitespace-nowrap",
                  activePreset === p.label
                    ? "bg-primary text-primary-foreground shadow-[0_2px_8px_rgba(108,99,255,0.4)]"
                    : "text-muted-foreground hover:text-foreground hover:bg-card"
                )}>
                {p.label}
              </button>
            ))}
          </div>

          {/* Divider */}
          <div className="h-6 w-px bg-border" />

          {/* Date range */}
          <div className="flex items-center gap-1.5 bg-secondary/60 border border-border rounded-lg px-3 h-9 focus-within:border-primary/50 focus-within:shadow-[0_0_0_2px_rgba(108,99,255,0.15)] transition-all">
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

          <Button onClick={() => load(dates.from, dates.to)} disabled={loading || syncing} size="sm">
            {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
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
              Данные из Яндекс Трекера ещё не загружены. Запустите синк — первый раз он загрузит историю переходов за 2 года и сохранит в базу. Следующие синки догружают только изменения с даты последнего синка и занимают секунды.
            </p>
            <Button size="lg" onClick={doSync} className="text-base h-12 px-8">
              <RefreshCw className="w-4 h-4" /> Запустить синк
            </Button>
            <p className="text-xs text-muted-foreground mt-4">Первый запуск займёт 5–15 минут</p>
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
                      "hover:-translate-y-[3px] hover:scale-[1.01] active:scale-[0.98]",
                      isActive
                        ? "border-primary bg-card shadow-[0_4px_24px_rgba(108,99,255,0.35),0_0_0_1px_rgba(108,99,255,0.3)]"
                        : "border-border bg-card hover:border-primary/60 hover:shadow-[0_6px_28px_rgba(108,99,255,0.25),0_0_0_1px_rgba(108,99,255,0.15)]"
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
                <div className="animate-fade-in-up stagger-1"><StatCard label="Пришло в АрхКом" value={total} sub="задач за период"           icon="📋" color="purple" /></div>
                <div className="animate-fade-in-up stagger-2"><StatCard label="АрхКом"        value={v1tasks} sub="задач на ревью аналитики"  icon="✅" color="teal" /></div>
                <div className="animate-fade-in-up stagger-3"><StatCard label="ТА"            value={v2tasks} sub="задач вернули на уточнение" icon="🔴" color="rose" /></div>
                <div className="animate-fade-in-up stagger-4"><StatCard label="Оба типа"      value={both}    sub="вернули и АрхКом и ТА"      icon="⚡" color="amber" /></div>
                <div className="animate-fade-in-up stagger-5"><StatCard label="Всего возвратов" value={cuts}  sub="суммарно переходов"         icon="🔁" color="sky" /></div>
              </div>
            )}

            {/* Отчёт: что сейчас в Арх. комитете */}
            {loading ? (
              <Skeleton className="h-64 rounded-xl" />
            ) : data && (
              <div className="animate-fade-in-up" style={{ animationDelay: "0.15s" }}>
                <ArchCommitteeReport tasks={archView} loading={archLoading} />
              </div>
            )}

            {/* Funnel + Flow cards */}
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Skeleton className="h-64 rounded-xl" />
                <Skeleton className="h-64 rounded-xl" />
              </div>
            ) : data && (
              <div className="grid grid-cols-1 xl:grid-cols-[1fr_1fr] gap-4 animate-fade-in-up" style={{ animationDelay: "0.2s" }}>
                <FunnelChart tasks={view} onShowTasks={setTaskModal} />
                <div className="grid grid-cols-1 gap-4">
                  <FlowCard type="ak" tasks={view} totalTasks={total} onShowTasks={setTaskModal} />
                  <FlowCard type="ta" tasks={view} totalTasks={total} onShowTasks={setTaskModal} />
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
              <div className="space-y-4 animate-fade-in-up" style={{ animationDelay: "0.3s" }}>
                <TimelineChart tasks={view} dateFrom={data.dateFrom} dateTo={data.dateTo} onShowTasks={setTaskModal} />
                <MonthlyChart tasks={view} onShowTasks={setTaskModal} />
              </div>
            )}

            {/* Breakdown + Table */}
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Skeleton className="h-72 rounded-xl" />
                <Skeleton className="h-72 rounded-xl" />
              </div>
            ) : data && (
              <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-4 animate-fade-in-up" style={{ animationDelay: "0.4s" }}>
                <QueueBreakdown tasks={view} onShowTasks={setTaskModal} />
                <TaskTable tasks={view} activeFilter={filter} onFilter={setFilter} />
              </div>
            )}
          </>
        )}
      </main>

      <TaskListModal open={!!taskModal} onClose={() => setTaskModal(null)} data={taskModal} />
    </div>
  )
}
