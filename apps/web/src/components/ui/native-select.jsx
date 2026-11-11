import * as React from "react"
import { cn } from "@/lib/utils"
import { ChevronDownIcon } from "lucide-react"

function NativeSelect({
  className,
  size = "default",
  ...props
}) {
  return (
    <div
      className="tw:group/native-select tw:relative tw:w-full tw:has-[select:disabled]:opacity-65"
      data-slot="native-select-wrapper"
    >
      <select
        data-slot="native-select"
        data-size={size}
        className={cn(
          "tw:w-full tw:min-w-0 tw:appearance-none tw:rounded-[8px] tw:border tw:border-border-strong tw:bg-surface-interactive tw:px-3 tw:py-1.5 tw:pr-9 tw:text-base tw:leading-normal tw:text-secondary-foreground tw:transition-[color,box-shadow] tw:outline-none tw:selection:bg-primary tw:selection:text-primary-foreground tw:placeholder:text-secondary-foreground tw:disabled:pointer-events-none tw:disabled:cursor-not-allowed tw:data-[size=sm]:py-1 tw:data-[size=sm]:text-sm",
          "",
          "tw:aria-invalid:border-destructive",
          className
        )}
        {...props}
      />
      <ChevronDownIcon
        className="tw:pointer-events-none tw:absolute tw:top-1/2 tw:right-3.5 tw:size-4 tw:-translate-y-1/2 tw:text-muted-foreground tw:opacity-50 tw:select-none"
        aria-hidden="true"
        data-slot="native-select-icon"
      />
    </div>
  )
}

function NativeSelectOption({
  className,
  ...props
}) {
  return (
    <option
      data-slot="native-select-option"
      className={cn("tw:bg-[Canvas] tw:text-[CanvasText]", className)}
      {...props}
    />
  )
}

function NativeSelectOptGroup({
  className,
  ...props
}) {
  return (
    <optgroup
      data-slot="native-select-optgroup"
      className={cn("tw:bg-[Canvas] tw:text-[CanvasText]", className)}
      {...props}
    />
  )
}

export { NativeSelect, NativeSelectOptGroup, NativeSelectOption }
