import { useState, useEffect, useCallback } from "react"
import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/ui/theme-toggle"
import { Skeleton } from "@/components/ui/skeleton"
import { StatCard } from "@/components/StatCard"
import { ReturnsCard } from "@/components/ReturnsCard"
import { DonutChart } from "@/components/DonutChart"
import { FunnelChart } from "@/components/FunnelChart"
import { TimelineChart } from "@/components/TimelineChart"
import { QueueBreakdown } from "@/components/QueueBreakdown"
import { TypeBreakdown } from "@/components/TypeBreakdown"
import { TypeFilter } from "@/components/TypeFilter"
import { MonthlyChart } from "@/components/MonthlyChart"
import { CycleTrendChart } from "@/components/CycleTrendChart"
import { TaskTable } from "@/components/TaskTable"
import { ArchCommitteeReport } from "@/components/ArchCommitteeReport"
import { HealthStrip } from "@/components/HealthStrip"
import { InsightBar } from "@/components/InsightBar"
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

// Предыдущий период такой же длины, идущий встык до текущего
function prevRange(from: string, to: string) {
  const f = new Date(from + "T00:00:00"), t = new Date(to + "T00:00:00")
  const len = Math.round((t.getTime() - f.getTime()) / 86400000) + 1
  const pt = new Date(f); pt.setDate(pt.getDate() - 1)
  const pf = new Date(pt); pf.setDate(pf.getDate() - (len - 1))
  return { from: fmt(pf), to: fmt(pt) }
}

