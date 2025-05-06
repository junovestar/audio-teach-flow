
import React from 'react';
import { Button } from "@/components/ui/button";
import { Mic, Square, Wifi } from 'lucide-react';

interface AudioControlsProps {
  isConnected: boolean;
  isRecording: boolean;
  isWaitingResponse: boolean;
  connectWebSocket: () => void;
  toggleRecording: () => void;
}

const AudioControls: React.FC<AudioControlsProps> = ({ 
  isConnected, 
  isRecording,
  isWaitingResponse,
  connectWebSocket, 
  toggleRecording 
}) => {
  return (
    <div className="flex justify-center space-x-4 mb-8">
      {!isConnected && (
        <Button
          onClick={connectWebSocket}
          className="bg-blue-500 hover:bg-blue-600 text-white"
        >
          <Wifi className="mr-2 h-4 w-4" />
          Kết nối với giáo viên
        </Button>
      )}
      
      <Button
        onClick={toggleRecording}
        disabled={!isConnected || isWaitingResponse}
        className={isRecording 
          ? "bg-red-500 hover:bg-red-600 text-white" 
          : "bg-green-500 hover:bg-green-600 text-white"
        }
      >
        {isRecording ? (
          <>
            <Square className="mr-2 h-4 w-4" /> Dừng nói
          </>
        ) : (
          <>
            <Mic className="mr-2 h-4 w-4" /> Bắt đầu nói
          </>
        )}
      </Button>
    </div>
  );
};

export default AudioControls;
