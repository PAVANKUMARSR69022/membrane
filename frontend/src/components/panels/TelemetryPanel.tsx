import React, { useState } from 'react';
import {
  Compass,
  Activity,
  AlertTriangle,
  Package,
  Layers,
  TrendingUp,
  Map,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ScatterChart,
  Scatter,
  ReferenceLine,
} from 'recharts';
import { PanelContainer } from '../common/PanelContainer';
import { TechnicalMetric } from '../common/TechnicalMetric';
import { RobotState, TelemetryPoint } from '../../types/robot';

interface TelemetryPanelProps {
  robotState: RobotState;
  telemetryHistory: TelemetryPoint[];
}

export const TelemetryPanel: React.FC<TelemetryPanelProps> = ({
  robotState,
  telemetryHistory,
}) => {
  const [chartView, setChartView] = useState<'trajectory' | 'heading'>('trajectory');

  const getBearingName = (deg: number) => {
    const cardinals = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
    const idx = Math.round(deg / 45) % 8;
    return cardinals[idx];
  };

  return (
    <PanelContainer
      title="Robot Telemetry & State"
      subtitle="GET /state — Real-Time Authoritative Odometry"
      icon={<Activity size={16} />}
      actions={
        <div className="flex items-center gap-1 font-mono text-xs">
          <button
            onClick={() => setChartView('trajectory')}
            className={`px-2 py-0.5 rounded border transition-colors flex items-center gap-1 ${
              chartView === 'trajectory'
                ? 'bg-cyan-950/60 border-cyan-500/50 text-cyan-300'
                : 'bg-[#121826] border-[#1f2a40] text-slate-400 hover:text-slate-200'
            }`}
          >
            <Map size={12} />
            <span>XY Trajectory</span>
          </button>
          <button
            onClick={() => setChartView('heading')}
            className={`px-2 py-0.5 rounded border transition-colors flex items-center gap-1 ${
              chartView === 'heading'
                ? 'bg-cyan-950/60 border-cyan-500/50 text-cyan-300'
                : 'bg-[#121826] border-[#1f2a40] text-slate-400 hover:text-slate-200'
            }`}
          >
            <TrendingUp size={12} />
            <span>Heading Log</span>
          </button>
        </div>
      }
    >
      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 mb-3">
        <TechnicalMetric
          label="X Coordinate"
          value={robotState.x.toFixed(3)}
          unit="m"
          subtext="Range: [-4.0, +4.0]"
          status="healthy"
        />
        <TechnicalMetric
          label="Y Coordinate"
          value={robotState.y.toFixed(3)}
          unit="m"
          subtext="Range: [-4.0, +4.0]"
          status="healthy"
        />
        <TechnicalMetric
          label="Heading"
          value={robotState.heading.toFixed(1)}
          unit="°"
          subtext={`Bearing: ${getBearingName(robotState.heading)} (CW)`}
          status="healthy"
          icon={<Compass size={14} />}
        />
        <TechnicalMetric
          label="Robot State"
          value={robotState.state.toUpperCase()}
          subtext={robotState.result ? `Result: ${robotState.result}` : 'Active state'}
          status={
            robotState.state === 'Blocked' || robotState.state === 'Failed'
              ? 'alert'
              : robotState.state === 'Carry'
              ? 'warning'
              : 'healthy'
          }
          icon={<Layers size={14} />}
        />
        <TechnicalMetric
          label="Gripper Status"
          value={robotState.holding ? 'ENGAGED' : 'VACANT'}
          subtext={robotState.holding ? 'Target attached' : 'No load'}
          status={robotState.holding ? 'healthy' : 'neutral'}
          icon={<Package size={14} />}
        />
        <TechnicalMetric
          label="Collision Flag"
          value={robotState.collided ? 'DETECTED' : 'CLEAR'}
          subtext={robotState.collided ? 'Back-off applied' : 'Kinematic safe'}
          status={robotState.collided ? 'alert' : 'healthy'}
          icon={<AlertTriangle size={14} />}
        />
        <TechnicalMetric
          label="Retry Count"
          value={`${robotState.retry_count}/3`}
          subtext="Limit before Failed"
          status={
            robotState.retry_count >= 2
              ? 'alert'
              : robotState.retry_count > 0
              ? 'warning'
              : 'healthy'
          }
        />
      </div>

      {/* Recharts Visualizations */}
      <div className="h-44 w-full bg-[#090d14] rounded border border-[#1f2a40] p-2">
        <ResponsiveContainer width="100%" height="100%">
          {chartView === 'trajectory' ? (
            <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2a40" />
              <XAxis
                type="number"
                dataKey="x"
                name="X Position"
                domain={[-4, 4]}
                tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'monospace' }}
                unit="m"
              />
              <YAxis
                type="number"
                dataKey="y"
                name="Y Position"
                domain={[-4, 4]}
                tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'monospace' }}
                unit="m"
              />
              <Tooltip
                cursor={{ strokeDasharray: '3 3', stroke: '#06b6d4' }}
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload as TelemetryPoint;
                    return (
                      <div className="bg-[#0f1420] border border-[#1f2a40] p-2 rounded font-mono text-xs shadow-xl">
                        <div className="text-cyan-400 font-bold">{data.time}</div>
                        <div className="text-slate-300">
                          X: {data.x.toFixed(3)}m | Y: {data.y.toFixed(3)}m
                        </div>
                        <div className="text-slate-400">Heading: {data.heading.toFixed(1)}°</div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <ReferenceLine x={0} stroke="#2c3b59" />
              <ReferenceLine y={0} stroke="#2c3b59" />
              <Scatter
                name="Robot Trajectory"
                data={telemetryHistory}
                fill="#38bdf8"
                line={{ stroke: '#0284c7', strokeWidth: 2 }}
              />
              {/* Current robot position marker */}
              <Scatter
                name="Current Pose"
                data={[{ x: robotState.x, y: robotState.y }]}
                fill="#10b981"
                shape="circle"
              />
            </ScatterChart>
          ) : (
            <LineChart
              data={telemetryHistory}
              margin={{ top: 10, right: 20, bottom: 10, left: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2a40" />
              <XAxis
                dataKey="time"
                tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'monospace' }}
              />
              <YAxis
                domain={[0, 360]}
                tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'monospace' }}
                unit="°"
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload as TelemetryPoint;
                    return (
                      <div className="bg-[#0f1420] border border-[#1f2a40] p-2 rounded font-mono text-xs shadow-xl">
                        <div className="text-cyan-400 font-bold">{data.time}</div>
                        <div className="text-slate-200">
                          Heading: {data.heading.toFixed(1)}°
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Line
                type="monotone"
                dataKey="heading"
                stroke="#06b6d4"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: '#38bdf8' }}
              />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </PanelContainer>
  );
};

