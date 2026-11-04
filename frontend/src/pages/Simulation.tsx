import React from 'react';
import { SimulationPanel } from '../components/panels/SimulationPanel';
import { TelemetryPanel } from '../components/panels/TelemetryPanel';
import { RobotState, TelemetryPoint } from '../types/robot';

interface SimulationPageProps {
  robotState: RobotState;
  telemetryHistory: TelemetryPoint[];
}

export const SimulationPage: React.FC<SimulationPageProps> = ({
  robotState,
  telemetryHistory,
}) => {
  return (
    <div className="p-4 space-y-4 max-w-[1920px] mx-auto">
      <div className="space-y-4">
        <SimulationPanel robotState={robotState} />
        <TelemetryPanel
          robotState={robotState}
          telemetryHistory={telemetryHistory}
        />
      </div>
    </div>
  );
};

