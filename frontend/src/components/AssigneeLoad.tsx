import { Card, CardContent } from "@/components/ui/card"
import { Users } from "lucide-react"
import type { ArchTask } from "@/lib/types"
import { cn } from "@/lib/utils"

const AVATAR_COLORS = [
  "bg-[hsl(252,87%,65%)]", "bg-[hsl(166,76%,40%)]", "bg-[hsl(350,89%,60%)]",
  "bg-[hsl(38,92%,50%)]", "bg-[hsl(199,89%,55%)]", "bg-[hsl(280,70%,60%)]",
]

function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  if (!parts[0]) return "—"
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase()
}
function avatarColor(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}
function plural(n: number) {
  const m10 = n % 10, m100 = n % 100
  if (m100 >= 11 && m100 <= 19) return "задач"
  if (m10 === 1) return "задача"
  if (m10 >= 2 && m10 <= 4) return "задачи"
  return "задач"
}

interface Props {
  tasks: ArchTask[]
}

export function AssigneeLoad({ tasks }: Props) {
  const map: Record<string, { count: number; maxDays: number }> = {}
  for (const t of tasks) {
    const name = t.assignee || "Без исполнителя"
    if (!map[name]) map[name] = { count: 0, maxDays: 0 }
    map[name].count++
    map[name].maxDays = Math.max(map[name].maxDays, t.daysInStatus)
  }
  const list = Object.entries(map)
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.count - a.count || b.maxDays - a.maxDays)
  const max = Math.max(1, ...list.map(l => l.count))

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-4 h-4 text-primary" />
          <p className="text-sm font-bold text-foreground">Загрузка по исполнителям</p>
        </div>

        {list.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Нет задач в комитете</p>
        ) : (
          <div className="space-y-3">
            {list.map(l => (
              <div key={l.name} className="flex items-center gap-3">
                <span className={cn("w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0", l.name === "Без исполнителя" ? "bg-muted-foreground" : avatarColor(l.name))}>
                  {l.name === "Без исполнителя" ? "—" : initials(l.name)}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-foreground truncate">{l.name}</span>
                    <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
                      {l.count} {plural(l.count)}{l.maxDays >= 7 && <span className="text-rose-500 font-semibold"> · {l.maxDays}д</span>}
                    </span>
                  </div>
                  <div className="h-1.5 bg-secondary rounded-full overflow-hidden mt-1">
                    <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${Math.round(l.count / max * 100)}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
