import { Card, CardContent } from "@/components/ui/card"
import type { Task } from "@/lib/types"

interface FunnelChartProps {
  tasks: Task[]
}

export function FunnelChart({ tasks }: FunnelChartProps) {
  const total = tasks.length
  const akCount = tasks.filter(t => t.v1n > 0).length
  const taCount = tasks.filter(t => t.v2n > 0).length

  const pctAk = total > 0 ? Math.round(akCount / total * 100) : 0
  const pctTa = total > 0 ? Math.round(taCount / total * 100) : 0
  const pctOk = 100 - pctAk - pctTa < 0 ? 0 : 100 - pctAk - pctTa

  const rows = [
    {
      label: "Пришло к техархам",
      count: total,
      pct: 100,
      color: "bg-[hsl(var(--chart-1))]",
      textColor: "text-[hsl(var(--chart-1))]",
      bg: "bg-[hsl(var(--chart-1))/0.08]",
      icon: "📋",
      desc: "Задач перешли в «Аналит. проработка готово»",
    },
    {
      label: "АрхКом вернул",
      count: akCount,
      pct: pctAk,
      color: "bg-[hsl(var(--chart-2))]",
      textColor: "text-[hsl(var(--chart-2))]",
      bg: "bg-[hsl(var(--chart-2))/0.08]",
      icon: "🔄",
      desc: "Отправлено на ревью аналитики арх. комитетом",
    },
    {
      label: "ТА вернул",
      count: taCount,
      pct: pctTa,
      color: "bg-[hsl(var(--chart-3))]",
      textColor: "text-[hsl(var(--chart-3))]",
      bg: "bg-[hsl(var(--chart-3))/0.08]",
      icon: "↩️",
      desc: "Возвращено на уточнение техническим архитектором",
    },
  ]

  return (
    <Card>
      <CardContent className="p-6">
        <p className="text-sm font-bold text-foreground mb-1">Воронка отсечек</p>
        <p className="text-xs text-muted-foreground mb-6">
          Из {total} задач, пришедших к техархам за период
        </p>

        <div className="space-y-4">
          {rows.map((row, i) => (
            <div key={i}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-base">{row.icon}</span>
                  <span className="text-sm font-semibold text-foreground">{row.label}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-bold ${row.textColor}`}>{row.pct}%</span>
                  <span className={`text-lg font-black tabular-nums ${row.textColor} min-w-[2rem] text-right`}>
                    {row.count}
                  </span>
                </div>
              </div>

              {/* Bar */}
              <div className="relative h-9 rounded-lg bg-secondary overflow-hidden">
                <div
                  className={`absolute inset-y-0 left-0 rounded-lg transition-all duration-700 ease-out ${row.color} opacity-90`}
                  style={{ width: `${Math.max(row.pct, row.count > 0 ? 3 : 0)}%` }}
                />
                <div className="absolute inset-0 flex items-center px-3">
                  <span className="text-xs text-muted-foreground">{row.desc}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Pass rate */}
        <div className="mt-6 pt-4 border-t border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-sm text-muted-foreground">Прошли без замечаний</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-black text-emerald-500">
              {tasks.filter(t => t.total === 0).length}
            </span>
            <span className="text-xs text-muted-foreground">
              ({total > 0 ? Math.round(tasks.filter(t => t.total === 0).length / total * 100) : 0}%)
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
