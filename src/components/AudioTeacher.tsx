
import React, { useState, useRef, useEffect } from 'react';
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Mic, MicOff, Play, Stop, Wifi, WifiOff, Volume2 } from 'lucide-react';
import { cn } from "@/lib/utils";

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
  const animationFrameRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  
  const addLog = (message: string) => {
    const now = new Date();
    const timestamp = now.toLocaleTimeString();
    setLogs(prevLogs => [{
      time: timestamp,
      message
    }, ...prevLogs].slice(0, 100)); // Keep only the last 100 logs
  };

  // Handle WebSocket connection
  const connectWebSocket = () => {
    try {
      wsRef.current = new WebSocket('wss://ws.thanhpn.online:3001');
      
      wsRef.current.onopen = () => {
        setIsConnected(true);
        addLog('Kết nối thành công với WebSocket server');
        toast({
          title: "Kết nối thành công",
          description: "Đã kết nối với WebSocket server",
        });
      };
      
      wsRef.current.onclose = () => {
        setIsConnected(false);
        setIsRecording(false);
        addLog('Mất kết nối với WebSocket server');
        toast({
          title: "Mất kết nối",
          description: "Mất kết nối với WebSocket server",
          variant: "destructive",
        });
      };
      
      wsRef.current.onmessage = (event) => {
        try {
          addLog('Nhận phản hồi từ server');
          console.log('Response:', event.data);
          
          // Try to parse the response as JSON
          const response = JSON.parse(event.data);
          
          // If the response contains audio data
          if (response.type === 'audio' && response.data) {
            playReceivedAudio(response.data, response.format || 'mp3');
          }
        } catch (error) {
          if (error instanceof Error) {
            addLog('Lỗi xử lý phản hồi: ' + error.message);
          }
        }
      };
      
      wsRef.current.onerror = (error) => {
        addLog('Lỗi WebSocket');
        toast({
          title: "Lỗi kết nối",
          description: "Không thể kết nối đến server",
          variant: "destructive",
        });
      };
    } catch (error) {
      if (error instanceof Error) {
        addLog('Lỗi khi tạo kết nối: ' + error.message);
      }
    }
  };

  // Audio recording setup
  const setupAudioRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Set up audio context and analyser
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;
      
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyserRef.current = analyser;
      
      analyser.fftSize = 2048;
      source.connect(analyser);
      
      // Set up media recorder
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };
      
      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        audioChunksRef.current = [];
        
        const reader = new FileReader();
        reader.onload = () => {
          if (reader.result && typeof reader.result === 'string') {
            const base64Audio = reader.result.split(',')[1];
            sendAudioToServer(base64Audio);
          }
        };
        reader.readAsDataURL(audioBlob);
      };
      
      return true;
    } catch (error) {
      if (error instanceof Error) {
        addLog('Lỗi truy cập microphone: ' + error.message);
        toast({
          title: "Lỗi truy cập microphone",
          description: error.message,
          variant: "destructive",
        });
      }
      return false;
    }
  };

  // Send audio to server
  const sendAudioToServer = (base64Audio: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const message = {
        type: 'audio',
        data: base64Audio,
        format: 'wav',
        timestamp: new Date().toISOString()
      };
      wsRef.current.send(JSON.stringify(message));
      addLog('Đã gửi dữ liệu âm thanh');
    } else {
      addLog('Không thể gửi âm thanh: WebSocket không được kết nối');
      toast({
        title: "Lỗi gửi âm thanh",
        description: "WebSocket không được kết nối",
        variant: "destructive",
      });
    }
  };

  // Play received audio from server
  const playReceivedAudio = (base64Audio: string, format: string) => {
    try {
      // Decode base64 to binary
      const byteCharacters = atob(base64Audio);
      const byteArrays = [];
      
      for (let offset = 0; offset < byteCharacters.length; offset += 512) {
        const slice = byteCharacters.slice(offset, offset + 512);
        const byteNumbers = new Array(slice.length);
        
        for (let i = 0; i < slice.length; i++) {
          byteNumbers[i] = slice.charCodeAt(i);
        }
        
        const byteArray = new Uint8Array(byteNumbers);
        byteArrays.push(byteArray);
      }
      
      const blob = new Blob(byteArrays, { type: `audio/${format}` });
      const audioUrl = URL.createObjectURL(blob);
      
      // Create or use existing audio element
      if (!audioPlayerRef.current) {
        audioPlayerRef.current = new Audio();
      }
      
      audioPlayerRef.current.src = audioUrl;
      audioPlayerRef.current.onplay = () => {
        setIsPlaying(true);
        addLog('Đang phát âm thanh từ giáo viên');
      };
      audioPlayerRef.current.onended = () => {
        setIsPlaying(false);
        addLog('Kết thúc phát âm thanh');
      };
      audioPlayerRef.current.onerror = (e) => {
        setIsPlaying(false);
        addLog('Lỗi phát âm thanh');
      };
      
      audioPlayerRef.current.play().catch(error => {
        addLog('Lỗi phát âm thanh: ' + error.message);
      });
    } catch (error) {
      if (error instanceof Error) {
        addLog('Lỗi xử lý âm thanh: ' + error.message);
      }
    }
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
    
    const isSetup = await setupAudioRecording();
    if (isSetup && mediaRecorderRef.current) {
      mediaRecorderRef.current.start(1000);
      setIsRecording(true);
      addLog('Bắt đầu ghi âm');
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

  // Start visualizing audio
  const startVisualizing = () => {
    if (!canvasRef.current || !analyserRef.current) return;
    
    const canvasCtx = canvasRef.current.getContext('2d');
    if (!canvasCtx) return;
    
    const analyser = analyserRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    const draw = () => {
      animationFrameRef.current = requestAnimationFrame(draw);
      
      analyser.getByteTimeDomainData(dataArray);
      
      canvasCtx.fillStyle = 'rgb(240, 249, 255)';
      canvasCtx.fillRect(0, 0, canvasRef.current!.width, canvasRef.current!.height);
      
      canvasCtx.lineWidth = 2;
      canvasCtx.strokeStyle = 'rgb(14, 165, 233)';
      canvasCtx.beginPath();
      
      const sliceWidth = canvasRef.current!.width * 1.0 / bufferLength;
      let x = 0;
      
      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = v * canvasRef.current!.height / 2;
        
        if (i === 0) {
          canvasCtx.moveTo(x, y);
        } else {
          canvasCtx.lineTo(x, y);
        }
        
        x += sliceWidth;
      }
      
      canvasCtx.lineTo(canvasRef.current!.width, canvasRef.current!.height / 2);
      canvasCtx.stroke();
    };
    
    draw();
  };

  // Stop visualizing audio
  const stopVisualizing = () => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  };

  // Handle canvas resize
  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current) {
        canvasRef.current.width = canvasRef.current.offsetWidth;
      }
    };
    
    handleResize();
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Clean up when component unmounts
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
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
        {/* Connection Status */}
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
            <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
          )}
          
          {isPlaying && (
            <div className="flex items-center px-3 py-1 rounded-full bg-blue-100 text-blue-800 text-sm">
              <Volume2 className="w-4 h-4 mr-1" />
              <span>Đang phát</span>
            </div>
          )}
        </div>
        
        {/* Controls */}
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
                <Stop className="mr-2 h-4 w-4" /> Dừng ghi âm
              </>
            ) : (
              <>
                <Mic className="mr-2 h-4 w-4" /> Ghi âm
              </>
            )}
          </Button>
        </div>
        
        {/* Audio Visualization */}
        <div className="mb-6 bg-sky-50 rounded-md p-1">
          <canvas 
            ref={canvasRef} 
            height={100} 
            className="w-full rounded" 
          />
        </div>
        
        {/* Logs */}
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
      </CardContent>
    </Card>
  );
};

export default AudioTeacher;
