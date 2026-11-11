import * as React from "react"
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils"

const alertVariants = cva(
  "tw:relative tw:grid tw:w-full tw:grid-cols-[0_1fr] tw:items-start tw:gap-y-0.5 tw:rounded-[0.375rem] tw:border tw:border-border-raised tw:p-4 tw:text-base tw:has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] tw:has-[>svg]:gap-x-3 tw:[&>svg]:size-4 tw:[&>svg]:translate-y-0.5 tw:[&>svg]:text-current",
  {
    variants: {
      variant: {
        default: "tw:bg-card tw:text-card-foreground",
        success: "tw:border-success tw:bg-card tw:text-card-foreground tw:[&>svg]:text-success",
        destructive:
          "tw:border-danger tw:bg-card tw:text-card-foreground tw:[&>svg]:text-danger",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Alert({
  className,
  variant,
  ...props
}) {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  )
}

function AlertTitle({
  className,
  ...props
}) {
  return (
    <div
      data-slot="alert-title"
      className={cn(
        "tw:col-start-2 tw:min-h-4",
        className
      )}
      {...props}
    />
  )
}

function AlertDescription({
  className,
  ...props
}) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        "tw:col-start-2 tw:grid tw:justify-items-start tw:gap-1 tw:text-muted-raised",
        className
      )}
      {...props}
    />
  )
}

export { Alert, AlertTitle, AlertDescription }
