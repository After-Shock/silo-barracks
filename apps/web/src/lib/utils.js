import { clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Tailwind utilities use the `tw:` prefix during the Bootstrap migration
// (see src/styles/shadcn-bridge.css); tailwind-merge must know it to resolve
// conflicting overrides such as `tw:flex` vs `tw:grid`.
const twMerge = extendTailwindMerge({ prefix: "tw" });

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
