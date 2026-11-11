import * as React from "react"
import { cn } from "@/lib/utils"
import { Label as LabelPrimitive } from "radix-ui"

function Label({
  className,
  ...props
}) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        "tw:flex tw:items-center tw:gap-2 tw:leading-normal tw:select-none tw:group-data-[disabled=true]:pointer-events-none tw:group-data-[disabled=true]:opacity-65 tw:peer-disabled:cursor-not-allowed tw:peer-disabled:opacity-65",
        className
      )}
      {...props}
    />
  )
}

export { Label }
