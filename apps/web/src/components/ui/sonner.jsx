import * as React from "react";
import { Toaster as Sonner, toast as sonnerToast } from "sonner";
import { Check, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";

// Barracks toaster on top of sonner. Visual metrics match the toasts users saw
// under react-toastify (320px wide, 68px tall, 13px gap, 16px edge offset,
// 38px icon, 3px progress bar); colors come only from --barracks-* tokens.

// Glyph-only marks drawn inside the filled status circle (lucide's info/alert
// icons already include a circle).
function InfoMark(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" {...props}>
      <path d="M12 11v7" />
      <circle cx="12" cy="6.5" r="0.6" fill="currentColor" />
    </svg>
  );
}

function AlertMark(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" {...props}>
      <path d="M12 5v8" />
      <circle cx="12" cy="18" r="0.6" fill="currentColor" />
    </svg>
  );
}

const TYPE_STYLES = {
  info: { Icon: InfoMark, icon: "tw:bg-primary", bar: "tw:bg-accent-secondary" },
  success: { Icon: Check, icon: "tw:bg-success", bar: "tw:bg-success" },
  warning: { Icon: TriangleAlert, icon: "tw:bg-warning", bar: "tw:bg-warning" },
  error: { Icon: AlertMark, icon: "tw:bg-danger", bar: "tw:bg-danger" },
};

export function BarracksToast({ id, type = "info", message, duration, showProgress = true, version = 0 }) {
  const style = TYPE_STYLES[type] || TYPE_STYLES.info;
  const { Icon } = style;
  return (
    <div
      data-slot="toast"
      data-type={type}
      role={type === "error" || type === "warning" ? "alert" : "status"}
      className="barracks-toast tw:relative tw:flex tw:min-h-[68px] tw:w-[var(--width)] tw:max-[600px]:w-full tw:items-center tw:overflow-hidden tw:rounded-[10px] tw:border tw:border-border-overlay tw:bg-popover tw:p-3.5 tw:pr-9 tw:text-popover-foreground tw:shadow-barracks tw:backdrop-blur-[14px]"
    >
      <span
        aria-hidden="true"
        className={cn(
          "tw:me-3.5 tw:flex tw:size-[38px] tw:shrink-0 tw:items-center tw:justify-center tw:rounded-full tw:text-inverse",
          style.icon
        )}
      >
        <Icon className="tw:size-[22px]" strokeWidth={2.5} />
      </span>
      <div className="barracks-toast-body tw:min-w-0 tw:flex-1 tw:text-sm tw:leading-[1.35] tw:font-bold">{message}</div>
      <button
        type="button"
        aria-label="Close notification"
        onClick={() => sonnerToast.dismiss(id)}
        className="tw:absolute tw:top-3 tw:right-2 tw:flex tw:size-6 tw:items-center tw:justify-center tw:rounded-sm tw:border-0 tw:bg-transparent tw:p-0 tw:text-popover-foreground tw:opacity-70 tw:hover:opacity-100 tw:focus-visible:opacity-100 tw:focus-visible:ring-2 tw:focus-visible:ring-ring"
      >
        <X className="tw:size-4" strokeWidth={3} />
      </button>
      {showProgress && Number.isFinite(duration) ? (
        <span aria-hidden="true" className="tw:absolute tw:inset-x-0 tw:bottom-0 tw:h-[3px]">
          <span className={cn("tw:absolute tw:inset-0 tw:opacity-20", style.bar)} />
          {/* key restarts the countdown animation when the toast is updated */}
          <span
            key={version}
            className={cn("barracks-toast-progress tw:absolute tw:inset-0 tw:origin-left", style.bar)}
            style={{ animationDuration: `${duration}ms` }}
          />
        </span>
      ) : null}
    </div>
  );
}

export function Toaster({ position = "bottom-right", className, ...props }) {
  return (
    <Sonner
      position={position}
      visibleToasts={5}
      expand
      gap={13}
      // Matches react-toastify placement: 16px from top/sides, 29px (16 + 13 toast margin) from the bottom.
      offset={{ top: 16, right: 16, bottom: 29, left: 16 }}
      mobileOffset={0}
      className={cn("barracks-toaster", className)}
      style={{ "--width": "min(320px, calc(100vw - 32px))" }}
      toastOptions={{ unstyled: true }}
      {...props}
    />
  );
}
