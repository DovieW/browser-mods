import type { ComponentProps } from "react";

// Adapted from the MIT-licensed shadcn/ui Input registry.
export function Input({ className, type, ...props }: ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={className ? `workspace-input ${className}` : "workspace-input"}
      {...props}
    />
  );
}
