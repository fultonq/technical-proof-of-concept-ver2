import React from "react";
import { useLocation, Link } from "wouter";
import { PlayCircle } from "lucide-react";

interface Chip {
  number: number;
  text: string;
}

function getChips(location: string): Chip[] {
  if (location.startsWith("/results/") || location.startsWith("/all-results")) {
    return [
      { number: 1, text: "Review each label's result" },
      { number: 2, text: "Approve, override, or issue a correction" },
      { number: 3, text: "Download the summary report" },
    ];
  }
  if (location.startsWith("/manage")) {
    return [
      { number: 1, text: "Select a saved batch" },
      { number: 2, text: "Open the review interface" },
      { number: 3, text: "Export or print the report" },
    ];
  }
  return [
    { number: 1, text: "Choose an upload method" },
    { number: 2, text: "Upload or paste your label" },
    { number: 3, text: "Click Check to run compliance" },
  ];
}

export function HelpBar() {
  const [location] = useLocation();
  const chips = getChips(location);

  return (
    <div
      className="fixed bottom-0 right-0 z-20 flex items-center gap-4 px-5 py-2.5 border-t shadow-md"
      style={{
        left: "240px",
        background: "hsl(var(--card))",
        borderColor: "hsl(var(--border))",
      }}
    >
      <span className="text-sm font-bold text-foreground shrink-0 hidden md:block">
        What do I do next?
      </span>
      <div className="flex items-center gap-2 flex-1 min-w-0 overflow-x-auto">
        {chips.map((chip) => (
          <div
            key={chip.number}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium whitespace-nowrap shrink-0"
            style={{
              background: "hsl(var(--secondary))",
              borderColor: "hsl(var(--border))",
              color: "hsl(var(--foreground))",
            }}
          >
            <span
              className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-black text-white shrink-0"
              style={{ background: "hsl(var(--primary))" }}
            >
              {chip.number}
            </span>
            {chip.text}
          </div>
        ))}
      </div>
      <Link href="/help">
        <button
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-white shrink-0 transition-opacity hover:opacity-90"
          style={{ background: "hsl(var(--primary))" }}
        >
          <PlayCircle className="w-3.5 h-3.5" />
          Show Me How
        </button>
      </Link>
    </div>
  );
}
