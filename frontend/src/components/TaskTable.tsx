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
  { key: "none",  label: "Без отсечек" },
  { key: "multi", label: "2+ отсечки" },
]

function fmtDate(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso + "T00:00:00")
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`
}

interface TaskTableProps {
  tasks: Task[]
  activeFilter: string
  onFilter: (f: string) => void
}

export function TaskTable({ tasks, activeFilter, onFilter }: TaskTableProps) {
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc")

  let filtered = tasks
  if (activeFilter === "v1")    filtered = tasks.filter(t => t.v1n > 0 && t.v2n === 0)
  else if (activeFilter === "v2")    filtered = tasks.filter(t => t.v2n > 0 && t.v1n === 0)
  else if (activeFilter === "both")  filtered = tasks.filter(t => t.v1n > 0 && t.v2n > 0)
  else if (activeFilter === "none")  filtered = tasks.filter(t => t.total === 0)
  else if (activeFilter === "multi") filtered = tasks.filter(t => t.total >= 2)
  else if (activeFilter.startsWith("cuts")) {
    const n = parseInt(activeFilter.slice(4))
    filtered = tasks.filter(t => t.total === n)
  }

  const sorted = [...filtered].sort((a, b) =>
    sortDir === "desc" ? b.total - a.total || a.key.localeCompare(b.key)
                       : a.total - b.total || a.key.localeCompare(b.key)
  )

  const badge = (t: Task) => {
    if (t.v1n > 0 && t.v2n > 0) return <Badge variant="default">АрхКом + ТА</Badge>
    if (t.v1n > 0) return <Badge variant="success">АрхКом</Badge>
    if (t.v2n > 0) return <Badge variant="destructive">ТА</Badge>
    return <Badge variant="secondary">—</Badge>
  }

  return (
    <Card className="overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 p-6 border-b border-border flex-wrap">
        <div>
          <span className="text-sm font-bold text-foreground">Задачи</span>
          <span className="ml-2 text-xs text-muted-foreground">({sorted.length})</span>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {FILTERS.map(f => (
            <button key={f.key} onClick={() => onFilter(f.key)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all",
                activeFilter === f.key
                  ? "bg-primary border-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
              )}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        {sorted.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground text-sm">Нет задач для выбранного фильтра</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-secondary/50">
                <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ключ</th>
                <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Название</th>
                <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Очередь</th>
                <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Дата входа</th>
                <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Тип</th>
                <th className="text-center px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">АрхКом</th>
                <th className="text-center px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">ТА</th>
                <th className="text-center pl-5 pr-8 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground cursor-pointer select-none"
                  onClick={() => setSortDir(d => d === "desc" ? "asc" : "desc")}>
                  <span className="inline-flex items-center gap-1">Итого <ArrowUpDown className="w-3 h-3" /></span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sorted.map(t => (
                <tr key={t.key} className="hover:bg-secondary/30 transition-colors">
                  <td className="px-5 py-4">
                    <a href={t.url} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-primary font-mono text-xs font-bold hover:underline">
                      {t.key}
                      <ExternalLink className="w-3 h-3 opacity-50" />
                    </a>
                  </td>
                  <td className="px-5 py-4 text-sm text-foreground max-w-sm">
                    <span className="line-clamp-2 leading-relaxed">{t.title}</span>
                  </td>
                  <td className="px-5 py-4">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t.queue}</span>
                  </td>
                  <td className="px-5 py-4 text-sm text-muted-foreground tabular-nums">{fmtDate(t.entryDate)}</td>
                  <td className="px-5 py-4">{badge(t)}</td>
                  <td className="px-5 py-4 text-center text-lg font-black text-[hsl(166,76%,40%)]">{t.v1n || "—"}</td>
                  <td className="px-5 py-4 text-center text-lg font-black text-[hsl(350,89%,60%)]">{t.v2n || "—"}</td>
                  <td className="pl-5 pr-8 py-4 text-center text-lg font-black text-[hsl(38,92%,50%)]">{t.total || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Card>
  )
}
