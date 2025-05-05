
import React, { useState, useRef, useEffect } from 'react';
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import AudioVisualizer from './AudioVisualizer';
import StatusIndicators from './StatusIndicators';
import AudioControls from './AudioControls';
import LogDisplay from './LogDisplay';
import { useSilenceDetection } from '@/hooks/useSilenceDetection';
import { useAudioVisualization } from '@/hooks/useAudioVisualization';
import { 
  playAudioFromBlob, 
  setupAudioRecording, 
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
  const [wasRecording, setWasRecording] = useState(false); // Lưu trạng thái ghi âm trước khi tạm dừng
  
  // References
  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sentRequestIdsRef = useRef<Set<string>>(new Set()); // Lưu trữ các requestId đã gửi
  
  // Hàm thêm log
  const addLog = (message: string) => {
    const now = new Date();
    const timestamp = now.toLocaleTimeString();
    setLogs(prevLogs => [{
      time: timestamp,
      message
    }, ...prevLogs].slice(0, 100)); // Giữ 100 logs mới nhất
    console.log(`[${timestamp}] ${message}`);
  };
  
  // Tạo hàm gửi âm thanh đến server
  const sendAudioToServer = createSendAudioToServer(wsRef, addLog);
  
  // Tạo hàm gửi âm thanh đã thu thập
  const sendCollectedAudio = createSendCollectedAudio(
    audioChunksRef, 
    addLog, 
    sendAudioToServer
  );
  
  // Hook phát hiện im lặng
  const { silenceDetectionRef, startVolumeDetection } = useSilenceDetection(
    isRecording,
    analyserRef,
    sendCollectedAudio,
    addLog
  );
  
  // Hook trực quan hóa âm thanh
  useAudioVisualization(canvasRef, analyserRef, isRecording);
  
  // Tạo hàm xử lý đoạn âm thanh
  const processSpeechChunk = createProcessSpeechChunk(
    silenceDetectionRef,
    sendAudioToServer
  );

  // Tạm dừng ghi âm khi phát âm thanh
  const pauseRecording = () => {
    if (isRecording && mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
      setWasRecording(true);
      addLog('Tạm dừng ghi âm vì đang phát âm thanh từ giáo viên');
    }
  };

  // Tiếp tục ghi âm sau khi kết thúc âm thanh
  const resumeRecording = () => {
    if (wasRecording && mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume();
      setWasRecording(false);
      addLog('Tiếp tục ghi âm sau khi phát âm thanh');
      
      // Xóa các audio chunks cũ khi tiếp tục ghi âm
      audioChunksRef.current = [];
    }
  };
  
  // Xử lý tin nhắn WebSocket
  const handleWebSocketMessage = (event: MessageEvent) => {
    try {
      addLog('Nhận phản hồi từ server');
      const data = event.data;
      console.log('Response type:', typeof data);
      
      // Kiểm tra nếu dữ liệu là Blob
      if (data instanceof Blob) {
        const blobType = data.type || 'unknown';
        const blobSize = data.size;
        addLog(`Nhận dữ liệu dạng Blob từ server: type=${blobType}, size=${blobSize} bytes`);
        
        // Nếu blob không có type hoặc type không hợp lệ, thử xử lý như MP3
        const processedBlob = blobType === 'unknown' || !blobType 
          ? new Blob([data], { type: 'audio/mpeg' })
          : data;
          
        // Tạm dừng ghi âm trước khi phát
        pauseRecording();
        
        // Xử lý dữ liệu Blob (ví dụ: âm thanh MP3)
        playAudioFromBlob(processedBlob, audioPlayerRef, setIsPlaying, addLog, resumeRecording);
        return;
      }
      
      // Xử lý dữ liệu là string (JSON)
      try {
        const response = JSON.parse(data);
        console.log('Parsed response:', response);
        
        // Nếu phản hồi có dữ liệu âm thanh
        if (response.type === 'audio' && response.data) {
          addLog(`Nhận dữ liệu âm thanh từ server: format=${response.format || 'mp3'}`);
          
          // Tạm dừng ghi âm trước khi phát
          pauseRecording();
          playReceivedAudio(response.data, response.format || 'mp3', audioPlayerRef, setIsPlaying, addLog, resumeRecording);
          
          // Nếu có requestId, đánh dấu đã nhận phản hồi
          if (response.requestId && sentRequestIdsRef.current.has(response.requestId)) {
            sentRequestIdsRef.current.delete(response.requestId);
            addLog(`Đã xử lý phản hồi cho requestId: ${response.requestId}`);
          }
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
  
  // Kết nối WebSocket với server
  const handleConnectWebSocket = () => {
    connectWebSocket(
      wsRef, 
      setIsConnected, 
      setIsRecording, 
      addLog,
      handleWebSocketMessage
    );
  };

  // Start recording - chế độ realtime
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
      // Xóa audio chunks cũ
      audioChunksRef.current = [];
      
      // Reset phát hiện im lặng
      silenceDetectionRef.current = {
        lastVolume: 0,
        silenceStart: null,
        speaking: false,
        sentenceDetected: false
      };
      
      // Reset danh sách requestId đã gửi
      sentRequestIdsRef.current.clear();
      
      // Bắt đầu ghi âm với khoảng thời gian ngắn cho việc truyền realtime
      mediaRecorderRef.current.start(500); // Thu âm mỗi 500ms
      setIsRecording(true);
      setWasRecording(false);
      addLog('Bắt đầu ghi âm realtime với phát hiện câu nói tự động');
    }
  };

  // Stop recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setWasRecording(false);
      addLog('Dừng ghi âm realtime');
      
      // Gửi các đoạn âm thanh còn lại nếu có
      if (audioChunksRef.current.length > 0) {
        sendCollectedAudio();
        // Đảm bảo xóa chunks sau khi gửi
        audioChunksRef.current = [];
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
    handleConnectWebSocket();
    
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
        
        {/* Controls */}
        <AudioControls
          isConnected={isConnected}
          isRecording={isRecording}
          connectWebSocket={handleConnectWebSocket}
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
