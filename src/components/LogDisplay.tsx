
import React from 'react';

interface Log {
  time: string;
  message: string;
}

interface LogDisplayProps {
  logs: Log[];
}

const LogDisplay: React.FC<LogDisplayProps> = ({ logs }) => {
  return (
    <div className="border rounded-md h-48 overflow-y-auto p-2 bg-gray-50 text-sm">
      {logs.map((log, index) => (
        <div key={index} className="log-entry mb-1 border-b border-gray-100 pb-1">
          <span className="text-gray-500 mr-2">[{log.time}]</span>
          <span>{log.message}</span>
        </div>
      ))}
      {logs.length === 0 && (
        <div className="text-gray-400 italic text-center mt-4">
          Chưa có logs
        </div>
      )}
    </div>
  );
};

export default LogDisplay;
