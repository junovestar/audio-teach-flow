
import React, { useState, useRef, useEffect } from 'react';
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Mic, MicOff, Play, Square, Wifi, WifiOff, Volume2 } from 'lucide-react';
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
  const streamRef = useRef<MediaStream | null>(null);
  const silenceDetectionRef = useRef<{
    lastVolume: number;
    silenceStart: number | null;
    speaking: boolean;
  }>({
    lastVolume: 0,
    silenceStart: null,
    speaking: false
  });
  
  const addLog = (message: string) => {
    const now = new Date();
    const timestamp = now.toLocaleTimeString();
    setLogs(prevLogs => [{
      time: timestamp,
      message
    }, ...prevLogs].slice(0, 100)); // Keep only the last 100 logs
    console.log(`[${timestamp}] ${message}`);
  };

  // Handle WebSocket connection
  const connectWebSocket = () => {
    try {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        addLog('WebSocket đã được kết nối');
        return;
      }
      
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
          const data = event.data;
          console.log('Response type:', typeof data);
          
          // Kiểm tra nếu dữ liệu là Blob
          if (data instanceof Blob) {
            addLog('Nhận dữ liệu dạng Blob từ server');
            // Xử lý dữ liệu Blob (ví dụ: âm thanh MP3)
            playAudioFromBlob(data);
            return;
          }
          
          // Xử lý dữ liệu là string (JSON)
          try {
            const response = JSON.parse(data);
            console.log('Parsed response:', response);
            
            // Nếu phản hồi có dữ liệu âm thanh
            if (response.type === 'audio' && response.data) {
              addLog('Nhận dữ liệu âm thanh từ server');
              playReceivedAudio(response.data, response.format || 'mp3');
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

  // Play audio from Blob (for MP3)
  const playAudioFromBlob = (audioBlob: Blob) => {
    try {
      const audioUrl = URL.createObjectURL(audioBlob);
      
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
        URL.revokeObjectURL(audioUrl); // Giải phóng bộ nhớ
      };
      audioPlayerRef.current.onerror = (e) => {
        setIsPlaying(false);
        addLog('Lỗi phát âm thanh');
      };
      
      audioPlayerRef.current.play().catch(error => {
        if (error instanceof Error) {
          addLog('Lỗi phát âm thanh: ' + error.message);
        }
      });
    } catch (error) {
      if (error instanceof Error) {
        addLog('Lỗi xử lý âm thanh: ' + error.message);
      }
    }
  };

  // Audio recording setup
  const setupAudioRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      // Set up audio context and analyser
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;
      
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyserRef.current = analyser;
      
      analyser.fftSize = 2048;
      source.connect(analyser);
      
      // Set up media recorder with appropriate MIME type
      const options = { 
        mimeType: 'audio/webm;codecs=opus', // Hỗ trợ tốt hơn cho web
        audioBitsPerSecond: 128000 
      };
      
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
          addLog(`Đã thu thập đoạn âm thanh: ${event.data.size} bytes`);
          
          // Gửi mỗi đoạn âm thanh đến WebSocket theo thời gian thực
          processSpeechChunk(event.data);
        }
      };
      
      // Bắt đầu phát hiện âm lượng và khoảng lặng
      startVolumeDetection();
      
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
  
  // Phát hiện âm lượng và khoảng lặng
  const startVolumeDetection = () => {
    if (!analyserRef.current) return;
    
    const analyser = analyserRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    const checkVolume = () => {
      if (!isRecording) return;
      
      analyser.getByteTimeDomainData(dataArray);
      
      // Tính toán âm lượng trung bình
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        // Chuyển đổi dữ liệu byte sang giá trị từ -1 đến 1
        const val = ((dataArray[i] / 128.0) - 1.0);
        // Lấy giá trị tuyệt đối để có biên độ
        sum += Math.abs(val);
      }
      const avgVolume = sum / bufferLength;
      
      const silenceThreshold = 0.05; // Ngưỡng của sự im lặng
      const silenceTime = 1000; // Thời gian im lặng (ms) để coi là hết câu
      
      const now = performance.now();
      
      // Phát hiện khi người dùng bắt đầu nói
      if (avgVolume > silenceThreshold && !silenceDetectionRef.current.speaking) {
        silenceDetectionRef.current.speaking = true;
        silenceDetectionRef.current.silenceStart = null;
        addLog('Bắt đầu phát hiện giọng nói');
      } 
      // Phát hiện khi người dùng ngừng nói
      else if (avgVolume <= silenceThreshold && silenceDetectionRef.current.speaking) {
        if (!silenceDetectionRef.current.silenceStart) {
          silenceDetectionRef.current.silenceStart = now;
        } 
        // Nếu im lặng đủ lâu, coi như đã kết thúc một câu nói
        else if (now - silenceDetectionRef.current.silenceStart > silenceTime) {
          silenceDetectionRef.current.speaking = false;
          addLog('Phát hiện kết thúc câu nói');
          
          // Nếu có đủ dữ liệu, gửi đoạn âm thanh đã thu thập
          if (audioChunksRef.current.length > 0) {
            sendCollectedAudio();
          }
        }
      } 
      // Nếu tiếp tục nói, đặt lại thời gian im lặng
      else if (avgVolume > silenceThreshold) {
        silenceDetectionRef.current.silenceStart = null;
      }
      
      silenceDetectionRef.current.lastVolume = avgVolume;
      
      // Tiếp tục kiểm tra
      requestAnimationFrame(checkVolume);
    };
    
    checkVolume();
  };

  // Xử lý mỗi đoạn âm thanh được thu thập
  const processSpeechChunk = (chunk: Blob) => {
    if (silenceDetectionRef.current.speaking) {
      // Nếu đang nói, chỉ thu thập dữ liệu và chờ khoảng lặng
      return;
    }
    
    // Nếu không phải đang nói, gửi dữ liệu đã thu thập
    const blob = new Blob([chunk], { type: chunk.type });
    sendAudioToServer(blob);
  };

  // Send collected audio to server
  const sendCollectedAudio = () => {
    if (audioChunksRef.current.length === 0) return;
    
    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
    addLog(`Chuẩn bị gửi âm thanh đã thu thập: ${audioBlob.size} bytes`);
    sendAudioToServer(audioBlob);
    
    // Xóa các audio chunks đã gửi
    audioChunksRef.current = [];
  };

  // Send audio to server
  const sendAudioToServer = (audioBlob: Blob) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const reader = new FileReader();
      reader.onload = () => {
        if (reader.result && typeof reader.result === 'string') {
          const base64Audio = reader.result.split(',')[1];
          
          const message = {
            type: 'audio',
            data: base64Audio,
            format: 'webm', // Định dạng âm thanh của browser
            timestamp: new Date().toISOString(),
            expectResponseFormat: 'mp3' // Yêu cầu phản hồi dạng MP3
          };
          
          try {
            const jsonString = JSON.stringify(message);
            wsRef.current?.send(jsonString);
            addLog(`Đã gửi dữ liệu âm thanh (${base64Audio.length} ký tự)`);
          } catch (error) {
            if (error instanceof Error) {
              addLog('Lỗi khi gửi âm thanh: ' + error.message);
            }
          }
        }
      };
      
      reader.onerror = (e) => {
        if (e.target?.error?.message) {
          addLog('Lỗi đọc file: ' + e.target.error.message);
        } else {
          addLog('Lỗi đọc file không xác định');
        }
      };
      
      reader.readAsDataURL(audioBlob);
    } else {
      addLog('Không thể gửi âm thanh: WebSocket không được kết nối');
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
        URL.revokeObjectURL(audioUrl); // Giải phóng bộ nhớ
      };
      audioPlayerRef.current.onerror = (e) => {
        setIsPlaying(false);
        addLog('Lỗi phát âm thanh');
      };
      
      audioPlayerRef.current.play().catch(error => {
        if (error instanceof Error) {
          addLog('Lỗi phát âm thanh: ' + error.message);
        }
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

  // Connect to WebSocket when component mounts
  useEffect(() => {
    // Auto-connect on component mount
    connectWebSocket();
    
    // Clean up when component unmounts
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
            <div className="flex items-center px-3 py-1 rounded-full bg-red-100 text-red-800 text-sm">
              <Mic className="w-4 h-4 mr-1 animate-pulse" />
              <span>Đang ghi âm</span>
              {silenceDetectionRef.current?.speaking && (
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
                <Square className="mr-2 h-4 w-4" /> Dừng ghi âm
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
