import { Card, CardContent } from "@/components/ui/card"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, LabelList
} from "recharts"
import type { Task } from "@/lib/types"
import { useTheme } from "@/lib/theme"

interface MonthlyChartProps {
  tasks: Task[]
}

const MONTH_NAMES = ["Янв","Фев","Мар","Апр","Май","Июн","Июл","Авг","Сен","Окт","Ноя","Дек"]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const PctLabel = ({ x, y, width, value }: any) => {
  if (!value || value === 0) return null
  return (
    <text x={x + width / 2} y={y - 4} textAnchor="middle"
      fontSize={10} fontWeight={600} fill="currentColor" style={{ fill: "hsl(var(--muted-foreground))" }}>
      {value}%
    </text>
  )
}

export function MonthlyChart({ tasks }: MonthlyChartProps) {
  const { theme } = useTheme()
  const isDark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)

  // Group by month
  const months: Record<string, { label: string; total: number; ak: number; ta: number }> = {}

  for (const t of tasks) {
    if (!t.entryDate) continue
    const d = new Date(t.entryDate + "T00:00:00")
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    const label = `${MONTH_NAMES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`
    if (!months[key]) months[key] = { label, total: 0, ak: 0, ta: 0 }
    months[key].total++
    if (t.v1n > 0) months[key].ak++
    if (t.v2n > 0) months[key].ta++
  }

  const data = Object.keys(months).sort().map(k => {
    const m = months[k]
    return {
      label: m.label,
      total: m.total,
      ak: m.ak,
      ta: m.ta,
      akPct: m.total > 0 ? Math.round(m.ak / m.total * 100) : 0,
      taPct: m.total > 0 ? Math.round(m.ta / m.total * 100) : 0,
    }
  })

  if (data.length === 0) return null

  const tooltipBg     = isDark ? "hsl(224,71%,6%)"  : "#ffffff"
  const tooltipBorder = isDark ? "hsl(216,34%,17%)" : "hsl(220,13%,88%)"
  const tooltipText   = isDark ? "hsl(213,31%,91%)" : "hsl(224,71%,10%)"
  const gridColor     = isDark ? "hsl(216,34%,17%)" : "hsl(220,13%,91%)"
  const axisColor     = isDark ? "hsl(215,16%,47%)" : "hsl(220,9%,55%)"

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    const d = payload[0]?.payload
    return (
      <div style={{ background: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: 10, padding: "10px 14px", fontSize: 12 }}>
        <p style={{ color: tooltipText, fontWeight: 700, marginBottom: 6 }}>{label}</p>
        <p style={{ color: "hsl(252,87%,70%)" }}>Пришло: <b>{d.total}</b></p>
        <p style={{ color: "hsl(166,76%,40%)" }}>АрхКом вернул: <b>{d.ak}</b> ({d.akPct}%)</p>
        <p style={{ color: "hsl(350,89%,60%)" }}>ТА вернул: <b>{d.ta}</b> ({d.taPct}%)</p>
      </div>
    )
  }

  return (
    <Card>
      <CardContent className="p-6">
        <p className="text-sm font-bold text-foreground mb-1">По месяцам — % возвратов</p>
        <p className="text-xs text-muted-foreground mb-6">
          Столбцы: пришло задач. Над столбцами: % вернувших АрхКом и ТА от пришедших
        </p>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data} margin={{ top: 20, right: 16, left: -20, bottom: 0 }} barCategoryGap="25%">
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: axisColor, fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: axisColor, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)" }} />
            <Legend iconType="circle" iconSize={8}
              wrapperStyle={{ fontSize: 12, paddingTop: 12, color: axisColor }} />

            {/* Пришло — фоновый полупрозрачный */}
            <Bar dataKey="total" name="Пришло" fill="hsl(252,87%,70%)" fillOpacity={0.2}
              radius={[4,4,0,0]} />

            {/* АрхКом — поверх */}
            <Bar dataKey="ak" name="АрхКом вернул" fill="hsl(166,76%,40%)" fillOpacity={0.85}
              radius={[4,4,0,0]}>
              <LabelList content={<PctLabel />} dataKey="akPct" position="top" />
            </Bar>

            {/* ТА — поверх */}
            <Bar dataKey="ta" name="ТА вернул" fill="hsl(350,89%,60%)" fillOpacity={0.85}
              radius={[4,4,0,0]}>
              <LabelList content={<PctLabel />} dataKey="taPct" position="top" />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
