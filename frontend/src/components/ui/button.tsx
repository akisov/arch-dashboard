import { cn } from "@/lib/utils"

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "outline" | "ghost" | "destructive"
  size?: "default" | "sm" | "lg" | "icon"
}

export function Button({ className, variant = "default", size = "default", ...props }: ButtonProps) {
  return (
    <button className={cn(
      "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-all focus-visible:outline-none disabled:opacity-40 disabled:pointer-events-none",
      {
        "bg-primary text-primary-foreground hover:bg-primary/90": variant === "default",
        "border border-border bg-transparent text-foreground hover:bg-accent hover:border-primary/50": variant === "outline",
        "bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground": variant === "ghost",
        "bg-destructive/20 text-destructive hover:bg-destructive/30": variant === "destructive",
      },
      {
        "h-10 px-4 text-sm": size === "default",
        "h-8 px-3 text-xs": size === "sm",
        "h-12 px-6 text-base": size === "lg",
        "h-9 w-9": size === "icon",
      },
      className
    )} {...props} />
  )
}
