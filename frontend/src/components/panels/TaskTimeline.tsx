import React from 'react';
import {
  GitCommitHorizontal,
  CheckCircle2,
  Clock,
  Play,
  XCircle,
  PlayCircle,
} from 'lucide-react';
import { PanelContainer } from '../common/PanelContainer';
import { TaskStage } from '../../types/robot';

interface TaskTimelineProps {
  stages: TaskStage[];
  currentTaskId?: string;
  onStartTask?: (taskId: string) => void;
  isStartingTask?: boolean;
}

export const TaskTimeline: React.FC<TaskTimelineProps> = ({
  stages,
  currentTaskId = 'mission_search_recover_01',
  onStartTask,
  isStartingTask = false,
}) => {
  return (
    <PanelContainer
      title="Mission Task Pipeline"
      subtitle={`Mission Execution Sequence • Target: [${currentTaskId}]`}
      icon={<GitCommitHorizontal size={16} />}
      actions={
        onStartTask && (
          <button
            onClick={() => onStartTask(currentTaskId)}
            disabled={isStartingTask}
            className="px-2.5 py-1 rounded bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-500/40 text-cyan-300 font-mono text-xs flex items-center gap-1.5 transition-all disabled:opacity-50"
          >
            <PlayCircle size={13} />
            <span>{isStartingTask ? 'Starting...' : 'Run Pipeline'}</span>
          </button>
        )
      }
    >
      <div className="overflow-x-auto pb-2">
        <div className="flex items-start min-w-[760px] relative">
          {/* Connector line across stages */}
          <div className="absolute top-4 left-6 right-6 h-[2px] bg-[#1f2a40] -z-0" />

          {stages.map((stage, idx) => {
            const isCompleted = stage.status === 'completed';
            const isRunning = stage.status === 'running';
            const isFailed = stage.status === 'failed';
            const isPending = stage.status === 'pending';

            return (
              <div
                key={stage.id}
                className="flex-1 flex flex-col items-center text-center px-1 relative z-10"
              >
                {/* Node icon circle */}
                <div
                  className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all ${
                    isCompleted
                      ? 'border-emerald-500 bg-emerald-950 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.4)]'
                      : isRunning
                      ? 'border-cyan-400 bg-cyan-950 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.6)] animate-pulse'
                      : isFailed
                      ? 'border-rose-500 bg-rose-950 text-rose-400 shadow-[0_0_10px_rgba(239,68,68,0.4)]'
                      : 'border-slate-700 bg-[#0c1018] text-slate-600'
                  }`}
                >
                  {isCompleted ? (
                    <CheckCircle2 size={15} />
                  ) : isRunning ? (
                    <Play size={14} className="fill-cyan-400 text-cyan-400 ml-0.5" />
                  ) : isFailed ? (
                    <XCircle size={15} />
                  ) : (
                    <span className="font-mono text-xs font-bold">{stage.id}</span>
                  )}
                </div>

                {/* Stage title */}
                <div className="mt-2 font-mono text-[11px] font-semibold text-slate-200">
                  {stage.name}
                </div>

                {/* Status Badge */}
                <div className="mt-1">
                  <span
                    className={`px-1.5 py-0.2 rounded text-[9px] font-mono uppercase tracking-wider border ${
                      isCompleted
                        ? 'border-emerald-500/30 bg-emerald-950/40 text-emerald-400'
                        : isRunning
                        ? 'border-cyan-500/40 bg-cyan-950/60 text-cyan-300'
                        : isFailed
                        ? 'border-rose-500/40 bg-rose-950/60 text-rose-400'
                        : 'border-slate-800 bg-slate-900 text-slate-500'
                    }`}
                  >
                    {stage.status}
                  </span>
                </div>

                {/* Description & Timestamp */}
                <div className="text-[10px] text-slate-400 font-mono mt-1 max-w-[95px] truncate" title={stage.description}>
                  {stage.description}
                </div>
                {stage.timestamp && (
                  <div className="flex items-center gap-1 text-[9px] text-slate-500 font-mono mt-0.5">
                    <Clock size={9} />
                    <span>{stage.timestamp}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </PanelContainer>
  );
};

