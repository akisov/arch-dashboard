import { Card, CardContent } from "@/components/ui/card"
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts"
import type { Task } from "@/lib/types"

const COLORS = [
  "hsl(252,87%,70%)", "hsl(166,76%,40%)", "hsl(350,89%,60%)",
  "hsl(38,92%,50%)", "hsl(199,89%,60%)", "hsl(280,87%,70%)", "hsl(25,90%,60%)"
]

interface DonutChartProps {
  tasks: Task[]
  onFilter: (f: string) => void
}

export function DonutChart({ tasks, onFilter }: DonutChartProps) {
  const groups: Record<number, Task[]> = {}
  for (const t of tasks) {
    if (!groups[t.total]) groups[t.total] = []
    groups[t.total].push(t)
  }
  const keys = Object.keys(groups).map(Number).sort((a, b) => a - b)
  const data = keys.map((k, i) => ({
    name: k === 0 ? "Без отсечек" : k === 1 ? "1 отсечка" : `${k} отсечки`,
    value: groups[k].length,
    pct: Math.round(groups[k].length / tasks.length * 100),
    color: COLORS[i % COLORS.length],
    fk: k === 0 ? "none" : `cuts${k}`,
  }))

  const withCuts = tasks.filter(t => t.total > 0).length

  return (
    <Card>
      <CardContent className="p-6">
        <p className="text-sm font-bold text-foreground mb-1">Отсечки на задачу</p>
        <p className="text-xs text-muted-foreground mb-6">Распределение по числу отсечек (АрхКом + ТА)</p>
        <div className="flex items-center gap-8 flex-wrap">
          <div className="relative shrink-0">
            <ResponsiveContainer width={200} height={200}>
              <PieChart>
                <Pie data={data} cx={95} cy={95} innerRadius={58} outerRadius={90} dataKey="value" strokeWidth={2} stroke="hsl(224,71%,4%)"
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  onClick={(entry: any) => onFilter(entry.fk)}>
                  {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip
                  contentStyle={{ background: "hsl(224,71%,6%)", border: "1px solid hsl(216,34%,17%)", borderRadius: 8, fontSize: 12 }}
                  formatter={(value) => [`${value} задач`]}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-3xl font-black text-foreground">{withCuts}</span>
              <span className="text-xs text-muted-foreground">с отсечками</span>
            </div>
          </div>

          <div className="flex flex-col gap-3 flex-1 min-w-[180px]">
            {data.map((d) => (
              <button key={d.fk} onClick={() => onFilter(d.fk)}
                className="flex items-center gap-3 text-left px-3 py-2 rounded-lg hover:bg-secondary transition-colors group">
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold group-hover:text-foreground transition-colors" style={{ color: d.color }}>{d.name}</p>
                  <p className="text-xs text-muted-foreground">{d.value} задач</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-lg font-black" style={{ color: d.color }}>{d.value}</p>
                  <p className="text-xs text-muted-foreground">{d.pct}%</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
