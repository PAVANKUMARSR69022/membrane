import React from 'react';
import { Keyframes } from '../components/panels/Keyframes';
import { KeyframeItem } from '../types/robot';

interface RecordingsPageProps {
  keyframes: KeyframeItem[];
}

export const RecordingsPage: React.FC<RecordingsPageProps> = ({ keyframes }) => {
  return (
    <div className="p-4 space-y-4 max-w-[1920px] mx-auto">
      <Keyframes keyframes={keyframes} />
    </div>
  );
};

