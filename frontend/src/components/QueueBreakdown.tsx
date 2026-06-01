import { Card, CardContent } from "@/components/ui/card"
import type { Task } from "@/lib/types"

interface QueueBreakdownProps {
  tasks: Task[]
  onQueueClick: (queue: string) => void
}

const QUEUES = ["POOLING", "DOSTAVKAPIKO", "UDOSTAVKA"]

const QUEUE_COLORS: Record<string, { bar: string; text: string; bg: string }> = {
  POOLING:      { bar: "bg-[hsl(252,87%,70%)]", text: "text-[hsl(252,87%,60%)]", bg: "bg-[hsl(252,87%,70%)/0.08]" },
  DOSTAVKAPIKO: { bar: "bg-[hsl(199,89%,55%)]", text: "text-[hsl(199,89%,45%)]", bg: "bg-[hsl(199,89%,55%)/0.08]" },
  UDOSTAVKA:    { bar: "bg-[hsl(38,92%,50%)]",  text: "text-[hsl(38,92%,40%)]",  bg: "bg-[hsl(38,92%,50%)/0.08]"  },
}

function plural(n: number, one: string, few: string, many: string) {
  const mod10 = n % 10, mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 19) return many
  if (mod10 === 1) return one
  if (mod10 >= 2 && mod10 <= 4) return few
  return many
}

export function QueueBreakdown({ tasks, onQueueClick }: QueueBreakdownProps) {
  const total = tasks.length
  const maxCount = Math.max(...QUEUES.map(q => tasks.filter(t => t.queue === q).length), 1)

  return (
    <Card>
      <CardContent className="p-6">
        <p className="text-sm font-bold text-foreground mb-1">По очередям</p>
        <p className="text-xs text-muted-foreground mb-5">
          Распределение {total} {plural(total, "задачи", "задач", "задач")} по очередям
        </p>

        <div className="space-y-4">
          {QUEUES.map(q => {
            const qTasks   = tasks.filter(t => t.queue === q)
            const qAk      = qTasks.filter(t => t.v1n > 0).length
            const qTa      = qTasks.filter(t => t.v2n > 0).length
            const qCount   = qTasks.length
            const pct      = total > 0 ? Math.round(qCount / total * 100) : 0
            const barW     = maxCount > 0 ? Math.round(qCount / maxCount * 100) : 0
            const c        = QUEUE_COLORS[q]

            return (
              <button
                key={q}
                onClick={() => onQueueClick(q)}
                className="w-full text-left group hover:bg-secondary/60 rounded-xl px-3 py-3 -mx-3 transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-xs font-bold uppercase tracking-widest ${c.text}`}>{q}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{qAk}</span> АрхКом
                      &nbsp;·&nbsp;
                      <span className="text-rose-600 dark:text-rose-400 font-semibold">{qTa}</span> ТА
                    </span>
                    <span className={`text-xl font-black tabular-nums ${c.text}`}>{qCount}</span>
                    <span className="text-xs text-muted-foreground w-8 text-right">{pct}%</span>
                  </div>
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${c.bar}`}
                    style={{ width: `${barW}%` }}
                  />
                </div>
              </button>
            )
          })}
        </div>

        {/* Pass rate summary */}
        <div className="mt-5 pt-4 border-t border-border grid grid-cols-3 gap-3 text-center">
          {[
            { label: "С первого раза", value: tasks.filter(t => t.total === 0).length, color: "text-emerald-600 dark:text-emerald-400" },
            { label: "Вернул АрхКом",  value: tasks.filter(t => t.v1n > 0).length,    color: "text-[hsl(166,76%,36%)]" },
            { label: "Вернул ТА",      value: tasks.filter(t => t.v2n > 0).length,    color: "text-rose-600 dark:text-rose-400" },
          ].map(s => (
            <div key={s.label}>
              <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{s.label}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
