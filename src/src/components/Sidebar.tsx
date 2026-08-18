import { useEffect, useState } from "react";
import {
  HomeIcon,
  KeyIcon,
  CarIcon,
  CameraIcon,
  UsersIcon,
  ReceiptIcon,
  FileTextIcon,
  SettingsIcon,
  PanelLeftIcon,
  MapPinIcon,
  MapIcon,
  ToolIcon,
  CloudUpIcon,
  BarChartIcon,
  ListIcon,
} from "./icons";
import type { Tab } from "../App";

const NAV_ITEMS: { id: Tab; label: string; icon: typeof HomeIcon }[] = [
  { id: "home", label: "Home", icon: HomeIcon },
  { id: "bookings", label: "Rentals", icon: KeyIcon },
  { id: "vehicles", label: "Fleet", icon: CarIcon },
  { id: "registry", label: "Registry", icon: FileTextIcon },
  { id: "customers", label: "Customers", icon: UsersIcon },
  { id: "rateMatrix", label: "Rate Matrix", icon: MapPinIcon },
  { id: "settlements", label: "Settlements", icon: ReceiptIcon },
  { id: "logs", label: "Logs", icon: ListIcon },
  { id: "tools", label: "Tools", icon: ToolIcon },
  // Preparatory view for the GPS/live-tracking feature (vehicle_locations on
  // Supabase, gps-ingest Edge Function — see BRAINS/PLANS.md ROP006). Fully
  // clickable and shows a real, working map — just no vehicle pins yet, since
  // the desktop app has no Supabase read access wired up (blocked on ROT007).
  { id: "map", label: "Map", icon: MapIcon },
  { id: "analytics", label: "Analytics", icon: BarChartIcon },
];

// Shown in the reference design but not built yet — kept visible (dimmed,
// disabled) so the nav matches the intended shape rather than looking sparse,
// without pretending the screen exists.
const COMING_SOON = [{ label: "Inspections", icon: CameraIcon }];

interface SidebarProps {
  active: Tab;
  onSelect: (tab: Tab) => void;
  pendingSync: number;
}

const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 200;
const MAX_WIDTH = 420;
const COLLAPSED_WIDTH = 68;
const WIDTH_KEY = "racos.sidebar.width";
const COLLAPSED_KEY = "racos.sidebar.collapsed";

function readStoredWidth(): number {
  const stored = Number(localStorage.getItem(WIDTH_KEY));
  return Number.isFinite(stored) && stored >= MIN_WIDTH && stored <= MAX_WIDTH ? stored : DEFAULT_WIDTH;
}

function readStoredCollapsed(): boolean {
  return localStorage.getItem(COLLAPSED_KEY) === "true";
}

export default function Sidebar({ active, onSelect, pendingSync }: SidebarProps) {
  const [width, setWidth] = useState<number>(readStoredWidth);
  const [collapsed, setCollapsed] = useState<boolean>(readStoredCollapsed);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    localStorage.setItem(WIDTH_KEY, String(width));
  }, [width]);

  useEffect(() => {
    localStorage.setItem(COLLAPSED_KEY, String(collapsed));
  }, [collapsed]);

  // Drag-to-resize the divider between the sidebar and the main screen —
  // listens on window rather than the handle itself so the drag keeps
  // tracking even if the cursor outruns the thin handle strip.
  useEffect(() => {
    if (!dragging) return;
    const prevUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";

    function onMove(e: MouseEvent) {
      setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, e.clientX)));
    }
    function onUp() {
      setDragging(false);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      document.body.style.userSelect = prevUserSelect;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging]);

  const effectiveWidth = collapsed ? COLLAPSED_WIDTH : width;

  return (
    <aside
      className="relative flex h-screen shrink-0 flex-col gap-1 py-5 print:hidden"
      style={{
        width: effectiveWidth,
        paddingLeft: collapsed ? 8 : 12,
        paddingRight: collapsed ? 8 : 12,
        background: "var(--surface-1)",
        borderRight: "0.5px solid var(--border)",
        transition: dragging ? "none" : "width 0.15s ease",
      }}
    >
      <div className="mb-4 flex items-center justify-between px-1">
        {!collapsed && (
          <span className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
            RACOS
          </span>
        )}
        <button
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="flex items-center justify-center rounded-md p-1.5"
          style={{ color: "var(--text-muted)" }}
        >
          <PanelLeftIcon size={19} />
        </button>
      </div>

      {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
        const isActive = active === id;
        return (
          <button
            key={id}
            onClick={() => onSelect(id)}
            title={collapsed ? label : undefined}
            className="flex items-center gap-3 rounded-md py-2.5 text-left text-base"
            style={{
              justifyContent: collapsed ? "center" : "flex-start",
              paddingLeft: collapsed ? 0 : 12,
              paddingRight: collapsed ? 0 : 12,
              ...(isActive
                ? { background: "var(--bg-accent)", color: "var(--text-accent)", fontWeight: 500 }
                : { color: "var(--text-secondary)" }),
            }}
          >
            <Icon size={20} strokeWidth={2} />
            {!collapsed && label}
          </button>
        );
      })}

      {COMING_SOON.map(({ label, icon: Icon }) => (
        <button
          key={label}
          disabled
          title="Coming soon"
          className="flex cursor-not-allowed items-center gap-3 rounded-md py-2.5 text-left text-base"
          style={{
            justifyContent: collapsed ? "center" : "flex-start",
            paddingLeft: collapsed ? 0 : 12,
            paddingRight: collapsed ? 0 : 12,
            color: "var(--text-muted)",
          }}
        >
          <Icon size={20} strokeWidth={2} />
          {!collapsed && label}
        </button>
      ))}

      <button
        onClick={() => onSelect("settings")}
        title={collapsed ? "Settings" : undefined}
        className="mt-auto flex items-center gap-3 rounded-md py-2.5 text-left text-base"
        style={{
          justifyContent: collapsed ? "center" : "flex-start",
          paddingLeft: collapsed ? 0 : 12,
          paddingRight: collapsed ? 0 : 12,
          ...(active === "settings"
            ? { background: "var(--bg-accent)", color: "var(--text-accent)", fontWeight: 500 }
            : { color: "var(--text-secondary)" }),
        }}
      >
        <SettingsIcon size={20} strokeWidth={2} />
        {!collapsed && "Settings"}
      </button>

      {pendingSync > 0 && (
        <div
          title={collapsed ? `${pendingSync} pending sync` : undefined}
          className="flex items-center gap-2 rounded-md py-2 text-sm"
          style={{
            justifyContent: collapsed ? "center" : "flex-start",
            paddingLeft: collapsed ? 0 : 12,
            paddingRight: collapsed ? 0 : 12,
            background: "var(--bg-warning)",
            color: "var(--text-warning)",
          }}
        >
          <CloudUpIcon size={16} />
          {!collapsed && `${pendingSync} pending sync`}
        </div>
      )}

      {!collapsed && (
        <div
          onMouseDown={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          title="Drag to resize"
          className="absolute right-0 top-0 h-full w-1 cursor-col-resize bg-[var(--border)] hover:bg-[var(--text-accent)]"
        />
      )}
    </aside>
  );
}
