import { Card, CardContent } from "@/components/ui/card"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell
} from "recharts"
import type { Task } from "@/lib/types"
import type { TaskModalData } from "@/components/TaskListModal"
import { useTheme } from "@/lib/theme"

interface MonthlyChartProps {
  tasks: Task[]
  onShowTasks?: (data: TaskModalData) => void
}

const MONTH_NAMES = ["Янв","Фев","Мар","Апр","Май","Июн","Июл","Авг","Сен","Окт","Ноя","Дек"]

interface MonthData {
  label: string; total: number; ak: number; ta: number
  akPct: number; taPct: number; tasks: Task[]
}

export function MonthlyChart({ tasks, onShowTasks }: MonthlyChartProps) {
  const { theme } = useTheme()
  const isDark = theme==="dark"||(theme==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches)

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
        <p style={{color:axisColor,fontSize:10,marginTop:6}}>👆 Нажмите для списка задач</p>
      </div>
    )
  }

  // Recharts Bar.onClick gives (data, index) — открываем модалку с задачами месяца
  const handleClick = (_: unknown, index: number) => {
    const m = data[index]
    if (!m) return
    onShowTasks?.({
      title: m.label,
      subtitle: `Пришло ${m.total} · АрхКом вернул ${m.ak} (${m.akPct}%) · ТА вернул ${m.ta} (${m.taPct}%)`,
      tasks: m.tasks,
    })
  }

  return (
    <Card>
      <CardContent className="p-6">
        <p className="text-sm font-bold text-foreground mb-1">По месяцам — возвраты</p>
        <p className="text-xs text-muted-foreground mb-4">
          Фиолетовый = пришло задач · Зелёный = % АрхКом вернул · Красный = % ТА вернул · Нажмите на столбец для списка задач
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
            <Tooltip content={<CustomTooltip/>} cursor={false}/>

            {/* Пришло — абсолют, левая ось */}
            <Bar yAxisId="abs" dataKey="total" name="Пришло" radius={[4,4,0,0]} cursor="pointer" onClick={handleClick}>
              {data.map((_,i)=>(<Cell key={i} fill={TOTAL} fillOpacity={0.55}/>))}
            </Bar>

            {/* АрхКом % — правая ось */}
            <Bar yAxisId="pct" dataKey="akPct" name="АрхКом %" radius={[4,4,0,0]} cursor="pointer" onClick={handleClick}>
              {data.map((_,i)=>(<Cell key={i} fill={AK} fillOpacity={0.9}/>))}
            </Bar>

            {/* ТА % — правая ось */}
            <Bar yAxisId="pct" dataKey="taPct" name="ТА %" radius={[4,4,0,0]} cursor="pointer" onClick={handleClick}>
              {data.map((_,i)=>(<Cell key={i} fill={TA} fillOpacity={0.9}/>))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        {/* Legend */}
        <div className="flex gap-4 mt-2 flex-wrap">
          {[{c:TOTAL,l:"Пришло (шт)"},{c:AK,l:"АрхКом %"},{c:TA,l:"ТА %"}].map(x=>(
            <span key={x.l} className="flex items-center gap-1.5 text-xs" style={{color:axisColor}}>
              <span style={{width:8,height:8,borderRadius:"50%",background:x.c,display:"inline-block"}}/>
              {x.l}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
