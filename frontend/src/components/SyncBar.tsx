import { Database, Circle } from "lucide-react"
import type { SyncInfo } from "@/lib/types"

interface SyncBarProps {
  info: SyncInfo | null
  loading: boolean
}

// "2026-06-05 14:30" / "2026-06-05" → "05.06.2026, 14:30" / "05.06.2026"
function fmt(v: string): string {
  const [datePart, timePart] = v.split(" ")
  const [y, m, d] = datePart.split("-")
  if (!y || !m || !d) return v
  const date = `${d}.${m}.${y}`
  return timePart ? `${date}, ${timePart}` : date
}

export function SyncBar({ info, loading }: SyncBarProps) {
  const queues = ["POOLING", "DOSTAVKAPIKO", "UDOSTAVKA"]

  if (loading || !info) {
    return (
      <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border bg-card text-xs text-muted-foreground">
        <Database className="w-3.5 h-3.5" />
        <span>Проверяем базу данных…</span>
      </div>
    )
  }

  const values = queues.map(q => info[q]).filter(Boolean) as string[]
  const hasAny = values.length > 0
  // Самое позднее обновление среди очередей
  const latest = hasAny ? values.slice().sort().reverse()[0] : null

  return (
    <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border bg-card flex-wrap text-xs">
      <Database className="w-3.5 h-3.5 text-muted-foreground" />
      <span className="font-medium text-muted-foreground">База данных:</span>
      {!hasAny ? (
        <span className="text-destructive font-semibold flex items-center gap-1.5">
          <Circle className="w-2 h-2 fill-destructive text-destructive" />
          Данных нет — запустите Синк
        </span>
      ) : (
        <span className="flex items-center gap-1.5">
          <Circle className="w-2 h-2 fill-emerald-400 text-emerald-400" />
          <span className="text-muted-foreground">обновлено</span>
          <span className="font-semibold text-foreground">{fmt(latest!)}</span>
        </span>
      )}
    </div>
  )
}
