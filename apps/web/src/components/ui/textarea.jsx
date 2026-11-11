import * as React from "react"
import { cn } from "@/lib/utils"

function Textarea({
  className,
  ...props
}) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "tw:flex tw:field-sizing-content tw:min-h-16 tw:w-full tw:rounded-[0.375rem] tw:border tw:border-border-strong tw:bg-surface-interactive tw:px-3 tw:py-1.5 tw:leading-normal tw:text-base tw:text-secondary-foreground tw:transition-[color,box-shadow] tw:outline-none tw:placeholder:text-secondary-foreground tw:disabled:cursor-not-allowed tw:disabled:border-border-inset tw:disabled:bg-surface-inset tw:disabled:text-inset-foreground tw:aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
