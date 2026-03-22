"use client";

import { createContext, useContext, useState, ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface SidebarContextType {
  isOpen: boolean;
  toggle: () => void;
  close: () => void;
}

const SidebarContext = createContext<SidebarContextType>({
  isOpen: true,
  toggle: () => {},
  close: () => {},
});

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(true);
  const toggle = () => setIsOpen((v) => !v);
  const close = () => setIsOpen(false);
  return (
    <SidebarContext.Provider value={{ isOpen, toggle, close }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  return useContext(SidebarContext);
}

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  href: string;
  badge?: number;
  section?: "main" | "bottom";
}

const TranscriptIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="22" />
    <line x1="8" y1="22" x2="16" y2="22" />
  </svg>
);

const DashboardIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
);

const AuditIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 11l3 3L22 4" />
    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
  </svg>
);

const AccountIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
  </svg>
);

const ChevronLeftIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

const NAV_ITEMS: NavItem[] = [
  { id: "transcript", label: "Transcript", icon: <TranscriptIcon />, href: "/transcript", section: "main" },
  { id: "dashboard",   label: "Dashboard",   icon: <DashboardIcon />,  href: "/dashboard",   section: "main" },
  { id: "audit-log",   label: "Audit Log",   icon: <AuditIcon />,      href: "/audit-log",   section: "main" },
  { id: "account",     label: "Account",     icon: <AccountIcon />,    href: "/account",     section: "bottom" },
];

export default function Sidebar() {
  const { isOpen, toggle } = useSidebar();
  const pathname = usePathname();
  const active = NAV_ITEMS.find((i) => pathname.startsWith(i.href))?.id ?? "transcript";

  const mainItems   = NAV_ITEMS.filter((i) => i.section === "main");
  const bottomItems = NAV_ITEMS.filter((i) => i.section === "bottom");

  return (
    <>
      {/* Sidebar panel */}
      <aside
        style={{
          transform: isOpen ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 220ms cubic-bezier(0.22, 1, 0.36, 1), width 220ms cubic-bezier(0.22, 1, 0.36, 1)",
          width: isOpen ? "220px" : "0px",
        }}
        className="fixed left-0 top-0 bottom-0 z-60 overflow-hidden bg-[#f3f4f6] text-black border-r border-gray-300 flex flex-col"
      >
        <div className="flex flex-col h-full w-[220px] px-2 py-3">
          {/* Toggle button */}
          <button
            onClick={toggle}
            className="mb-2 w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-black hover:bg-white/70 transition-all duration-150"
            title="Close sidebar"
          >
            {/* Logo */}
            <div className="flex items-center gap-2 select-none">
              <svg
                width="22"
                height="22"
                viewBox="0 0 22 22"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <rect width="22" height="22" rx="6" fill="#111827" />
                {/* waveform bars */}
                {[3, 5, 7, 9, 11, 13, 15, 17, 19].map((x, i) => {
                  const heights = [4, 8, 12, 10, 14, 10, 12, 8, 4];
                  const h = heights[i];
                  return (
                    <rect
                      key={x}
                      x={x - 0.5}
                      y={11 - h / 2}
                      width={1.5}
                      height={h}
                      rx={0.75}
                      fill="white"
                      opacity={0.9}
                    />
                  );
                })}
              </svg>
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: "#111827",
                  letterSpacing: "-0.02em",
                }}
              >
                Stratum
              </span>
            </div>


            <span className="text-black/70 hover:text-black">
              <ChevronLeftIcon />
            </span>
          </button>

          {/* Main nav */}
          <nav className="flex flex-col gap-0.5 flex-1">
            {mainItems.map((item) => (
              <NavButton key={item.id} item={item} isActive={active === item.id} />
            ))}
          </nav>

          {/* Divider */}
          <div className="h-px bg-gray-300 mx-2 my-2" />

          {/* Bottom nav */}
          <div className="flex flex-col gap-0.5">
            {bottomItems.map((item) => (
              <NavButton key={item.id} item={item} isActive={active === item.id} />
            ))}
          </div>
        </div>
      </aside>

      {/* Floating toggle button when closed */}
      {!isOpen && (
        <button
          onClick={toggle}
          className="fixed left-3 top-[16px] z-30 w-9 h-9 flex items-center justify-center rounded-lg bg-[#f3f4f6] border border-gray-300 shadow-md hover:shadow-lg hover:bg-gray-100 text-black/80 hover:text-black transition-all duration-150"
          title="Open sidebar"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      )}
    </>
  );
}

// ── NavButton ──────────────────────────────────────────────────────────────
function NavButton({ item, isActive }: { item: NavItem; isActive: boolean }) {
  return (
    <Link
      href={item.href}
      className={[
        "group relative w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-all duration-150 text-left select-none whitespace-nowrap",
        isActive
          ? "bg-white text-black shadow-sm border border-gray-300"
          : "text-black hover:bg-white/70",
      ].join(" ")}
    >
      {/* Active bar */}
      {isActive && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r-full bg-accent" />
      )}

      {/* Icon box */}
      <span
        className={[
          "w-[28px] h-[28px] rounded-md flex items-center justify-center flex-shrink-0 transition-colors",
          isActive
            ? "bg-accent/10 text-accent"
            : "bg-gray-200 text-black/70 group-hover:bg-gray-300 group-hover:text-black",
        ].join(" ")}
      >
        {item.icon}
      </span>

      {/* Label */}
      <span className="flex-1">{item.label}</span>

      {/* Badge */}
      {item.badge !== undefined && (
        <span className="ml-auto text-[10.5px] font-semibold px-1.5 py-0.5 rounded-md bg-accent/10 text-accent font-mono border border-accent/15">
          {item.badge}
        </span>
      )}
    </Link>
  );
}