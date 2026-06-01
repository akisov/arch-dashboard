import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface FlowCardProps {
  type: "ak" | "ta"
  taskCount: number
  cutCount: number
  totalTasks: number
}

const config = {
  ak: {
    title: "АрхКом — ревью аналитики",
    sub: "Задача прошла ревью арх. комитета",
    from: "Аналит. проработка готово",
    to: "Ревью аналитики",
    color: "hsl(var(--chart-2))",
    barColor: "bg-[hsl(166,76%,40%)]",
    valColor: "text-[hsl(166,76%,40%)]",
    badge: "success" as const,
    barId: "ak",
  },
  ta: {
    title: "ТА — возврат на уточнение",
    sub: "Технический архитектор вернул задачу",
    from: "Согласование архитектуры",
    to: "На уточнении",
    color: "hsl(var(--chart-3))",
    barColor: "bg-[hsl(350,89%,60%)]",
    valColor: "text-[hsl(350,89%,60%)]",
    badge: "destructive" as const,
    barId: "ta",
  },
}

export function FlowCard({ type, taskCount, cutCount, totalTasks }: FlowCardProps) {
  const c = config[type]
  const pct = totalTasks > 0 ? Math.round(taskCount / totalTasks * 100) : 0

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-1">
          <h3 className="text-sm font-bold text-foreground">{c.title}</h3>
          <Badge variant={c.badge}>{type === "ak" ? "АрхКом" : "ТА"}</Badge>
        </div>
        <p className="text-xs text-muted-foreground mb-5">{c.sub}</p>

        {/* Arrow */}
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          <div className="bg-secondary border border-border rounded-lg px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Из</p>
            <p className="text-xs font-semibold text-foreground mt-0.5">{c.from}</p>
          </div>
          <span className="text-muted-foreground text-lg">→</span>
          <div className="bg-secondary border border-border rounded-lg px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">В</p>
            <p className="text-xs font-semibold text-foreground mt-0.5">{c.to}</p>
          </div>
        </div>

        <p className={cn("text-6xl font-black tracking-tighter leading-none mb-1", c.valColor)}>{taskCount}</p>
        <p className="text-xs text-muted-foreground mb-5">задач · {cutCount} переходов</p>

        {/* Progress bar */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground w-16 shrink-0">от всего</span>
          <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
            <div className={cn("h-full rounded-full transition-all duration-700", c.barColor)} style={{ width: `${pct}%` }} />
          </div>
          <span className={cn("text-xs font-bold w-9 text-right", c.valColor)}>{pct}%</span>
        </div>
      </CardContent>
    </Card>
  )
}
