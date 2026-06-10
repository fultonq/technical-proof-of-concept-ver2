import { cn } from "@/lib/utils";

interface ConfidenceBarProps {
  score: number; // 0.0 to 1.0
  className?: string;
  showLabel?: boolean;
}

export function ConfidenceBar({ score, className, showLabel = true }: ConfidenceBarProps) {
  const percentage = Math.round(score * 100);
  
  let colorClass = "bg-pass";
  if (score < 0.7) colorClass = "bg-fail";
  else if (score < 0.9) colorClass = "bg-review";

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden min-w-[60px]">
        <div 
          className={cn("h-full rounded-full", colorClass)} 
          style={{ width: `${percentage}%` }}
        />
      </div>
      {showLabel && (
        <span className="text-xs font-mono text-muted-foreground tabular-nums w-8 text-right">
          {percentage}%
        </span>
      )}
    </div>
  );
}