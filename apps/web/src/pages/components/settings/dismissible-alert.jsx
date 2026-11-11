import CloseLineIcon from "remixicon-react/CloseLineIcon";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Settings-page status message with a close button (the shadcn Alert has no dismiss slot).
// `type` keeps the old react-bootstrap names: "danger" | "success" | anything else.
const VARIANTS = { danger: "destructive", success: "success" };

export default function DismissibleAlert({ type, title, onClose, className, children }) {
  return (
    <Alert variant={VARIANTS[type] || "default"} className={cn("tw:mb-4 tw:pr-12", className)}>
      {title ? <AlertTitle className="tw:text-xl tw:font-medium">{title}</AlertTitle> : null}
      <AlertDescription className="tw:text-raised-foreground">{children}</AlertDescription>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Close alert"
        className="tw:absolute tw:top-2 tw:right-2 tw:text-raised-foreground"
        onClick={onClose}
      >
        <CloseLineIcon size={16} />
      </Button>
    </Alert>
  );
}
