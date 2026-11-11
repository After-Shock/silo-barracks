import * as React from "react"
import { cn } from "@/lib/utils"

function Input({
  className,
  type,
  ...props
}) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "tw:w-full tw:min-w-0 tw:rounded-[0.375rem] tw:border tw:border-border-strong tw:bg-surface-interactive tw:px-3 tw:py-1.5 tw:leading-normal tw:text-base tw:text-secondary-foreground tw:transition-[color,box-shadow] tw:outline-none tw:selection:bg-primary tw:selection:text-primary-foreground tw:file:inline-flex tw:file:h-7 tw:file:border-0 tw:file:bg-transparent tw:file:text-sm tw:file:font-medium tw:file:text-foreground tw:placeholder:text-secondary-foreground tw:disabled:pointer-events-none tw:disabled:cursor-not-allowed tw:disabled:border-border-inset tw:disabled:bg-surface-inset tw:disabled:text-inset-foreground",
        "",
        "tw:aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Input }
