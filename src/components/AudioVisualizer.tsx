
import React from 'react';

interface AudioVisualizerProps {
  canvasRef: React.RefObject<HTMLCanvasElement>;
}

const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ canvasRef }) => {
  return (
    <div className="mb-6 bg-sky-50 rounded-md p-1">
      <canvas 
        ref={canvasRef} 
        height={100} 
        className="w-full rounded" 
      />
    </div>
  );
};

export default AudioVisualizer;
