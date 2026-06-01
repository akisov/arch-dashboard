import { Card, CardContent } from "@/components/ui/card"
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts"
import type { Task } from "@/lib/types"

interface TimelineChartProps {
  tasks: Task[]
  dateFrom: string
  dateTo: string
}

function weekStart(iso: string): string {
  const d = new Date(iso + "T00:00:00")
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d.toISOString().slice(0, 10)
}

function fmtDate(iso: string): string {
  const d = new Date(iso + "T00:00:00")
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`
}

export function TimelineChart({ tasks, dateFrom, dateTo }: TimelineChartProps) {
  // Build week buckets
  const start = new Date(dateFrom + "T00:00:00")
  const end = new Date(dateTo + "T00:00:00")
  const sd = start.getDay()
  const mon = new Date(start)
  mon.setDate(start.getDate() + (sd === 0 ? -6 : 1 - sd))

  const weeks: Record<string, { date: string; total: number; ak: number; ta: number }> = {}
  for (const cur = new Date(mon); cur <= end; cur.setDate(cur.getDate() + 7)) {
    const k = cur.toISOString().slice(0, 10)
    weeks[k] = { date: fmtDate(k), total: 0, ak: 0, ta: 0 }
  }

  for (const t of tasks) {
    if (!t.entryDate) continue
    const wk = weekStart(t.entryDate)
    if (!weeks[wk]) weeks[wk] = { date: fmtDate(wk), total: 0, ak: 0, ta: 0 }
    weeks[wk].total++
    if (t.v1n > 0) weeks[wk].ak++
    if (t.v2n > 0) weeks[wk].ta++
  }

  const data = Object.keys(weeks).sort().map(k => weeks[k])

  return (
    <Card>
      <CardContent className="p-6">
        <p className="text-sm font-bold text-foreground mb-1">Поступления к техархам по неделям</p>
        <p className="text-xs text-muted-foreground mb-6">Задачи, перешедшие в «Аналит. проработка готово»</p>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="gTotal" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(252,87%,70%)" stopOpacity={0.25} />
                <stop offset="95%" stopColor="hsl(252,87%,70%)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gAk" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(166,76%,40%)" stopOpacity={0.2} />
                <stop offset="95%" stopColor="hsl(166,76%,40%)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gTa" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(350,89%,60%)" stopOpacity={0.2} />
                <stop offset="95%" stopColor="hsl(350,89%,60%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(216,34%,17%)" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: "hsl(215,16%,47%)", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "hsl(215,16%,47%)", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip
              contentStyle={{ background: "hsl(224,71%,6%)", border: "1px solid hsl(216,34%,17%)", borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: "hsl(213,31%,91%)", fontWeight: 600, marginBottom: 4 }}
              itemStyle={{ color: "hsl(215,16%,47%)" }}
            />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 12, color: "hsl(215,16%,47%)" }} />
            <Area type="monotone" dataKey="total" name="Всего" stroke="hsl(252,87%,70%)" strokeWidth={2.5} fill="url(#gTotal)" dot={{ r: 3, fill: "hsl(252,87%,70%)", strokeWidth: 0 }} activeDot={{ r: 5 }} />
            <Area type="monotone" dataKey="ak" name="АрхКом" stroke="hsl(166,76%,40%)" strokeWidth={1.5} fill="url(#gAk)" strokeDasharray="5 3" dot={false} />
            <Area type="monotone" dataKey="ta" name="ТА" stroke="hsl(350,89%,60%)" strokeWidth={1.5} fill="url(#gTa)" strokeDasharray="5 3" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
