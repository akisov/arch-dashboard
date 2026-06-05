import { useEffect, useState } from "react"
import { Progress } from "@/components/ui/progress"
import { Loader2 } from "lucide-react"

interface SyncProgressProps {
  title: string
  msg: string
  pct: number
  hint?: string
}

// Пасхалка — то самое письмо про «ЗД-экшон» и «грабить корованы» 🐪
const FUN_MESSAGES = [
  "🐪 Грабим корованы…",
  "🌲 Делаем лес погуще…",
  "🧝 Расставляем лесных эльфов…",
  "🏰 Защищаем дворец злодея…",
  "📐 Преобразуем деревья в 3Д…",
  "⚔️ Формируем ЗД-экшон…",
  "🕵️ Засылаем шпионов к эльфам…",
  "👑 Слушаемся императора…",
  "🐎 Нападаем войсками на дворец…",
  "🗡️ Отрубаем руку (по желанию)…",
  "👁️ Выкалываем глаз (необязательно)…",
  "🦿 Ставим протез — самое хорошее…",
  "💾 Сохраняемся… (можно!)",
  "🎮 Джва года ждали этот синк…",
]

export function SyncProgress({ title, msg, pct, hint }: SyncProgressProps) {
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setI(x => x + 1), 2200)
    return () => clearInterval(t)
  }, [])
  const fun = FUN_MESSAGES[i % FUN_MESSAGES.length]

  return (
    <div className="rounded-xl border border-border bg-card p-12 text-center">
      <div className="flex justify-center mb-6">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Loader2 className="w-7 h-7 text-primary animate-spin" />
        </div>
      </div>
      <p className="text-lg font-bold text-foreground mb-2">{title}</p>

      {/* Пасхалка: крутящиеся смешные надписи */}
      <p key={i} className="text-base font-semibold text-primary mb-1 min-h-[24px] animate-fade-in-up">
        {fun}
      </p>
      <p className="text-xs text-muted-foreground mb-6 min-h-[16px]">{msg}</p>

      <div className="max-w-md mx-auto mb-4">
        <Progress value={pct} className="h-2" />
      </div>
      <p className="text-xs text-muted-foreground">{pct}%{hint ? ` · ${hint}` : ""}</p>
    </div>
  )
}
