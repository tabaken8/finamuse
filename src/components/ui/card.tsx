import * as React from "react"
import { cn } from "@/lib/utils" // クラス名を結合するユーティリティ（なければ普通の className でOK）

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {}

function Card({ className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-white text-gray-900 shadow-sm",
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: CardProps) {
  return (
    <div className={cn("p-4 border-b", className)} {...props} />
  )
}

function CardTitle({ className, ...props }: CardProps) {
  return (
    <h3 className={cn("font-semibold text-lg", className)} {...props} />
  )
}

function CardDescription({ className, ...props }: CardProps) {
  return (
    <p className={cn("text-sm text-gray-500", className)} {...props} />
  )
}

function CardContent({ className, ...props }: CardProps) {
  return (
    <div className={cn("p-4", className)} {...props} />
  )
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent }
