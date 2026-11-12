import * as React from "react"
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

// Variants mirror the Bootstrap Barracks theme (pages/css/framework-theme.css):
//   default     = .btn-primary            secondary/outline = .btn / .btn-outline-*
//   destructive = .btn-danger (outlined, danger underline)   ghost/link = text buttons
// Metrics mirror Bootstrap (rem-based; the app root is 13px): 0.375rem x 0.75rem padding,
// 1rem text, line-height 1.5, 0.375rem radius. Disabled = Bootstrap 0.65 opacity.
// Focus styling comes from the global :focus-visible rule in framework-theme.css.
const buttonVariants = cva(
  "tw:inline-flex tw:shrink-0 tw:cursor-pointer tw:items-center tw:justify-center tw:gap-2 tw:rounded-[0.375rem] tw:border tw:text-base tw:leading-normal tw:font-normal tw:whitespace-nowrap tw:no-underline tw:transition-colors tw:disabled:pointer-events-none tw:disabled:opacity-65 tw:disabled:border-border-inset tw:disabled:bg-surface-inset tw:disabled:text-inset-foreground tw:disabled:no-underline tw:aria-invalid:border-destructive tw:[&_svg]:pointer-events-none tw:[&_svg]:shrink-0 tw:[&_svg:not([class*=size-])]:size-4",
  {
    variants: {
      variant: {
        default: "tw:border-primary tw:bg-primary tw:text-primary-foreground tw:hover:text-primary-foreground",
        secondary:
          "tw:border-border-strong tw:bg-surface-interactive tw:text-secondary-foreground tw:hover:border-border-inset tw:hover:bg-surface-inset tw:hover:text-inset-foreground",
        outline:
          "tw:border-border-strong tw:bg-surface-interactive tw:text-secondary-foreground tw:hover:border-border-inset tw:hover:bg-surface-inset tw:hover:text-inset-foreground tw:aria-pressed:border-primary tw:aria-pressed:bg-primary tw:aria-pressed:text-primary-foreground tw:data-[state=on]:border-primary tw:data-[state=on]:bg-primary tw:data-[state=on]:text-primary-foreground",
        destructive:
          "tw:border-danger-interactive tw:bg-surface-interactive tw:text-secondary-foreground tw:underline tw:decoration-danger-interactive tw:decoration-2 tw:underline-offset-[0.18em] tw:hover:text-secondary-foreground tw:[&_svg]:text-danger-interactive tw:disabled:border-border-subtle tw:disabled:[&_svg]:text-inset-foreground",
        ghost:
          "tw:border-transparent tw:bg-transparent tw:text-foreground tw:hover:bg-surface-interactive tw:hover:text-secondary-foreground",
        link: "tw:border-transparent tw:bg-transparent tw:text-action-foreground tw:underline-offset-4 tw:hover:underline",
      },
      size: {
        default: "tw:px-3 tw:py-1.5",
        xs: "tw:h-6 tw:gap-1 tw:rounded-sm tw:px-2 tw:text-xs tw:[&_svg:not([class*=size-])]:size-3",
        sm: "tw:gap-1.5 tw:rounded-[0.25rem] tw:px-2 tw:py-1 tw:text-sm",
        lg: "tw:rounded-[0.5rem] tw:px-4 tw:py-2 tw:text-xl",
        icon: "tw:size-[calc(2.25rem+2px)]",
        "icon-xs": "tw:size-6 tw:rounded-sm tw:[&_svg:not([class*=size-])]:size-3",
        "icon-sm": "tw:size-[calc(1.875rem+2px)]",
        "icon-lg": "tw:size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
