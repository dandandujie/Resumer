"use client"

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { Toaster as Sonner, type ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      position="top-left"
      offset={{ top: 14, left: 14 }}
      visibleToasts={2}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "toast-compact border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text)] shadow-[0_10px_30px_-18px_rgba(28,26,23,0.35)]",
          title: "text-[11px] font-medium leading-snug",
          description: "text-[10px] leading-snug text-[var(--app-text-muted)]",
          icon: "size-3",
        },
      }}
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--success-bg": "var(--app-surface-muted)",
          "--success-text": "var(--app-text)",
          "--success-border": "var(--app-border)",
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
