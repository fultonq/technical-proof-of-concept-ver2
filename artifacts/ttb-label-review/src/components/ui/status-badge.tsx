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
        NOT_ALCOHOL: "bg-muted text-muted-foreground border border-muted-foreground/30",
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

const STATUS_LABELS: Record<string, string> = {
  PASS: "Pass",
  FAIL: "Fail",
  REVIEW: "Needs Review",
  NEEDS_REVIEW: "Needs Review",
  NOT_APPLICABLE: "Not applicable",
  NOT_ALCOHOL: "Not applicable",
  ERROR: "Error",
  WARNING: "Warning",
  INFO: "Info",
  UNKNOWN: "Unknown",
};

export interface StatusBadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof statusBadgeVariants> {
  status: any;
}

export function StatusBadge({ className, status, ...props }: StatusBadgeProps) {
  const raw = String(status ?? "").toUpperCase();

  let normalized = raw;
  if (raw === "NEEDS_REVIEW") normalized = "NEEDS_REVIEW";

  const label = STATUS_LABELS[normalized] ?? raw.replace(/_/g, " ");

  return (
    <div className={cn(statusBadgeVariants({ status: normalized as any }), className)} {...props}>
      {label}
    </div>
  );
}
