"use client";

import { createContext, useContext, useState, ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
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
  { id: "dashboard",   label: "Dashboard",   icon: <DashboardIcon />,  href: "/dashboard",   section: "main" },
  { id: "transcript", label: "Transcript", icon: <TranscriptIcon />, href: "/transcript", section: "main" },
  { id: "audit-log",   label: "Audit Log",   icon: <AuditIcon />,      href: "/audit",   section: "main" },
  { id: "account",     label: "Account",     icon: <AccountIcon />,    href: "/account",     section: "bottom" },
];

export default function Sidebar() {
  const { isOpen, toggle } = useSidebar();
  const pathname = usePathname();
  const active = NAV_ITEMS.find((i) => pathname.startsWith(i.href))?.id ?? "dashboard";

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
        className="fixed left-0 top-0 bottom-0 z-60 overflow-hidden bg-black text-white border-r border-gray-800 flex flex-col"
      >
        <div className="flex flex-col h-full w-[220px] px-2 py-3">
          {/* Toggle button */}
          <button
            onClick={toggle}
            className="mb-2 w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-white hover:bg-white/10 transition-all duration-150"
            title="Close sidebar"
          >
            {/* Logo */}
            <div className="flex items-center gap-2 select-none">
              <Image
                src="/stratum-mark.svg"
                alt="Stratum mark"
                width={22}
                height={22}
                style={{ display: "block", borderRadius: 6 }}
              />
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: "#FFFFFF",
                  letterSpacing: "-0.02em",
                }}
              >
                Stratum
              </span>
            </div>


            <span className="text-white/70 hover:text-white">
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
          <div className="h-px bg-gray-800 mx-2 my-2" />

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
          className="fixed left-3 top-[16px] z-30 w-9 h-9 flex items-center justify-center rounded-lg bg-black border border-gray-800 shadow-md hover:shadow-lg hover:bg-gray-900 text-white/80 hover:text-white transition-all duration-150"
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
          ? "bg-white/10 text-white shadow-sm border border-gray-700"
          : "text-white/85 hover:bg-white/10",
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
            : "bg-gray-800 text-white/70 group-hover:bg-gray-700 group-hover:text-white",
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