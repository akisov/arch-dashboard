import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface StatCardProps {
  label: string
  value: number
  sub: string
  icon: string
  color: "purple" | "teal" | "rose" | "amber" | "sky"
}

const colorMap = {
  purple: { bar: "bg-[hsl(var(--chart-1))]", icon: "bg-[hsl(var(--chart-1))/0.15]", val: "text-[hsl(var(--chart-1))]" },
  teal:   { bar: "bg-[hsl(var(--chart-2))]", icon: "bg-[hsl(var(--chart-2))/0.15]", val: "text-[hsl(var(--chart-2))]" },
  rose:   { bar: "bg-[hsl(var(--chart-3))]", icon: "bg-[hsl(var(--chart-3))/0.15]", val: "text-[hsl(var(--chart-3))]" },
  amber:  { bar: "bg-[hsl(var(--chart-4))]", icon: "bg-[hsl(var(--chart-4))/0.15]", val: "text-[hsl(var(--chart-4))]" },
  sky:    { bar: "bg-[hsl(var(--chart-5))]", icon: "bg-[hsl(var(--chart-5))/0.15]", val: "text-[hsl(var(--chart-5))]" },
}

export function StatCard({ label, value, sub, icon, color }: StatCardProps) {
  const c = colorMap[color]
  return (
    <Card className="relative overflow-hidden hover:-translate-y-1 hover:shadow-[var(--shadow-hover)] transition-all duration-200 cursor-default">
      <div className={cn("absolute top-0 left-0 right-0 h-0.5", c.bar)} />
      <CardContent className="p-6">
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center text-xl mb-4", c.icon)}>
          {icon}
        </div>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">{label}</p>
        <p className={cn("text-5xl font-black tracking-tighter leading-none mb-1", c.val)}>{value}</p>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  )
}
