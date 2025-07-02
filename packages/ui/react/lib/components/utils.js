import { mergeClassNames } from "@friggframework/ui-core";
import { twMerge } from "tailwind-merge";
import { clsx } from "clsx";

// Enhanced className utility that combines ui-core with Tailwind
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// Re-export ui-core utilities
export { mergeClassNames } from "@friggframework/ui-core";
