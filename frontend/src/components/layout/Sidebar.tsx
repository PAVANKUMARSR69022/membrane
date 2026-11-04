import React from 'react';
import {
  LayoutDashboard,
  Box,
  Compass,
  Camera,
  Scan,
  Radar,
  GitCommitHorizontal,
  Terminal,
  Film,
  Activity,
  Settings,
  Cpu,
} from 'lucide-react';

export type NavTabId =
  | 'dashboard'
  | 'simulation'
  | 'control'
  | 'camera'
  | 'detection'
  | 'depth'
  | 'tasks'
  | 'logs'
  | 'recordings'
  | 'apistatus'
  | 'settings';

interface SidebarProps {
  currentTab: NavTabId;
  onSelectTab: (tab: NavTabId) => void;
  backendConnected: boolean;
}

interface NavItem {
  id: NavTabId;
  label: string;
  icon: React.ReactNode;
  badge?: string;
}

interface NavGroup {
  group: string;
  items: NavItem[];
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  backendConnected,
}) => {
  const navigationGroups: NavGroup[] = [
    {
      group: 'OVERVIEW',
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={16} /> },
        { id: 'simulation', label: 'Simulation', icon: <Box size={16} /> },
        { id: 'control', label: 'Robot Control', icon: <Compass size={16} /> },
      ],
    },
    {
      group: 'PERCEPTION',
      items: [
        { id: 'camera', label: 'Camera Feed', icon: <Camera size={16} /> },
        { id: 'detection', label: 'Object Detection', icon: <Scan size={16} /> },
        { id: 'depth', label: 'Depth View', icon: <Radar size={16} /> },
      ],
    },
    {
      group: 'OPERATIONS',
      items: [
        { id: 'tasks', label: 'Task Timeline', icon: <GitCommitHorizontal size={16} /> },
        { id: 'logs', label: 'Event Logs', icon: <Terminal size={16} /> },
        { id: 'recordings', label: 'Recordings', icon: <Film size={16} /> },
      ],
    },
    {
      group: 'SYSTEM',
      items: [
        { id: 'apistatus', label: 'API Status', icon: <Activity size={16} /> },
        { id: 'settings', label: 'Settings', icon: <Settings size={16} /> },
      ],
    },
  ];

  return (
    <aside className="w-60 bg-[#0c1018] border-r border-[#1a2336] flex flex-col h-screen select-none shrink-0">
      {/* Brand & Logo Header */}
      <div className="h-14 border-b border-[#1a2336] px-4 flex items-center gap-3 bg-[#0f1422]/60">
        <div className="w-8 h-8 rounded bg-cyan-950/80 border border-cyan-500/50 flex items-center justify-center text-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.25)]">
          <Cpu size={18} />
        </div>
        <div>
          <div className="text-sm font-bold tracking-wider text-slate-100 font-mono">
            MEMBRANE
          </div>
          <div className="text-[10px] text-cyan-400 font-mono font-medium tracking-widest -mt-0.5">
            ROBOT OPS OS
          </div>
        </div>
      </div>

      {/* Nav List */}
      <div className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {navigationGroups.map((group) => (
          <div key={group.group}>
            <div className="px-2.5 mb-1.5 text-[10px] font-mono font-semibold tracking-wider text-slate-500 uppercase">
              {group.group}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = currentTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => onSelectTab(item.id)}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded text-xs font-mono transition-all duration-150 ${
                      isActive
                        ? 'bg-cyan-950/50 text-cyan-300 font-medium border border-cyan-500/30 shadow-[inset_0_0_8px_rgba(6,182,212,0.1)]'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-[#141b2a] border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className={isActive ? 'text-cyan-400' : 'text-slate-500'}>
                        {item.icon}
                      </span>
                      <span>{item.label}</span>
                    </div>
                    {item.badge && (
                      <span className="text-[9px] px-1 py-0.2 rounded bg-slate-800 text-slate-400">
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Sidebar Footer System Status */}
      <div className="p-3 border-t border-[#1a2336] bg-[#090d14]/70 font-mono text-[11px]">
        <div className="flex items-center justify-between text-slate-400 mb-1">
          <span className="text-slate-500">ENGINE</span>
          <span className="text-slate-300">PyBullet 3.2.8</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-500">ENDPOINT</span>
          <span className="text-cyan-400">127.0.0.1:8080</span>
        </div>
        <div className="mt-2 pt-2 border-t border-[#1a2336] flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                backendConnected
                  ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                  : 'bg-rose-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]'
              }`}
            />
            <span
              className={`text-[10px] uppercase ${
                backendConnected ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {backendConnected ? 'Link Active' : 'Disconnected'}
            </span>
          </div>
          <span className="text-[9px] text-slate-600">v0.1.0</span>
        </div>
      </div>
    </aside>
  );
};

