
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
  const isRestartingRecorderRef = useRef<boolean>(false); // Theo dõi trạng thái đang restart recorder
  
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
  
  // Xử lý khi phát hiện kết thúc câu - Restart recorder
  const restartRecorderAfterSentence = async () => {
    if (isRestartingRecorderRef.current || !isRecording) return;
    
    isRestartingRecorderRef.current = true;
    addLog('Khởi động lại recorder sau khi phát hiện kết thúc câu');
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      // Dừng recorder hiện tại nếu đang hoạt động
      mediaRecorderRef.current.stop();
      // Chờ một chút để đảm bảo dữ liệu được xử lý xong
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Khởi động lại recorder với stream hiện có
    if (streamRef.current) {
      try {
        // Xóa audio chunks cũ
        audioChunksRef.current = [];
        
        // Tạo recorder mới nếu stream vẫn có sẵn
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
          ? 'audio/webm;codecs=opus' 
          : '';
        
        const options: MediaRecorderOptions = { 
          audioBitsPerSecond: 128000 
        };
        
        if (mimeType) {
          options.mimeType = mimeType;
        }
        
        mediaRecorderRef.current = new MediaRecorder(streamRef.current, options);
        
        // Cài đặt xử lý dữ liệu âm thanh
        mediaRecorderRef.current.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            audioChunksRef.current.push(event.data);
            addLog(`Đã thu thập đoạn âm thanh: ${event.data.size} bytes - Type: ${event.data.type}`);
          }
        };
        
        // Khởi động lại ghi âm
        mediaRecorderRef.current.start(500);
        addLog('Đã khởi động lại recorder thành công');
        
      } catch (error) {
        if (error instanceof Error) {
          addLog('Lỗi khởi động lại recorder: ' + error.message);
        }
      }
    } else {
      addLog('Không thể khởi động lại recorder: Stream không khả dụng');
    }
    
    isRestartingRecorderRef.current = false;
  };
  
  // Hook phát hiện im lặng
  const { silenceDetectionRef, startVolumeDetection } = useSilenceDetection(
    isRecording,
    analyserRef,
    sendCollectedAudio,
    addLog,
    restartRecorderAfterSentence // Thêm callback khi phát hiện kết thúc câu
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
      addLog('Tạm dừng ghi âm vì đang phát âm thanh từ giáo viên');
    }
  };

  // Tiếp tục ghi âm sau khi kết thúc âm thanh
  const resumeRecording = async () => {
    if (isRecording) {
      // Thay vì tiếp tục ghi âm cũ, hãy khởi động lại recorder
      addLog('Tiếp tục ghi âm sau khi phát âm thanh bằng cách khởi động lại recorder');
      await restartRecorderAfterSentence();
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
          addLog(`Nhận dữ liệu âm thanh từ server: format=${response.format || 'mp3'}, size=${response.data.length} chars`);
          
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
      
      // Đặt lại trạng thái đang restart
      isRestartingRecorderRef.current = false;
      
      // Bắt đầu ghi âm với khoảng thời gian ngắn cho việc truyền realtime
      mediaRecorderRef.current.start(500); // Thu âm mỗi 500ms
      setIsRecording(true);
      addLog('Bắt đầu ghi âm realtime với phát hiện câu nói tự động');
    }
  };

  // Stop recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      addLog('Dừng ghi âm realtime');
      
      // Gửi các đoạn âm thanh còn lại nếu có
      if (audioChunksRef.current.length > 0) {
        sendCollectedAudio();
        // Đảm bảo xóa chunks sau khi gửi
        audioChunksRef.current = [];
      }
      
      // Dừng tất cả các track audio
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => {
          track.stop();
          addLog('Đã dừng audio track');
        });
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

  // Thêm heartbeat để giữ kết nối WebSocket
  useEffect(() => {
    let heartbeatInterval: number | null = null;
    
    if (isConnected && wsRef.current) {
      // Gửi heartbeat mỗi 30 giây
      heartbeatInterval = window.setInterval(() => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          try {
            wsRef.current.send(JSON.stringify({ type: 'heartbeat', timestamp: new Date().toISOString() }));
            addLog('Đã gửi heartbeat để giữ kết nối');
          } catch (error) {
            if (error instanceof Error) {
              addLog('Lỗi gửi heartbeat: ' + error.message);
            }
          }
        }
      }, 30000);
    }
    
    return () => {
      if (heartbeatInterval !== null) {
        clearInterval(heartbeatInterval);
      }
    };
  }, [isConnected]);

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
