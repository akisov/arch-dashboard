import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Modal } from "@/components/ui/modal"
import { Badge } from "@/components/ui/badge"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Cell
} from "recharts"
import type { Task } from "@/lib/types"
import { useTheme } from "@/lib/theme"
import { ExternalLink } from "lucide-react"

interface MonthlyChartProps {
  tasks: Task[]
}

const MONTH_NAMES = ["Янв","Фев","Мар","Апр","Май","Июн","Июл","Авг","Сен","Окт","Ноя","Дек"]

function fmtDate(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso + "T00:00:00")
  return `${String(d.getDate()).padStart(2,"0")}.${String(d.getMonth()+1).padStart(2,"0")}`
}

interface MonthData {
  key: string
  label: string
  total: number
  ak: number
  ta: number
  akPct: number
  taPct: number
  tasks: Task[]
}

export function MonthlyChart({ tasks }: MonthlyChartProps) {
  const { theme } = useTheme()
  const isDark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)

  const [modal, setModal] = useState<{ month: MonthData; filter: "all"|"ak"|"ta" } | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)

  // Group by month
  const monthMap: Record<string, MonthData> = {}
  for (const t of tasks) {
    if (!t.entryDate) continue
    const d = new Date(t.entryDate + "T00:00:00")
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`
    const label = `${MONTH_NAMES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`
    if (!monthMap[key]) monthMap[key] = { key, label, total:0, ak:0, ta:0, akPct:0, taPct:0, tasks:[] }
    monthMap[key].total++
    monthMap[key].tasks.push(t)
    if (t.v1n > 0) monthMap[key].ak++
    if (t.v2n > 0) monthMap[key].ta++
  }
  const data: MonthData[] = Object.keys(monthMap).sort().map(k => {
    const m = monthMap[k]
    return { ...m, akPct: m.total>0?Math.round(m.ak/m.total*100):0, taPct: m.total>0?Math.round(m.ta/m.total*100):0 }
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
    const d: MonthData = payload[0]?.payload
    return (
      <div style={{ background: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: 12, padding:"12px 16px", fontSize:12, minWidth:180 }}>
        <p style={{ color: tooltipText, fontWeight:700, marginBottom:8 }}>{label}</p>
        <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
          <p style={{ color:"hsl(252,87%,70%)" }}>📋 Пришло: <b>{d.total}</b></p>
          <p style={{ color:"hsl(166,76%,40%)" }}>🔄 АрхКом вернул: <b>{d.ak}</b> <span style={{opacity:.7}}>({d.akPct}%)</span></p>
          <p style={{ color:"hsl(350,89%,60%)" }}>↩️ ТА вернул: <b>{d.ta}</b> <span style={{opacity:.7}}>({d.taPct}%)</span></p>
        </div>
        <p style={{ color:axisColor, marginTop:8, fontSize:10 }}>Нажмите для детализации →</p>
      </div>
    )
  }

  const modalTasks = modal
    ? modal.filter === "ak" ? modal.month.tasks.filter(t=>t.v1n>0)
    : modal.filter === "ta" ? modal.month.tasks.filter(t=>t.v2n>0)
    : modal.month.tasks
    : []

  const badge = (t: Task) => {
    if (t.v1n>0&&t.v2n>0) return <Badge variant="default">АрхКом+ТА</Badge>
    if (t.v1n>0) return <Badge variant="success">АрхКом</Badge>
    if (t.v2n>0) return <Badge variant="destructive">ТА</Badge>
    return <Badge variant="secondary">✓ Ок</Badge>
  }

  return (
    <>
      <Card>
        <CardContent className="p-6">
          <p className="text-sm font-bold text-foreground mb-1">По месяцам — % возвратов</p>
          <p className="text-xs text-muted-foreground mb-1">
            Столбцы показывают % задач, которые вернул АрхКом и ТА от пришедших в месяц
          </p>
          <p className="text-xs text-muted-foreground mb-5 flex items-center gap-1">
            <span className="text-primary">↗</span> Нажмите на столбец чтобы увидеть задачи
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data} margin={{ top: 8, right: 16, left: -20, bottom: 0 }} barCategoryGap="30%"
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              onClick={(e: any) => { if (e?.activePayload?.[0]) setModal({ month: e.activePayload[0].payload, filter:"all" }) }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false}/>
              <XAxis dataKey="label" tick={{ fill:axisColor, fontSize:11 }} axisLine={false} tickLine={false}/>
              <YAxis tick={{ fill:axisColor, fontSize:11 }} axisLine={false} tickLine={false}
                tickFormatter={v => `${v}%`} domain={[0, 100]}/>
              <Tooltip content={<CustomTooltip/>} cursor={{ fill: isDark?"rgba(255,255,255,0.04)":"rgba(0,0,0,0.04)", radius:6 }}/>
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize:12, paddingTop:12, color:axisColor }}/>
              <Bar dataKey="akPct" name="АрхКом %" radius={[4,4,0,0]} cursor="pointer"
                onMouseEnter={(_,i)=>setHovered(`ak-${i}`)} onMouseLeave={()=>setHovered(null)}>
                {data.map((_, i) => (
                  <Cell key={i} fill="hsl(166,76%,40%)" fillOpacity={hovered===`ak-${i}`?1:0.8}/>
                ))}
              </Bar>
              <Bar dataKey="taPct" name="ТА %" radius={[4,4,0,0]} cursor="pointer"
                onMouseEnter={(_,i)=>setHovered(`ta-${i}`)} onMouseLeave={()=>setHovered(null)}>
                {data.map((_, i) => (
                  <Cell key={i} fill="hsl(350,89%,60%)" fillOpacity={hovered===`ta-${i}`?1:0.8}/>
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Modal */}
      {modal && (
        <Modal open={true} onClose={() => setModal(null)} wide
          title={`${modal.month.label} — ${modal.month.total} задач`}
          subtitle={`АрхКом вернул ${modal.month.ak} (${modal.month.akPct}%) · ТА вернул ${modal.month.ta} (${modal.month.taPct}%)`}>

          {/* Filter tabs inside modal */}
          <div className="flex gap-2 mb-4">
            {[
              { key:"all", label:`Все (${modal.month.total})` },
              { key:"ak",  label:`АрхКом (${modal.month.ak})` },
              { key:"ta",  label:`ТА (${modal.month.ta})` },
            ].map(f => (
              <button key={f.key}
                onClick={() => setModal(m => m ? { ...m, filter: f.key as "all"|"ak"|"ta" } : null)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  modal.filter === f.key
                    ? "bg-primary border-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}>
                {f.label}
              </button>
            ))}
          </div>

          {/* Task list */}
          <div className="space-y-2">
            {modalTasks.sort((a,b)=>b.total-a.total).map(t => (
              <div key={t.key}
                className="flex items-center gap-3 px-4 py-3 rounded-xl border border-border hover:bg-secondary/40 transition-colors">
                <a href={t.url} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-primary font-mono text-xs font-bold hover:underline whitespace-nowrap shrink-0">
                  {t.key} <ExternalLink className="w-3 h-3 opacity-40"/>
                </a>
                <span className="text-sm text-foreground flex-1 min-w-0 truncate">{t.title}</span>
                <div className="flex items-center gap-2 shrink-0">
                  {badge(t)}
                  {t.total > 0 && (
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-black">
                      {t.total}
                    </span>
                  )}
                </div>
              </div>
            ))}
            {modalTasks.length === 0 && (
              <p className="text-center text-muted-foreground text-sm py-8">Нет задач для выбранного фильтра</p>
            )}
          </div>
        </Modal>
      )}
    </>
  )
}
