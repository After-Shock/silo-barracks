import * as React from "react"
import { cn } from "@/lib/utils"
import { CheckIcon } from "lucide-react"
import { Checkbox as CheckboxPrimitive } from "radix-ui"

function Checkbox({
  className,
  ...props
}) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "tw:peer tw:size-4 tw:shrink-0 tw:rounded-[4px] tw:border tw:border-border-strong tw:transition-shadow tw:outline-none tw:disabled:cursor-not-allowed tw:disabled:opacity-50 tw:aria-invalid:border-destructive tw:data-[state=checked]:border-primary tw:data-[state=checked]:bg-primary tw:data-[state=checked]:text-primary-foreground",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="tw:grid tw:place-content-center tw:text-current tw:transition-none"
      >
        <CheckIcon className="tw:size-3.5" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
