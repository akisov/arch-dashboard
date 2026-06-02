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

interface MonthlyChartProps { tasks: Task[] }

const MONTH_NAMES = ["Янв","Фев","Мар","Апр","Май","Июн","Июл","Авг","Сен","Окт","Ноя","Дек"]

function fmtDate(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso + "T00:00:00")
  return `${String(d.getDate()).padStart(2,"0")}.${String(d.getMonth()+1).padStart(2,"0")}`
}

interface MonthData {
  key: string; label: string; total: number; ak: number; ta: number
  akPct: number; taPct: number; tasks: Task[]
}

function TaskModal({ month, onClose }: { month: MonthData; onClose: () => void }) {
  const [filter, setFilter] = useState<"all"|"ak"|"ta">("all")
  const shown = filter === "ak" ? month.tasks.filter(t=>t.v1n>0)
               : filter === "ta" ? month.tasks.filter(t=>t.v2n>0)
               : month.tasks

  const badge = (t: Task) => {
    if (t.v1n>0&&t.v2n>0) return <Badge variant="default">АрхКом+ТА</Badge>
    if (t.v1n>0) return <Badge variant="success">АрхКом</Badge>
    if (t.v2n>0) return <Badge variant="destructive">ТА</Badge>
    return <Badge variant="secondary">✓ Ок</Badge>
  }

  return (
    <Modal open onClose={onClose} wide
      title={`${month.label} — ${month.total} задач`}
      subtitle={`АрхКом вернул ${month.ak} (${month.akPct}%) · ТА вернул ${month.ta} (${month.taPct}%)`}>
      <div className="flex gap-2 mb-4">
        {([["all",`Все (${month.total})`],["ak",`АрхКом (${month.ak})`],["ta",`ТА (${month.ta})`]] as const).map(([k,l])=>(
          <button key={k} onClick={()=>setFilter(k)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
              filter===k ? "bg-primary border-primary text-primary-foreground"
                         : "border-border text-muted-foreground hover:text-foreground bg-transparent"}`}>
            {l}
          </button>
        ))}
      </div>
      <div className="space-y-2">
        {shown.sort((a,b)=>b.total-a.total).map(t=>(
          <div key={t.key} className="flex items-center gap-3 px-4 py-3 rounded-xl border border-border hover:bg-secondary/40 transition-colors">
            <a href={t.url} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1 text-primary font-mono text-xs font-bold hover:underline whitespace-nowrap shrink-0">
              {t.key}<ExternalLink className="w-3 h-3 opacity-40"/>
            </a>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-foreground truncate">{t.title}</p>
              <p className="text-xs text-muted-foreground">{t.entryDate ? fmtDate(t.entryDate) : "—"}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {badge(t)}
              {t.total>0&&<span className="w-6 h-6 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-black flex items-center justify-center">{t.total}</span>}
            </div>
          </div>
        ))}
        {shown.length===0&&<p className="text-center text-muted-foreground text-sm py-8">Нет задач</p>}
      </div>
    </Modal>
  )
}

export function MonthlyChart({ tasks }: MonthlyChartProps) {
  const { theme } = useTheme()
  const isDark = theme==="dark"||(theme==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches)
  const [selected, setSelected] = useState<MonthData|null>(null)
  const [hoveredBar, setHoveredBar] = useState<string|null>(null)

  const monthMap: Record<string,MonthData> = {}
  for (const t of tasks) {
    if (!t.entryDate) continue
    const d = new Date(t.entryDate+"T00:00:00")
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`
    const label = `${MONTH_NAMES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`
    if (!monthMap[key]) monthMap[key]={key,label,total:0,ak:0,ta:0,akPct:0,taPct:0,tasks:[]}
    monthMap[key].total++; monthMap[key].tasks.push(t)
    if (t.v1n>0) monthMap[key].ak++
    if (t.v2n>0) monthMap[key].ta++
  }
  const data: MonthData[] = Object.keys(monthMap).sort().map(k=>{
    const m=monthMap[k]
    return{...m,akPct:m.total>0?Math.round(m.ak/m.total*100):0,taPct:m.total>0?Math.round(m.ta/m.total*100):0}
  })

  if (data.length===0) return null

  const tooltipBg     = isDark?"hsl(224,71%,6%)":"#ffffff"
  const tooltipBorder = isDark?"hsl(216,34%,17%)":"hsl(220,13%,88%)"
  const tooltipText   = isDark?"hsl(213,31%,91%)":"hsl(224,71%,10%)"
  const gridColor     = isDark?"hsl(216,34%,17%)":"hsl(220,13%,91%)"
  const axisColor     = isDark?"hsl(215,16%,47%)":"hsl(220,9%,55%)"

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const CustomTooltip=({active,payload,label}:any)=>{
    if(!active||!payload?.length) return null
    const d:MonthData=payload[0]?.payload
    return(
      <div style={{background:tooltipBg,border:`1px solid ${tooltipBorder}`,borderRadius:12,padding:"12px 16px",fontSize:12,minWidth:190,boxShadow:"0 8px 24px rgba(0,0,0,0.15)"}}>
        <p style={{color:tooltipText,fontWeight:700,marginBottom:8}}>{label}</p>
        <p style={{color:"hsl(252,87%,70%)",marginBottom:3}}>📋 Пришло: <b>{d.total}</b></p>
        <p style={{color:"hsl(166,76%,40%)",marginBottom:3}}>🔄 АрхКом: <b>{d.ak}</b> <span style={{opacity:.7}}>({d.akPct}%)</span></p>
        <p style={{color:"hsl(350,89%,60%)",marginBottom:8}}>↩️ ТА: <b>{d.ta}</b> <span style={{opacity:.7}}>({d.taPct}%)</span></p>
        <p style={{color:axisColor,fontSize:10,borderTop:`1px solid ${tooltipBorder}`,paddingTop:6}}>👆 Нажмите на столбец</p>
      </div>
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleBarClick=(entry:any)=>{ if(entry?.payload) setSelected(entry.payload) }

  return(
    <>
      <Card>
        <CardContent className="p-6">
          <p className="text-sm font-bold text-foreground mb-1">По месяцам — % возвратов</p>
          <p className="text-xs text-muted-foreground mb-5">Нажмите на столбец для детализации задач</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data} margin={{top:8,right:16,left:-20,bottom:0}} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false}/>
              <XAxis dataKey="label" tick={{fill:axisColor,fontSize:11}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fill:axisColor,fontSize:11}} axisLine={false} tickLine={false}
                tickFormatter={v=>`${v}%`} domain={[0,100]}/>
              <Tooltip content={<CustomTooltip/>}
                cursor={{fill:isDark?"rgba(255,255,255,0.04)":"rgba(0,0,0,0.04)",radius:6}}/>
              <Legend iconType="circle" iconSize={8} wrapperStyle={{fontSize:12,paddingTop:12,color:axisColor}}/>

              <Bar dataKey="akPct" name="АрхКом %" radius={[4,4,0,0]}
                onClick={handleBarClick} cursor="pointer"
                onMouseEnter={(_,i)=>setHoveredBar(`ak-${i}`)} onMouseLeave={()=>setHoveredBar(null)}>
                {data.map((_,i)=>(
                  <Cell key={i} fill="hsl(166,76%,40%)"
                    fillOpacity={hoveredBar===`ak-${i}`?1:hoveredBar&&hoveredBar!==`ak-${i}`?0.5:0.8}/>
                ))}
              </Bar>

              <Bar dataKey="taPct" name="ТА %" radius={[4,4,0,0]}
                onClick={handleBarClick} cursor="pointer"
                onMouseEnter={(_,i)=>setHoveredBar(`ta-${i}`)} onMouseLeave={()=>setHoveredBar(null)}>
                {data.map((_,i)=>(
                  <Cell key={i} fill="hsl(350,89%,60%)"
                    fillOpacity={hoveredBar===`ta-${i}`?1:hoveredBar&&hoveredBar!==`ta-${i}`?0.5:0.8}/>
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {selected&&<TaskModal month={selected} onClose={()=>setSelected(null)}/>}
    </>
  )
}
