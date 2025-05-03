
import React from 'react';
import { cn } from "@/lib/utils";
import { Mic, Volume2, Wifi, WifiOff } from 'lucide-react';

interface StatusIndicatorsProps {
  isConnected: boolean;
  isRecording: boolean;
  isPlaying: boolean;
  isSpeaking: boolean;
}

const StatusIndicators: React.FC<StatusIndicatorsProps> = ({ 
  isConnected, 
  isRecording, 
  isPlaying,
  isSpeaking 
}) => {
  return (
    <div className="flex justify-center items-center space-x-2 mb-6">
      <div className={cn(
        "px-3 py-1 rounded-full flex items-center justify-center text-sm font-medium",
        isConnected ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
      )}>
        {isConnected ? (
          <>
            <Wifi className="w-4 h-4 mr-1" />
            <span>Đã kết nối</span>
          </>
        ) : (
          <>
            <WifiOff className="w-4 h-4 mr-1" />
            <span>Chưa kết nối</span>
          </>
        )}
      </div>
      
      {isRecording && (
        <div className="flex items-center px-3 py-1 rounded-full bg-red-100 text-red-800 text-sm">
          <Mic className="w-4 h-4 mr-1 animate-pulse" />
          <span>Đang ghi âm</span>
          {isSpeaking && (
            <span className="ml-1 w-2 h-2 bg-red-500 rounded-full animate-ping"></span>
          )}
        </div>
      )}
      
      {isPlaying && (
        <div className="flex items-center px-3 py-1 rounded-full bg-blue-100 text-blue-800 text-sm">
          <Volume2 className="w-4 h-4 mr-1 animate-pulse" />
          <span>Đang phát</span>
        </div>
      )}
    </div>
  );
};

export default StatusIndicators;
