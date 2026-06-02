import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Modal } from "@/components/ui/modal"
import { Badge } from "@/components/ui/badge"
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Dot
} from "recharts"
import type { Task } from "@/lib/types"
import { useTheme } from "@/lib/theme"
import { ExternalLink } from "lucide-react"

interface TimelineChartProps { tasks: Task[]; dateFrom: string; dateTo: string }

function weekStart(iso: string): string {
  const d = new Date(iso + "T00:00:00"), day = d.getDay()
  d.setDate(d.getDate() + (day===0?-6:1-day))
  return d.toISOString().slice(0,10)
}
function fmtDate(iso: string): string {
  const d = new Date(iso + "T00:00:00")
  return `${String(d.getDate()).padStart(2,"0")}.${String(d.getMonth()+1).padStart(2,"0")}`
}

interface WeekData { date: string; isoKey: string; total: number; ak: number; ta: number; tasks: Task[] }

function TaskModal({ week, onClose }: { week: WeekData; onClose: () => void }) {
  const [filter, setFilter] = useState<"all"|"ak"|"ta">("all")
  const shown = filter==="ak" ? week.tasks.filter(t=>t.v1n>0)
               : filter==="ta" ? week.tasks.filter(t=>t.v2n>0)
               : week.tasks

  const badge = (t: Task) => {
    if (t.v1n>0&&t.v2n>0) return <Badge variant="default">АрхКом+ТА</Badge>
    if (t.v1n>0) return <Badge variant="success">АрхКом</Badge>
    if (t.v2n>0) return <Badge variant="destructive">ТА</Badge>
    return <Badge variant="secondary">✓ Ок</Badge>
  }

  const akCount = week.tasks.filter(t=>t.v1n>0).length
  const taCount = week.tasks.filter(t=>t.v2n>0).length

  return (
    <Modal open onClose={onClose} wide
      title={`Неделя с ${week.date} — ${week.total} задач`}
      subtitle={`АрхКом вернул ${akCount} · ТА вернул ${taCount}`}>
      <div className="flex gap-2 mb-4">
        {([["all",`Все (${week.total})`],["ak",`АрхКом (${akCount})`],["ta",`ТА (${taCount})`]] as const).map(([k,l])=>(
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

// Кликабельная точка на линии
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ClickableDot = (onClick: (isoKey: string) => void) => (props: any) => {
  const { cx, cy, payload } = props
  if (!cx || !cy) return null
  return (
    <circle cx={cx} cy={cy} r={5} fill="hsl(252,87%,70%)" stroke="transparent" strokeWidth={10}
      style={{ cursor:"pointer" }}
      onClick={() => onClick(payload.isoKey)} />
  )
}

export function TimelineChart({ tasks, dateFrom, dateTo }: TimelineChartProps) {
  const { theme } = useTheme()
  const isDark = theme==="dark"||(theme==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches)
  const [selected, setSelected] = useState<WeekData|null>(null)

  const start = new Date(dateFrom+"T00:00:00"), end = new Date(dateTo+"T00:00:00")
  const sd = start.getDay(), mon = new Date(start)
  mon.setDate(start.getDate()+(sd===0?-6:1-sd))

  const weeks: Record<string,WeekData> = {}
  for (const cur = new Date(mon); cur<=end; cur.setDate(cur.getDate()+7)) {
    const k = cur.toISOString().slice(0,10)
    weeks[k] = { date: fmtDate(k), isoKey:k, total:0, ak:0, ta:0, tasks:[] }
  }
  for (const t of tasks) {
    if (!t.entryDate) continue
    const wk = weekStart(t.entryDate)
    if (!weeks[wk]) weeks[wk]={date:fmtDate(wk),isoKey:wk,total:0,ak:0,ta:0,tasks:[]}
    weeks[wk].total++; weeks[wk].tasks.push(t)
    if (t.v1n>0) weeks[wk].ak++
    if (t.v2n>0) weeks[wk].ta++
  }
  const data = Object.keys(weeks).sort().map(k=>weeks[k])

  const tooltipBg     = isDark?"hsl(224,71%,6%)":"#ffffff"
  const tooltipBorder = isDark?"hsl(216,34%,17%)":"hsl(220,13%,88%)"
  const tooltipText   = isDark?"hsl(213,31%,91%)":"hsl(224,71%,10%)"
  const gridColor     = isDark?"hsl(216,34%,17%)":"hsl(220,13%,91%)"
  const axisColor     = isDark?"hsl(215,16%,47%)":"hsl(220,9%,55%)"

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const CustomTooltip=({active,payload,label}:any)=>{
    if(!active||!payload?.length) return null
    const d:WeekData=payload[0]?.payload
    return(
      <div style={{background:tooltipBg,border:`1px solid ${tooltipBorder}`,borderRadius:12,padding:"12px 16px",fontSize:12,minWidth:190,boxShadow:"0 8px 24px rgba(0,0,0,0.15)"}}>
        <p style={{color:tooltipText,fontWeight:700,marginBottom:8}}>Неделя с {label}</p>
        <p style={{color:"hsl(252,87%,70%)",marginBottom:3}}>📋 Пришло: <b>{d.total}</b></p>
        <p style={{color:"hsl(166,76%,40%)",marginBottom:3}}>🔄 АрхКом: <b>{d.ak}</b></p>
        <p style={{color:"hsl(350,89%,60%)",marginBottom:8}}>↩️ ТА: <b>{d.ta}</b></p>
        <p style={{color:axisColor,fontSize:10,borderTop:`1px solid ${tooltipBorder}`,paddingTop:6}}>👆 Нажмите на точку</p>
      </div>
    )
  }

  if (!data.length) {
    return (
      <Card><CardContent className="p-6">
        <p className="text-sm font-bold mb-1">Динамика по неделям</p>
        <p className="text-sm text-muted-foreground">Нет данных</p>
      </CardContent></Card>
    )
  }

  return (
    <>
      <Card>
        <CardContent className="p-6">
          <p className="text-sm font-bold text-foreground mb-1">Динамика по неделям</p>
          <p className="text-xs text-muted-foreground mb-5">
            Задачи, пришедшие к техархам · нажмите на точку для детализации
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={data} margin={{top:4,right:4,left:-20,bottom:0}}>
              <defs>
                <linearGradient id="gTotal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(252,87%,70%)" stopOpacity={isDark?.25:.15}/>
                  <stop offset="95%" stopColor="hsl(252,87%,70%)" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="gAk" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(166,76%,40%)" stopOpacity={isDark?.2:.12}/>
                  <stop offset="95%" stopColor="hsl(166,76%,40%)" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="gTa" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(350,89%,60%)" stopOpacity={isDark?.2:.12}/>
                  <stop offset="95%" stopColor="hsl(350,89%,60%)" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false}/>
              <XAxis dataKey="date" tick={{fill:axisColor,fontSize:11}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fill:axisColor,fontSize:11}} axisLine={false} tickLine={false} allowDecimals={false}/>
              <Tooltip content={<CustomTooltip/>}/>
              <Legend iconType="circle" iconSize={8} wrapperStyle={{fontSize:12,paddingTop:12,color:axisColor}}/>
              <Area type="monotone" dataKey="total" name="Пришло" stroke="hsl(252,87%,70%)" strokeWidth={2.5}
                fill="url(#gTotal)"
                dot={ClickableDot((k)=>setSelected(weeks[k]))}
                activeDot={{r:6,cursor:"pointer",onClick:(_:unknown,p:any)=>setSelected(weeks[p.payload.isoKey])}}/>
              <Area type="monotone" dataKey="ak" name="АрхКом" stroke="hsl(166,76%,40%)" strokeWidth={1.5}
                fill="url(#gAk)" strokeDasharray="5 3" dot={false}
                activeDot={{r:5,cursor:"pointer",onClick:(_:unknown,p:any)=>setSelected(weeks[p.payload.isoKey])}}/>
              <Area type="monotone" dataKey="ta" name="ТА" stroke="hsl(350,89%,60%)" strokeWidth={1.5}
                fill="url(#gTa)" strokeDasharray="5 3" dot={false}
                activeDot={{r:5,cursor:"pointer",onClick:(_:unknown,p:any)=>setSelected(weeks[p.payload.isoKey])}}/>
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {selected&&<TaskModal week={selected} onClose={()=>setSelected(null)}/>}
    </>
  )
}
