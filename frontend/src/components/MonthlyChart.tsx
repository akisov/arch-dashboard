import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell
} from "recharts"
import type { Task } from "@/lib/types"
import { useTheme } from "@/lib/theme"
import { ExternalLink, X } from "lucide-react"
import { cn } from "@/lib/utils"

interface MonthlyChartProps { tasks: Task[] }

const MONTH_NAMES = ["Янв","Фев","Мар","Апр","Май","Июн","Июл","Авг","Сен","Окт","Ноя","Дек"]

function fmtDate(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso + "T00:00:00")
  return `${String(d.getDate()).padStart(2,"0")}.${String(d.getMonth()+1).padStart(2,"0")}`
}

interface MonthData {
  label: string; total: number; ak: number; ta: number
  akPct: number; taPct: number; tasks: Task[]
}

export function MonthlyChart({ tasks }: MonthlyChartProps) {
  const { theme } = useTheme()
  const isDark = theme==="dark"||(theme==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches)

  const [selectedIdx, setSelectedIdx] = useState<number|null>(null)
  const [tabFilter, setTabFilter] = useState<"all"|"ak"|"ta">("all")

  // Build month data
  const monthMap: Record<string, MonthData> = {}
  for (const t of tasks) {
    if (!t.entryDate) continue
    const d = new Date(t.entryDate+"T00:00:00")
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`
    const label = `${MONTH_NAMES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`
    if (!monthMap[key]) monthMap[key]={label,total:0,ak:0,ta:0,akPct:0,taPct:0,tasks:[]}
    monthMap[key].total++; monthMap[key].tasks.push(t)
    if (t.v1n>0) monthMap[key].ak++
    if (t.v2n>0) monthMap[key].ta++
  }
  const data: MonthData[] = Object.keys(monthMap).sort().map(k=>{
    const m=monthMap[k]
    return{...m, akPct:m.total>0?Math.round(m.ak/m.total*100):0, taPct:m.total>0?Math.round(m.ta/m.total*100):0}
  })

  if (data.length===0) return null

  const selected = selectedIdx !== null ? data[selectedIdx] : null

  const tooltipBg     = isDark?"hsl(224,71%,6%)":"#fff"
  const tooltipBorder = isDark?"hsl(216,34%,17%)":"hsl(220,13%,88%)"
  const tooltipText   = isDark?"hsl(213,31%,91%)":"hsl(224,71%,10%)"
  const gridColor     = isDark?"hsl(216,34%,17%)":"hsl(220,13%,91%)"
  const axisColor     = isDark?"hsl(215,16%,47%)":"hsl(220,9%,55%)"

  const AK = "hsl(166,76%,40%)"
  const TA = "hsl(350,89%,60%)"
  const TOTAL = "hsl(252,87%,70%)"

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const CustomTooltip = ({active,payload,label}:any) => {
    if(!active||!payload?.length) return null
    const d:MonthData = payload[0]?.payload
    if(!d) return null
    return(
      <div style={{background:tooltipBg,border:`1px solid ${tooltipBorder}`,borderRadius:10,padding:"10px 14px",fontSize:12,boxShadow:"0 4px 16px rgba(0,0,0,0.12)"}}>
        <p style={{color:tooltipText,fontWeight:700,marginBottom:6}}>{label}</p>
        <p style={{color:TOTAL,marginBottom:2}}>📋 Пришло: <b>{d.total}</b></p>
        <p style={{color:AK,marginBottom:2}}>🔄 АрхКом: <b>{d.ak}</b> ({d.akPct}%)</p>
        <p style={{color:TA}}>↩️ ТА: <b>{d.ta}</b> ({d.taPct}%)</p>
      </div>
    )
  }

  // Recharts Bar.onClick gives (data, index) — use index to find our MonthData
  const handleClick = (_: unknown, index: number) => {
    if (selectedIdx === index) {
      setSelectedIdx(null)
    } else {
      setSelectedIdx(index)
      setTabFilter("all")
    }
  }

  const shownTasks = !selected ? [] :
    tabFilter==="ak" ? selected.tasks.filter(t=>t.v1n>0) :
    tabFilter==="ta" ? selected.tasks.filter(t=>t.v2n>0) :
    selected.tasks

  const badge = (t: Task) => {
    if(t.v1n>0&&t.v2n>0) return <Badge variant="default">АрхКом+ТА</Badge>
    if(t.v1n>0) return <Badge variant="success">АрхКом</Badge>
    if(t.v2n>0) return <Badge variant="destructive">ТА</Badge>
    return <Badge variant="secondary">✓ Ок</Badge>
  }

  return (
    <Card>
      <CardContent className="p-6">
        <p className="text-sm font-bold text-foreground mb-1">По месяцам — возвраты</p>
        <p className="text-xs text-muted-foreground mb-4">
          Фиолетовый = пришло задач · Зелёный = % АрхКом вернул · Красный = % ТА вернул · Нажмите для деталей
        </p>

        <ResponsiveContainer width="100%" height={210}>
          <BarChart data={data} margin={{top:4,right:8,left:-16,bottom:0}} barCategoryGap="30%" barGap={3}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false}/>
            <XAxis dataKey="label" tick={{fill:axisColor,fontSize:11}} axisLine={false} tickLine={false}/>
            {/* Left: absolute count */}
            <YAxis yAxisId="abs" tick={{fill:axisColor,fontSize:11}} axisLine={false} tickLine={false} allowDecimals={false} width={28}/>
            {/* Right: percent */}
            <YAxis yAxisId="pct" orientation="right" tick={{fill:axisColor,fontSize:11}} axisLine={false} tickLine={false}
              tickFormatter={v=>`${v}%`} domain={[0,100]} width={36}/>
            <Tooltip content={<CustomTooltip/>} cursor={{fill:isDark?"rgba(255,255,255,0.03)":"rgba(0,0,0,0.03)",radius:4}}/>

            {/* Пришло — абсолют, левая ось */}
            <Bar yAxisId="abs" dataKey="total" name="Пришло" radius={[4,4,0,0]} cursor="pointer" onClick={handleClick}>
              {data.map((_,i)=>(
                <Cell key={i} fill={TOTAL}
                  fillOpacity={selectedIdx===null?0.5:selectedIdx===i?0.9:0.2}
                  stroke={selectedIdx===i?TOTAL:"none"} strokeWidth={2}/>
              ))}
            </Bar>

            {/* АрхКом % — правая ось */}
            <Bar yAxisId="pct" dataKey="akPct" name="АрхКом %" radius={[4,4,0,0]} cursor="pointer" onClick={handleClick}>
              {data.map((_,i)=>(
                <Cell key={i} fill={AK}
                  fillOpacity={selectedIdx===null?0.85:selectedIdx===i?1:0.3}
                  stroke={selectedIdx===i?AK:"none"} strokeWidth={2}/>
              ))}
            </Bar>

            {/* ТА % — правая ось */}
            <Bar yAxisId="pct" dataKey="taPct" name="ТА %" radius={[4,4,0,0]} cursor="pointer" onClick={handleClick}>
              {data.map((_,i)=>(
                <Cell key={i} fill={TA}
                  fillOpacity={selectedIdx===null?0.85:selectedIdx===i?1:0.3}
                  stroke={selectedIdx===i?TA:"none"} strokeWidth={2}/>
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        {/* Legend */}
        <div className="flex gap-4 mt-2 mb-1 flex-wrap">
          {[{c:TOTAL,l:"Пришло (шт)"},{c:AK,l:"АрхКом %"},{c:TA,l:"ТА %"}].map(x=>(
            <span key={x.l} className="flex items-center gap-1.5 text-xs" style={{color:axisColor}}>
              <span style={{width:8,height:8,borderRadius:"50%",background:x.c,display:"inline-block"}}/>
              {x.l}
            </span>
          ))}
        </div>

        {/* Inline task panel */}
        {selected ? (
          <div className="mt-4 border border-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-4 py-3 bg-secondary/50 border-b border-border flex-wrap">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm font-bold">{selected.label}</span>
                <span className="text-xs text-muted-foreground">Пришло: {selected.total} · АрхКом: {selected.ak} ({selected.akPct}%) · ТА: {selected.ta} ({selected.taPct}%)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  {([["all",`Все (${selected.total})`],["ak",`АрхКом (${selected.ak})`],["ta",`ТА (${selected.ta})`]] as const).map(([k,l])=>(
                    <button key={k} onClick={()=>setTabFilter(k)}
                      className={cn("px-2.5 py-1 rounded-md text-xs font-semibold border transition-all",
                        tabFilter===k?"bg-primary border-primary text-primary-foreground"
                                   :"border-border text-muted-foreground hover:text-foreground bg-transparent")}>
                      {l}
                    </button>
                  ))}
                </div>
                <button onClick={()=>setSelectedIdx(null)} className="text-muted-foreground hover:text-foreground transition-colors ml-1">
                  <X className="w-4 h-4"/>
                </button>
              </div>
            </div>
            <div className="divide-y divide-border max-h-72 overflow-y-auto">
              {shownTasks.sort((a,b)=>b.total-a.total).map(t=>(
                <div key={t.key} className="flex items-center gap-3 px-4 py-2.5 hover:bg-secondary/30 transition-colors">
                  <a href={t.url} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1 text-primary font-mono text-xs font-bold hover:underline whitespace-nowrap shrink-0">
                    {t.key}<ExternalLink className="w-3 h-3 opacity-40"/>
                  </a>
                  <span className="text-sm text-foreground flex-1 min-w-0 truncate">{t.title}</span>
                  <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">{fmtDate(t.entryDate)}</span>
                  <div className="shrink-0">{badge(t)}</div>
                  {t.total>0&&<span className="w-5 h-5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-black flex items-center justify-center shrink-0">{t.total}</span>}
                </div>
              ))}
              {shownTasks.length===0&&<p className="text-center text-muted-foreground text-sm py-6">Нет задач</p>}
            </div>
          </div>
        ) : (
          <p className="text-center text-xs text-muted-foreground mt-3">↓ Нажмите на столбец — задачи появятся здесь</p>
        )}
      </CardContent>
    </Card>
  )
}
