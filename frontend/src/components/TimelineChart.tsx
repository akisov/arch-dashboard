import { Card, CardContent } from "@/components/ui/card"
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from "recharts"
import type { Task } from "@/lib/types"
import { useTheme } from "@/lib/theme"

interface TimelineChartProps {
  tasks: Task[]
  dateFrom: string
  dateTo: string
}

function weekStart(iso: string): string {
  const d = new Date(iso + "T00:00:00")
  const day = d.getDay()
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day))
  return d.toISOString().slice(0, 10)
}

function fmtDate(iso: string): string {
  const d = new Date(iso + "T00:00:00")
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`
}

export function TimelineChart({ tasks, dateFrom, dateTo }: TimelineChartProps) {
  const { theme } = useTheme()
  const isDark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)

  // Build week buckets
  const start = new Date(dateFrom + "T00:00:00")
  const end   = new Date(dateTo   + "T00:00:00")
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

  // Theme-aware colors
  const tooltipBg     = isDark ? "hsl(224,71%,6%)"  : "#ffffff"
  const tooltipBorder = isDark ? "hsl(216,34%,17%)" : "hsl(220,13%,88%)"
  const tooltipText   = isDark ? "hsl(213,31%,91%)" : "hsl(224,71%,10%)"
  const gridColor     = isDark ? "hsl(216,34%,17%)" : "hsl(220,13%,91%)"
  const axisColor     = isDark ? "hsl(215,16%,47%)" : "hsl(220,9%,55%)"

  return (
    <Card>
      <CardContent className="p-6">
        <p className="text-sm font-bold text-foreground mb-1">Динамика по неделям</p>
        <p className="text-xs text-muted-foreground mb-6">
          Задачи, пришедшие к техархам, и количество возвратов каждого типа
        </p>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="gTotal" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="hsl(252,87%,70%)" stopOpacity={isDark ? 0.25 : 0.15}/>
                <stop offset="95%" stopColor="hsl(252,87%,70%)" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="gAk" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="hsl(166,76%,40%)" stopOpacity={isDark ? 0.2 : 0.12}/>
                <stop offset="95%" stopColor="hsl(166,76%,40%)" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="gTa" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="hsl(350,89%,60%)" stopOpacity={isDark ? 0.2 : 0.12}/>
                <stop offset="95%" stopColor="hsl(350,89%,60%)" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false}/>
            <XAxis dataKey="date" tick={{ fill: axisColor, fontSize: 11 }} axisLine={false} tickLine={false}/>
            <YAxis tick={{ fill: axisColor, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false}/>
            <Tooltip
              contentStyle={{
                background: tooltipBg,
                border: `1px solid ${tooltipBorder}`,
                borderRadius: 10,
                fontSize: 12,
                boxShadow: isDark ? "0 8px 24px rgba(0,0,0,0.4)" : "0 4px 16px rgba(0,0,0,0.1)",
              }}
              labelStyle={{ color: tooltipText, fontWeight: 700, marginBottom: 4 }}
              itemStyle={{ color: axisColor }}
            />
            <Legend
              iconType="circle" iconSize={8}
              wrapperStyle={{ fontSize: 12, paddingTop: 12, color: axisColor }}
            />
            <Area type="monotone" dataKey="total" name="Пришло" stroke="hsl(252,87%,70%)" strokeWidth={2.5} fill="url(#gTotal)"
              dot={{ r: 3, fill: "hsl(252,87%,70%)", strokeWidth: 0 }} activeDot={{ r: 5 }}/>
            <Area type="monotone" dataKey="ak" name="АрхКом" stroke="hsl(166,76%,40%)" strokeWidth={1.5} fill="url(#gAk)"
              strokeDasharray="5 3" dot={false}/>
            <Area type="monotone" dataKey="ta" name="ТА" stroke="hsl(350,89%,60%)" strokeWidth={1.5} fill="url(#gTa)"
              strokeDasharray="5 3" dot={false}/>
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
