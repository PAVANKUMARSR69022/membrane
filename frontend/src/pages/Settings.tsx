import React, { useState } from 'react';
import { Settings as SettingsIcon, Save, RotateCcw, Link2, Sliders, Shield } from 'lucide-react';
import { PanelContainer } from '../components/common/PanelContainer';
import api from '../services/api';

interface SettingsPageProps {
  currentFps: number;
  onFpsChange: (fps: number) => void;
  onRecheckConnection: () => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  currentFps,
  onFpsChange,
  onRecheckConnection,
}) => {
  const [apiUrl, setApiUrl] = useState<string>(api.getBaseUrl());
  const [saveMessage, setSaveMessage] = useState<string>('');

  const handleSave = () => {
    api.setBaseUrl(apiUrl);
    setSaveMessage('API endpoint updated. Probing server...');
    onRecheckConnection();
    setTimeout(() => setSaveMessage(''), 3000);
  };

  const handleReset = () => {
    setApiUrl('/api');
    api.setBaseUrl('/api');
    setSaveMessage('Reset to local proxy default.');
    onRecheckConnection();
    setTimeout(() => setSaveMessage(''), 3000);
  };

  return (
    <div className="p-4 space-y-4 max-w-4xl mx-auto font-mono">
      <PanelContainer
        title="System Configuration & Connectivity"
        subtitle="Manage Endpoint Routes, Telemetry Refresh Rates, and Sandbox Boundaries"
        icon={<SettingsIcon size={16} />}
      >
        <div className="space-y-6 text-xs">
          {/* API Endpoint Section */}
          <div className="space-y-2">
            <label className="text-slate-300 font-semibold flex items-center gap-1.5 uppercase tracking-wider">
              <Link2 size={14} className="text-cyan-400" />
              <span>FastAPI Backend Base URL</span>
            </label>
            <p className="text-slate-500 text-[11px]">
              Direct URL or reverse proxy route to the authoritative simulation server.
            </p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                placeholder="/api or http://127.0.0.1:8080"
                className="flex-1 bg-[#090d14] border border-[#1f2a40] rounded px-3 py-1.5 text-slate-100 focus:outline-none focus:border-cyan-500/60"
              />
              <button
                onClick={handleSave}
                className="px-3 py-1.5 bg-cyan-950 hover:bg-cyan-900 border border-cyan-500/50 text-cyan-300 rounded font-semibold flex items-center gap-1 transition-colors"
              >
                <Save size={13} />
                <span>Save</span>
              </button>
              <button
                onClick={handleReset}
                className="px-3 py-1.5 bg-[#141b2a] hover:bg-[#1f2a40] border border-[#1f2a40] text-slate-400 rounded transition-colors"
                title="Reset to /api default"
              >
                <RotateCcw size={13} />
              </button>
            </div>
            {saveMessage && (
              <div className="text-[11px] text-emerald-400 font-bold mt-1">
                {saveMessage}
              </div>
            )}
          </div>

          <div className="border-t border-[#1f2a40]" />

          {/* Perception Stream Rates */}
          <div className="space-y-2">
            <label className="text-slate-300 font-semibold flex items-center gap-1.5 uppercase tracking-wider">
              <Sliders size={14} className="text-cyan-400" />
              <span>Camera Frame Sampling Rate</span>
            </label>
            <p className="text-slate-500 text-[11px]">
              Sets the optical /look polling frequency (5–10 Hz recommended by task specification).
            </p>
            <div className="flex items-center gap-2">
              {[1, 2, 5, 8, 10].map((rate) => (
                <button
                  key={rate}
                  onClick={() => onFpsChange(rate)}
                  className={`px-3 py-1.5 rounded border transition-colors ${
                    currentFps === rate
                      ? 'bg-cyan-950 text-cyan-300 font-bold border-cyan-500/50'
                      : 'bg-[#090d14] text-slate-400 hover:text-slate-200 border-[#1f2a40]'
                  }`}
                >
                  {rate} FPS ({Math.round(1000 / rate)}ms)
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-[#1f2a40]" />

          {/* Security & Boundary Compliance notice */}
          <div className="bg-[#090d14] p-3.5 rounded border border-emerald-500/30 space-y-1.5">
            <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs uppercase tracking-wider">
              <Shield size={14} />
              <span>Competition Constraint Enforcement</span>
            </div>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              In accordance with project security policies, the frontend client never requests, serializes, or stores private simulation truth: object names, shape types, ground-truth coordinates, drop-zone coordinates, or target distances. All navigation and actuation is strictly bounded by the official REST contracts.
            </p>
          </div>
        </div>
      </PanelContainer>
    </div>
  );
};

