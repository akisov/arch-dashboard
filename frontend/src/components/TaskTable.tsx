import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ExternalLink, ArrowUpDown } from "lucide-react"
import type { Task } from "@/lib/types"
import { cn } from "@/lib/utils"

type Filter = "all" | "v1" | "v2" | "both" | "none" | "multi" | string

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all",   label: "Все" },
  { key: "v1",    label: "АрхКом" },
  { key: "v2",    label: "ТА" },
  { key: "both",  label: "Оба" },
  { key: "none",  label: "С первого раза" },
  { key: "multi", label: "2+ возврата" },
]

function fmtDate(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso + "T00:00:00")
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`
}

function plural(n: number) {
  const mod10 = n % 10, mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 19) return "задач"
  if (mod10 === 1) return "задача"
  if (mod10 >= 2 && mod10 <= 4) return "задачи"
  return "задач"
}

interface TaskTableProps {
  tasks: Task[]
  activeFilter: string
  onFilter: (f: string) => void
}

export function TaskTable({ tasks, activeFilter, onFilter }: TaskTableProps) {
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc")

  let filtered = tasks
  if      (activeFilter === "v1")    filtered = tasks.filter(t => t.v1n > 0 && t.v2n === 0)
  else if (activeFilter === "v2")    filtered = tasks.filter(t => t.v2n > 0 && t.v1n === 0)
  else if (activeFilter === "both")  filtered = tasks.filter(t => t.v1n > 0 && t.v2n > 0)
  else if (activeFilter === "none")  filtered = tasks.filter(t => t.total === 0)
  else if (activeFilter === "multi") filtered = tasks.filter(t => t.total >= 2)
  else if (activeFilter.startsWith("cuts")) {
    const n = parseInt(activeFilter.slice(4))
    filtered = tasks.filter(t => t.total === n)
  }

  const sorted = [...filtered].sort((a, b) =>
    sortDir === "desc"
      ? b.total - a.total || a.key.localeCompare(b.key)
      : a.total - b.total || a.key.localeCompare(b.key)
  )

  const badge = (t: Task) => {
    if (t.v1n > 0 && t.v2n > 0) return <Badge variant="default">АрхКом + ТА</Badge>
    if (t.v1n > 0) return <Badge variant="success">АрхКом</Badge>
    if (t.v2n > 0) return <Badge variant="destructive">ТА</Badge>
    return <Badge variant="secondary">С первого раза</Badge>
  }

  return (
    <Card className="overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-border flex-wrap">
        <div>
          <span className="text-sm font-bold text-foreground">Задачи</span>
          <span className="ml-2 text-xs text-muted-foreground">
            {sorted.length} {plural(sorted.length)}
          </span>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {FILTERS.map(f => (
            <button key={f.key} onClick={() => onFilter(f.key)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all",
                activeFilter === f.key
                  ? "bg-primary border-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground bg-transparent"
              )}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        {sorted.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground text-sm">
            Нет задач для выбранного фильтра
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-secondary/50">
                <th className="text-left px-6 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Ключ</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Название</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Очередь</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Дата входа</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Тип</th>
                <th className="text-center px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">АрхКом</th>
                <th className="text-center px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">ТА</th>
                <th className="text-center px-4 py-3 pr-6 text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap cursor-pointer select-none"
                  onClick={() => setSortDir(d => d === "desc" ? "asc" : "desc")}>
                  <span className="inline-flex items-center gap-1">
                    Итого <ArrowUpDown className="w-3 h-3" />
                  </span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sorted.map(t => (
                <tr key={t.key} className="hover:bg-secondary/30 transition-colors group">
                  <td className="px-6 py-4">
                    <a href={t.url} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-primary font-mono text-xs font-bold hover:underline whitespace-nowrap">
                      {t.key}
                      <ExternalLink className="w-3 h-3 opacity-40 group-hover:opacity-70 transition-opacity" />
                    </a>
                  </td>
                  <td className="px-4 py-4 text-sm text-foreground max-w-xs">
                    <span className="line-clamp-2 leading-snug">{t.title}</span>
                  </td>
                  <td className="px-4 py-4">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{t.queue}</span>
                  </td>
                  <td className="px-4 py-4 text-sm text-muted-foreground tabular-nums whitespace-nowrap">
                    {fmtDate(t.entryDate)}
                  </td>
                  <td className="px-4 py-4">{badge(t)}</td>
                  <td className="px-4 py-4 text-center">
                    <span className="text-base font-black tabular-nums text-emerald-600 dark:text-emerald-400">
                      {t.v1n || <span className="text-muted-foreground/40 font-normal text-sm">—</span>}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-center">
                    <span className="text-base font-black tabular-nums text-rose-600 dark:text-rose-400">
                      {t.v2n || <span className="text-muted-foreground/40 font-normal text-sm">—</span>}
                    </span>
                  </td>
                  <td className="px-4 py-4 pr-6 text-center">
                    {t.total > 0
                      ? <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-sm font-black tabular-nums">
                          {t.total}
                        </span>
                      : <span className="text-muted-foreground/40 font-normal text-sm">—</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Card>
  )
}
