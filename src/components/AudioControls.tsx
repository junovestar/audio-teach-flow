
import React from 'react';
import { Button } from "@/components/ui/button";
import { Mic, Square, Wifi, WifiOff } from 'lucide-react';

interface AudioControlsProps {
  isConnected: boolean;
  isRecording: boolean;
  connectWebSocket: () => void;
  toggleRecording: () => void;
}

const AudioControls: React.FC<AudioControlsProps> = ({ 
  isConnected, 
  isRecording, 
  connectWebSocket, 
  toggleRecording 
}) => {
  return (
    <div className="flex justify-center space-x-4 mb-8">
      <Button
        onClick={connectWebSocket}
        disabled={isConnected}
        className="bg-teacher-primary hover:bg-teacher-dark"
      >
        {isConnected ? <Wifi className="mr-2 h-4 w-4" /> : <WifiOff className="mr-2 h-4 w-4" />}
        Kết nối
      </Button>
      
      <Button
        onClick={toggleRecording}
        disabled={!isConnected}
        className={isRecording ? "bg-red-500 hover:bg-red-600" : "bg-green-500 hover:bg-green-600"}
      >
        {isRecording ? (
          <>
            <Square className="mr-2 h-4 w-4" /> Dừng ghi âm
          </>
        ) : (
          <>
            <Mic className="mr-2 h-4 w-4" /> Ghi âm
          </>
        )}
      </Button>
    </div>
  );
};

export default AudioControls;
