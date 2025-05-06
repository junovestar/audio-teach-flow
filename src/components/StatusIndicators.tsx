
import React from 'react';
import { cn } from "@/lib/utils";
import { Mic, Headphones, Wifi, WifiOff } from 'lucide-react';

interface StatusIndicatorsProps {
  isConnected: boolean;
  isRecording: boolean;
  isPlaying: boolean;
  isSpeaking: boolean;
  isWaitingResponse: boolean;
}

const StatusIndicators: React.FC<StatusIndicatorsProps> = ({ 
  isConnected, 
  isRecording, 
  isPlaying,
  isSpeaking,
  isWaitingResponse
}) => {
  return (
    <div className="flex justify-center items-center space-x-2 mb-6">
      {/* Connection Status */}
      <div className={cn(
        "px-3 py-1 rounded-full flex items-center justify-center text-sm font-medium transition-colors",
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
      
      {/* Recording Status */}
      {isRecording && (
        <div className="flex items-center px-3 py-1 rounded-full bg-red-100 text-red-800 text-sm">
          <Mic className={cn("w-4 h-4 mr-1", isSpeaking ? "animate-pulse" : "")} />
          <span>Đang ghi âm</span>
          {isSpeaking && (
            <span className="ml-1 w-2 h-2 bg-red-500 rounded-full animate-ping"></span>
          )}
        </div>
      )}
      
      {/* Listening Status */}
      {isPlaying && (
        <div className="flex items-center px-3 py-1 rounded-full bg-blue-100 text-blue-800 text-sm">
          <Headphones className="w-4 h-4 mr-1 animate-pulse" />
          <span>Đang nghe giáo viên</span>
        </div>
      )}
      
      {/* Waiting Response */}
      {isWaitingResponse && !isPlaying && (
        <div className="flex items-center px-3 py-1 rounded-full bg-purple-100 text-purple-800 text-sm">
          <div className="mr-1 flex space-x-1">
            <div className="w-1 h-1 bg-purple-600 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></div>
            <div className="w-1 h-1 bg-purple-600 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></div>
            <div className="w-1 h-1 bg-purple-600 rounded-full animate-bounce" style={{ animationDelay: "600ms" }}></div>
          </div>
          <span>Chờ giáo viên phản hồi</span>
        </div>
      )}
    </div>
  );
};

export default StatusIndicators;
