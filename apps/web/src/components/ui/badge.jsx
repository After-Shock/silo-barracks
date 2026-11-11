import * as React from "react"
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

const badgeVariants = cva(
  "tw:inline-flex tw:w-fit tw:shrink-0 tw:items-center tw:justify-center tw:gap-1 tw:overflow-hidden tw:rounded-[0.375rem] tw:border tw:border-transparent tw:px-[0.65em] tw:py-[0.35em] tw:text-[0.75em] tw:leading-none tw:font-bold tw:whitespace-nowrap tw:transition-[color,box-shadow] tw:aria-invalid:border-destructive tw:[&>svg]:pointer-events-none tw:[&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "tw:bg-primary tw:text-primary-foreground tw:[a&]:hover:bg-primary/90",
        secondary:
          "tw:border-border-strong tw:bg-surface-interactive tw:text-secondary-foreground",
        destructive:
          "tw:bg-destructive tw:text-destructive-foreground tw:focus-visible:ring-destructive/20 tw:[a&]:hover:bg-destructive/90",
        outline:
          "tw:border-border tw:text-foreground tw:[a&]:hover:bg-accent tw:[a&]:hover:text-accent-foreground",
        ghost: "tw:[a&]:hover:bg-accent tw:[a&]:hover:text-accent-foreground",
        link: "tw:text-primary tw:underline-offset-4 tw:[a&]:hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
