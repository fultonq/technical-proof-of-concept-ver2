import React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const statusBadgeVariants = cva(
  "inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-semibold uppercase tracking-wider",
  {
    variants: {
      status: {
        PASS: "bg-pass/15 text-pass border border-pass/30",
        FAIL: "bg-fail/15 text-fail border border-fail/30",
        REVIEW: "bg-review/15 text-review border border-review/30",
        NEEDS_REVIEW: "bg-review/15 text-review border border-review/30",
        NOT_APPLICABLE: "bg-muted text-muted-foreground border border-muted-foreground/30",
        ERROR: "bg-fail/15 text-fail border border-fail/30",
        WARNING: "bg-review/15 text-review border border-review/30",
        INFO: "bg-blue-500/15 text-blue-700 border border-blue-500/30",
        UNKNOWN: "bg-muted text-muted-foreground border border-muted-foreground/30",
      },
    },
    defaultVariants: {
      status: "UNKNOWN",
    },
  }
);

export interface StatusBadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof statusBadgeVariants> {
  status: any;
}

export function StatusBadge({ className, status, ...props }: StatusBadgeProps) {
  let normalizedStatus = String(status).toUpperCase();
  // Handle mapping from api types to badge variants if needed
  if (!statusBadgeVariants({ status: normalizedStatus as any }).includes(normalizedStatus)) {
      if (normalizedStatus === 'NEEDS_REVIEW') normalizedStatus = 'REVIEW';
  }

  return (
    <div className={cn(statusBadgeVariants({ status: normalizedStatus as any }), className)} {...props}>
      {status ? String(status).replace(/_/g, ' ') : "UNKNOWN"}
    </div>
  );
}
