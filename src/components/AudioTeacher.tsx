
import React, { useState, useRef, useEffect } from 'react';
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import StatusIndicators from './StatusIndicators';
import AudioControls from './AudioControls';
import AudioVisualizer from './AudioVisualizer';
import LogDisplay from './LogDisplay';
import { useAudioVisualization } from '@/hooks/useAudioVisualization';
import { useSilenceDetection } from '@/hooks/useSilenceDetection';
import { 
  setupAudioRecording, 
  playAudioFromBlob, 
  createProcessSpeechChunk, 
  createSendCollectedAudio 
} from '@/utils/audioUtils';
import { 
  connectWebSocket, 
  createSendAudioToServer, 
  playReceivedAudio 
} from '@/utils/websocketUtils';

const AudioTeacher: React.FC = () => {
  const { toast } = useToast();
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [logs, setLogs] = useState<{ time: string; message: string }[]>([]);
  
  // References
  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  // Utility function to add logs
  const addLog = (message: string) => {
    const now = new Date();
    const timestamp = now.toLocaleTimeString();
    setLogs(prevLogs => [{
      time: timestamp,
      message
    }, ...prevLogs].slice(0, 100)); // Keep only the last 100 logs
    console.log(`[${timestamp}] ${message}`);
  };

  // Create send audio function
  const sendAudioToServer = createSendAudioToServer(wsRef, addLog);
  
  // Create send collected audio function
  const sendCollectedAudio = createSendCollectedAudio(audioChunksRef, addLog, sendAudioToServer);
  
  // Use the silence detection hook
  const { silenceDetectionRef, startVolumeDetection } = useSilenceDetection(
    isRecording,
    analyserRef,
    sendCollectedAudio,
    addLog
  );
  
  // Create speech chunk processor
  const processSpeechChunk = createProcessSpeechChunk(silenceDetectionRef, sendAudioToServer);

  // Use audio visualization hook
  const { startVisualizing, stopVisualizing } = useAudioVisualization(canvasRef, analyserRef, isRecording);

  // WebSocket message handler
  const handleWebSocketMessage = (event: MessageEvent) => {
    try {
      addLog('Nhận phản hồi từ server');
      const data = event.data;
      console.log('Response type:', typeof data);
      
      // Kiểm tra nếu dữ liệu là Blob
      if (data instanceof Blob) {
        addLog('Nhận dữ liệu dạng Blob từ server');
        // Xử lý dữ liệu Blob (ví dụ: âm thanh MP3)
        playAudioFromBlob(data, audioPlayerRef, setIsPlaying, addLog);
        return;
      }
      
      // Xử lý dữ liệu là string (JSON)
      try {
        const response = JSON.parse(data);
        console.log('Parsed response:', response);
        
        // Nếu phản hồi có dữ liệu âm thanh
        if (response.type === 'audio' && response.data) {
          addLog('Nhận dữ liệu âm thanh từ server');
          playReceivedAudio(response.data, response.format || 'mp3', audioPlayerRef, setIsPlaying, addLog);
        }
      } catch (parseError) {
        if (parseError instanceof Error) {
          addLog('Dữ liệu không phải JSON, xử lý như văn bản: ' + parseError.message);
          console.log('Text response:', data);
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        addLog('Lỗi xử lý phản hồi: ' + error.message);
      }
    }
  };

  // Initialize WebSocket connection
  const initWebSocket = () => {
    connectWebSocket(wsRef, setIsConnected, setIsRecording, addLog, handleWebSocketMessage);
  };

  // Start recording
  const startRecording = async () => {
    if (!isConnected) {
      toast({
        title: "Chưa kết nối",
        description: "Vui lòng kết nối đến server trước",
        variant: "destructive",
      });
      return;
    }
    
    const isSetup = await setupAudioRecording(
      streamRef, 
      audioContextRef, 
      analyserRef, 
      mediaRecorderRef, 
      audioChunksRef,
      silenceDetectionRef,
      addLog,
      processSpeechChunk,
      startVolumeDetection
    );
    
    if (isSetup && mediaRecorderRef.current) {
      // Clear previous audio chunks
      audioChunksRef.current = [];
      
      // Reset silence detection
      silenceDetectionRef.current = {
        lastVolume: 0,
        silenceStart: null,
        speaking: false
      };
      
      // Start recording with short intervals for real-time transmission
      mediaRecorderRef.current.start(500); // Thu âm mỗi 500ms
      setIsRecording(true);
      addLog('Bắt đầu ghi âm real-time');
      startVisualizing();
    }
  };

  // Stop recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      addLog('Dừng ghi âm');
      stopVisualizing();
      
      // Gửi các đoạn âm thanh còn lại nếu có
      if (audioChunksRef.current.length > 0) {
        sendCollectedAudio();
      }
    }
  };

  // Toggle recording
  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  // Connect to WebSocket when component mounts
  useEffect(() => {
    // Auto-connect on component mount
    initWebSocket();
    
    // Clean up when component unmounts
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  return (
    <Card className="w-full max-w-3xl mx-auto shadow-lg">
      <CardHeader className="bg-gradient-to-r from-teacher-primary to-teacher-secondary text-white">
        <CardTitle className="text-center text-2xl font-bold">
          Audio Teaching Flow
        </CardTitle>
      </CardHeader>
      
      <CardContent className="p-6">
        {/* Status Indicators */}
        <StatusIndicators 
          isConnected={isConnected}
          isRecording={isRecording}
          isPlaying={isPlaying}
          isSpeaking={silenceDetectionRef.current?.speaking || false}
        />
        
        {/* Audio Controls */}
        <AudioControls
          isConnected={isConnected}
          isRecording={isRecording}
          connectWebSocket={initWebSocket}
          toggleRecording={toggleRecording}
        />
        
        {/* Audio Visualization */}
        <AudioVisualizer canvasRef={canvasRef} />
        
        {/* Logs */}
        <LogDisplay logs={logs} />
      </CardContent>
    </Card>
  );
};

export default AudioTeacher;
