import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { ExternalLink, ChevronDown, ChevronUp } from "lucide-react"
import type { Task } from "@/lib/types"
import { cn } from "@/lib/utils"

interface FlowCardProps {
  type: "ak" | "ta"
  tasks: Task[]         // all view tasks
  totalTasks: number
}

const config = {
  ak: {
    title: "АрхКом вернул на доработку",
    sub: "Задачи, которые арх. комитет отправил на ревью аналитики",
    fromLabel: "Аналит. проработка готово",
    toLabel: "Ревью аналитики",
    color: "hsl(166,76%,40%)",
    bgColor: "bg-emerald-500/10",
    borderColor: "border-emerald-500/30",
    barColor: "bg-emerald-500",
    textColor: "text-emerald-600 dark:text-emerald-400",
    countColor: "text-emerald-600 dark:text-emerald-400",
    filter: (t: Task) => t.v1n > 0,
    countField: (t: Task) => t.v1n,
  },
  ta: {
    title: "ТА вернул на уточнение",
    sub: "Задачи, которые технический архитектор вернул после согласования",
    fromLabel: "Согласование архитектуры",
    toLabel: "Доработка",
    color: "hsl(350,89%,60%)",
    bgColor: "bg-rose-500/10",
    borderColor: "border-rose-500/30",
    barColor: "bg-rose-500",
    textColor: "text-rose-600 dark:text-rose-400",
    countColor: "text-rose-600 dark:text-rose-400",
    filter: (t: Task) => t.v2n > 0,
    countField: (t: Task) => t.v2n,
  },
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso + "T00:00:00")
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`
}

export function FlowCard({ type, tasks, totalTasks }: FlowCardProps) {
  const [open, setOpen] = useState(false)
  const c = config[type]

  const matched = tasks.filter(c.filter)
  const pct = totalTasks > 0 ? Math.round(matched.length / totalTasks * 100) : 0
  const totalCuts = matched.reduce((s, t) => s + c.countField(t), 0)

  return (
    <Card className={cn("border", open && c.borderColor)}>
      <CardContent className="p-0">

        {/* Header */}
        <div className="p-5">
          {/* Top row */}
          <div className="flex items-start justify-between gap-3 mb-1">
            <div>
              <p className="text-sm font-bold text-foreground">{c.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{c.sub}</p>
            </div>
            {/* Big number */}
            <div className="text-right shrink-0">
              <p className={cn("text-4xl font-black tracking-tighter leading-none", c.countColor)}>
                {matched.length}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">{pct}% от всего</p>
            </div>
          </div>

          {/* Transition pills */}
          <div className="flex items-center gap-2 mt-4 mb-4 flex-wrap">
            <div className="bg-secondary border border-border rounded-lg px-3 py-1.5">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Из</p>
              <p className="text-xs font-semibold text-foreground">{c.fromLabel}</p>
            </div>
            <span className="text-muted-foreground text-base">→</span>
            <div className="bg-secondary border border-border rounded-lg px-3 py-1.5">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">В</p>
              <p className="text-xs font-semibold text-foreground">{c.toLabel}</p>
            </div>
            {totalCuts > matched.length && (
              <span className="ml-auto text-xs text-muted-foreground">
                {totalCuts} переходов суммарно
              </span>
            )}
          </div>

          {/* Progress bar */}
          <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all duration-700", c.barColor)}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Toggle button */}
        {matched.length > 0 && (
          <>
            <button
              onClick={() => setOpen(o => !o)}
              className={cn(
                "w-full flex items-center justify-between px-5 py-3 text-xs font-semibold",
                "border-t border-border hover:bg-secondary transition-colors",
                open ? c.textColor : "text-muted-foreground"
              )}
            >
              <span>{open ? "Скрыть задачи" : `Показать ${matched.length} задач`}</span>
              {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {/* Task list */}
            {open && (
              <div className="border-t border-border">
                <table className="w-full">
                  <thead>
                    <tr className="bg-secondary/50">
                      <th className="text-left px-5 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Ключ</th>
                      <th className="text-left px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Название</th>
                      <th className="text-left px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Дата входа</th>
                      <th className="text-center px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {type === "ak" ? "Возвратов АрхКом" : "Возвратов ТА"}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {matched
                      .sort((a, b) => c.countField(b) - c.countField(a))
                      .map(t => (
                        <tr key={t.key + type} className="hover:bg-secondary/30 transition-colors">
                          <td className="px-5 py-3">
                            <a
                              href={t.url} target="_blank" rel="noreferrer"
                              className="inline-flex items-center gap-1.5 text-primary font-mono text-xs font-bold hover:underline"
                            >
                              {t.key}
                              <ExternalLink className="w-3 h-3 opacity-40" />
                            </a>
                          </td>
                          <td className="px-4 py-3 text-sm text-foreground max-w-xs">
                            <span className="line-clamp-1">{t.title}</span>
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums">
                            {fmtDate(t.entryDate)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={cn(
                              "inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-black",
                              c.bgColor, c.countColor
                            )}>
                              {c.countField(t)}
                            </span>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* Empty state */}
        {matched.length === 0 && (
          <div className="px-5 pb-5 text-xs text-muted-foreground flex items-center gap-2">
            <span className="text-emerald-500">✓</span> Нет задач за выбранный период
          </div>
        )}
      </CardContent>
    </Card>
  )
}