interface Metrics { total: number; ok: number; pctOk: number; v1: number; v2: number; both: number; cuts: number }
function calcMetrics(tasks: { v1n: number; v2n: number; total: number }[]): Metrics {
  const total = tasks.length
  const ok = tasks.filter(t => t.total === 0).length
  return {
    total,
    ok,
    pctOk: total ? Math.round(ok / total * 100) : 0,
    v1: tasks.filter(t => t.v1n > 0).length,
    v2: tasks.filter(t => t.v2n > 0).length,
    both: tasks.filter(t => t.v1n > 0 && t.v2n > 0).length,
    cuts: tasks.reduce((s, t) => s + t.total, 0),
  }
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
  const [timeView, setTimeView] = useState<"weeks" | "months" | "cycle">("weeks")

  const [data, setData] = useState<DashboardData | null>(null)
  const [prevData, setPrevData] = useState<DashboardData | null>(null)
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
      // Данные прошлого периода (такой же длины) — для трендов
      const pr = prevRange(df, dt)
      fetchDashboard(pr.from, pr.to).then(setPrevData).catch(() => setPrevData(null))
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
  const m = calcMetrics(view)
  const total = m.total

  // Метрики прошлого периода (тот же фильтр очереди + типа) — для трендов
  const prevView = !prevData ? null : (() => {
    const byQ = queue === "ALL" ? prevData.tasks : (prevData.queues[queue]?.tasks ?? [])
    return typeFilter === "all" ? byQ : byQ.filter(t => t.issueType === typeFilter)
  })()
  const pm = prevView ? calcMetrics(prevView) : null
  const d = (cur: number, prev: number | undefined) => prev === undefined ? undefined : cur - prev
  // Сравнение качества (%) надёжно только при достаточной выборке прошлого периода
  const pmReliable = !!prevView && prevView.length >= 5

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
                <span className="text-muted-foreground/60 font-normal">· {lastSync.slice(0, 10)}</span>
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
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                {Array(6).fill(0).map((_, i) => <Skeleton key={i} className="h-36 rounded-xl" />)}
              </div>
            ) : data && (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 items-stretch">
                <div className="animate-fade-in-up stagger-1 h-full"><StatCard label="Пришло в АрхКом" value={total}      sub="за период"                 icon="📋" color="purple" delta={d(m.total, pm?.total)} onClick={() => setTaskModal({ title: "Пришло в АрхКом за период", tasks: view })} /></div>
                <div className="animate-fade-in-up stagger-1 h-full"><StatCard label="С первого раза"  value={`${m.pctOk}%`} sub={`${m.ok} без возвратов`}     icon="🎯" color="teal" delta={pmReliable ? d(m.pctOk, pm?.pctOk) : undefined} deltaSuffix="%" onClick={() => setTaskModal({ title: "Прошли с первого раза", tasks: view.filter(t => t.total === 0) })} /></div>
                <div className="animate-fade-in-up stagger-2 h-full"><StatCard label="АрхКом"          value={m.v1}      sub="на ревью аналитики"        icon="🔄" color="teal" delta={d(m.v1, pm?.v1)} invert onClick={() => setTaskModal({ title: "Вернул АрхКом", tasks: view.filter(t => t.v1n > 0) })} /></div>
                <div className="animate-fade-in-up stagger-3 h-full"><StatCard label="ТА"              value={m.v2}      sub="вернули на уточнение"      icon="↩️" color="rose" delta={d(m.v2, pm?.v2)} invert onClick={() => setTaskModal({ title: "Вернул ТА", tasks: view.filter(t => t.v2n > 0) })} /></div>
                <div className="animate-fade-in-up stagger-4 h-full"><StatCard label="Оба типа"        value={m.both}    sub="вернули и АрхКом, и ТА"     icon="⚡" color="amber" delta={d(m.both, pm?.both)} invert onClick={() => setTaskModal({ title: "Вернули и АрхКом, и ТА", tasks: view.filter(t => t.v1n > 0 && t.v2n > 0) })} /></div>
                <div className="animate-fade-in-up stagger-5 h-full"><StatCard label="Всего возвратов" value={m.cuts}    sub="суммарно переходов"        icon="🔁" color="sky" delta={d(m.cuts, pm?.cuts)} invert onClick={() => setTaskModal({ title: "Задачи с возвратами", tasks: view.filter(t => t.total > 0) })} /></div>
              </div>
            )}

            {/* Авто-инсайт + слим-строка показателей */}
            {!loading && data && (
              <div className="space-y-3 animate-fade-in-up" style={{ animationDelay: "0.1s" }}>
                <InsightBar tasks={view} prevTasks={prevView} />
                <HealthStrip tasks={view} stuck={archView.filter(t => t.daysInStatus >= 7).length} onShowTasks={setTaskModal} />
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

            {/* Funnel + Returns */}
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Skeleton className="h-64 rounded-xl" />
                <Skeleton className="h-64 rounded-xl" />
              </div>
            ) : data && (
              <div className="grid grid-cols-1 xl:grid-cols-[1fr_1fr] gap-4 animate-fade-in-up" style={{ animationDelay: "0.2s" }}>
                <FunnelChart tasks={view} onShowTasks={setTaskModal} />
                <ReturnsCard tasks={view} totalTasks={total} onShowTasks={setTaskModal} />
              </div>
            )}

            {/* Динамика — вкладки */}
            {loading ? (
              <Skeleton className="h-72 rounded-xl" />
            ) : data && (
              <div className="space-y-3 animate-fade-in-up" style={{ animationDelay: "0.3s" }}>
                <div className="flex gap-1 bg-secondary/60 rounded-lg p-1 w-fit">
                  {([
                    ["weeks", "📈 По неделям"],
                    ["months", "📊 По месяцам"],
                    ["cycle", "⏱ Время прохождения"],
                  ] as const).map(([k, label]) => (
                    <button key={k} onClick={() => setTimeView(k)}
                      className={cn(
                        "px-3 py-1.5 rounded-md text-xs font-semibold transition-all whitespace-nowrap",
                        timeView === k
                          ? "bg-primary text-primary-foreground shadow-[0_2px_8px_rgba(108,99,255,0.4)]"
                          : "text-muted-foreground hover:text-foreground hover:bg-card"
                      )}>
                      {label}
                    </button>
                  ))}
                </div>
                {timeView === "weeks" && <TimelineChart tasks={view} dateFrom={data.dateFrom} dateTo={data.dateTo} onShowTasks={setTaskModal} />}
                {timeView === "months" && <MonthlyChart tasks={view} onShowTasks={setTaskModal} />}
                {timeView === "cycle" && <CycleTrendChart tasks={view} onShowTasks={setTaskModal} />}
              </div>
            )}

            {/* Breakdown + Donut */}
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Skeleton className="h-72 rounded-xl" />
                <Skeleton className="h-72 rounded-xl" />
              </div>
            ) : data && (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 animate-fade-in-up" style={{ animationDelay: "0.4s" }}>
                <QueueBreakdown tasks={view} onShowTasks={setTaskModal} />
                <TypeBreakdown tasks={view} onShowTasks={setTaskModal} />
                <DonutChart tasks={view} onShowTasks={setTaskModal} />
              </div>
            )}

            {/* Таблица задач — на всю ширину */}
            {loading ? (
              <Skeleton className="h-72 rounded-xl" />
            ) : data && (
              <div className="animate-fade-in-up" style={{ animationDelay: "0.45s" }}>
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
