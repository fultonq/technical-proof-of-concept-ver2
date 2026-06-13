import React from "react";
import { Link, useLocation } from "wouter";
import {
  Home, BarChart2, FolderOpen, HelpCircle, Settings, Shield, ChevronRight, TrendingUp,
} from "lucide-react";

interface NavItem {
  href: string;
  icon: React.ReactNode;
  label: string;
  sublabel: string;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/",            icon: <Home className="w-4.5 h-4.5" />,       label: "Home",        sublabel: "Add & check labels"  },
  { href: "/all-results", icon: <BarChart2 className="w-4.5 h-4.5" />,  label: "All Results", sublabel: "View everything"      },
  { href: "/analytics",   icon: <TrendingUp className="w-4.5 h-4.5" />, label: "Analytics",   sublabel: "Trends & failure rates" },
  { href: "/manage",      icon: <FolderOpen className="w-4.5 h-4.5" />, label: "My Batches",  sublabel: "Saved batches"       },
  { href: "/help",        icon: <HelpCircle className="w-4.5 h-4.5" />, label: "Help",        sublabel: "How to use this"     },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  const isActive = (href: string) => {
    if (href === "/") return location === "/";
    return location.startsWith(href);
  };

  return (
    <div className="min-h-screen flex">
      {/* ── Left sidebar ──────────────────────────────────────────────── */}
      <aside
        className="w-60 shrink-0 flex flex-col fixed inset-y-0 left-0 z-30"
        style={{ background: "hsl(var(--sidebar))", borderRight: "1px solid hsl(var(--sidebar-border))" }}
      >
        {/* Logo + title */}
        <div className="px-4 pt-5 pb-4 flex items-start gap-3 border-b" style={{ borderColor: "hsl(var(--sidebar-border))" }}>
          <div
            className="shrink-0 w-10 h-10 rounded flex items-center justify-center mt-0.5"
            style={{ background: "hsl(var(--gold))" }}
          >
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-widest leading-tight" style={{ color: "hsl(var(--gold))" }}>
              TTB
            </p>
            <p className="text-[11px] font-semibold leading-snug mt-0.5" style={{ color: "hsl(var(--sidebar-foreground))" }}>
              Label Review Assistant
            </p>
            <p
              className="text-[10px] mt-0.5 font-medium px-1.5 py-0.5 rounded"
              style={{ background: "hsl(var(--sidebar-border))", color: "hsl(210 20% 65%)" }}
            >
              Proof of Concept
            </p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href);
            return (
              <Link key={item.href} href={item.href}>
                <div
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer transition-colors group ${
                    active ? "text-white" : ""
                  }`}
                  style={
                    active
                      ? { background: "hsl(var(--sidebar-primary))" }
                      : { color: "hsl(var(--sidebar-foreground))" }
                  }
                  onMouseEnter={e => {
                    if (!active) (e.currentTarget as HTMLElement).style.background = "hsl(var(--sidebar-accent))";
                  }}
                  onMouseLeave={e => {
                    if (!active) (e.currentTarget as HTMLElement).style.background = "";
                  }}
                >
                  <span className="shrink-0" style={active ? { color: "white" } : { color: "hsl(210 20% 60%)" }}>
                    {item.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-semibold leading-tight ${active ? "text-white" : ""}`}>
                      {item.label}
                    </p>
                    <p
                      className="text-[11px] truncate leading-tight mt-0.5"
                      style={{ color: active ? "rgba(255,255,255,0.7)" : "hsl(210 20% 55%)" }}
                    >
                      {item.sublabel}
                    </p>
                  </div>
                  {active && <ChevronRight className="w-3.5 h-3.5 shrink-0 text-white/60" />}
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Helper callout */}
        <div
          className="mx-3 mb-3 rounded-lg p-3"
          style={{ background: "hsl(var(--sidebar-border))" }}
        >
          <p className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: "hsl(var(--gold))" }}>
            About this tool
          </p>
          <p className="text-[11px] leading-snug" style={{ color: "hsl(210 20% 60%)" }}>
            This tool is here to help you check alcohol beverage labels against TTB mandatory requirements.
            It is a PoC — always confirm with official TTB guidance.
          </p>
        </div>

        {/* Settings footer */}
        <div className="border-t px-3 py-3" style={{ borderColor: "hsl(var(--sidebar-border))" }}>
          <Link href="/settings">
            <div
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-colors"
              style={{ color: "hsl(210 20% 55%)" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "hsl(var(--sidebar-accent))"; (e.currentTarget as HTMLElement).style.color = "white"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ""; (e.currentTarget as HTMLElement).style.color = ""; }}
            >
              <Settings className="w-4 h-4 shrink-0" />
              <span className="text-sm font-medium">Settings</span>
            </div>
          </Link>
        </div>
      </aside>

      {/* ── Main content ──────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-h-screen" style={{ marginLeft: "240px" }}>
        {children}
      </div>
    </div>
  );
}
