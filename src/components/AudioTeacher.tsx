
import React, { useState, useRef, useEffect } from 'react';
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Mic, Square, Wifi, WifiOff, Volume2 } from 'lucide-react';
import { cn } from "@/lib/utils";
import AudioVisualizer from './AudioVisualizer';
import StatusIndicators from './StatusIndicators';
import AudioControls from './AudioControls';
import LogDisplay from './LogDisplay';

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
      
      wsRef.current.onerror = () => {
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
      audioPlayerRef.current.onerror = () => {
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
      // Kiểm tra hỗ trợ MediaRecorder và định dạng audio/webm
      if (!window.MediaRecorder) {
        throw new Error("Trình duyệt không hỗ trợ MediaRecorder API");
      }
      
      // Kiểm tra các định dạng được hỗ trợ
      let mimeType = '';
      const supportedMimeTypes = [
        'audio/webm;codecs=opus', 
        'audio/webm', 
        'audio/webm;codecs=vorbis'
      ];
      
      for (const type of supportedMimeTypes) {
        if (MediaRecorder.isTypeSupported(type)) {
          mimeType = type;
          addLog(`Sử dụng định dạng: ${type}`);
          break;
        }
      }
      
      if (!mimeType) {
        addLog('Cảnh báo: Không có định dạng webm nào được hỗ trợ. Sử dụng định dạng mặc định.');
      }
      
      // Yêu cầu quyền truy cập microphone với giá trị echoCancellation
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      
      streamRef.current = stream;
      
      // Set up audio context và analyser
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;
      
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyserRef.current = analyser;
      
      analyser.fftSize = 2048;
      source.connect(analyser);
      
      // Thiết lập MediaRecorder với MIME type phù hợp
      const options: MediaRecorderOptions = { 
        audioBitsPerSecond: 128000 
      };
      
      if (mimeType) {
        options.mimeType = mimeType;
      }
      
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
          addLog(`Đã thu thập đoạn âm thanh: ${event.data.size} bytes - Type: ${event.data.type}`);
          
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
    // Đảm bảo rằng chunk vẫn là định dạng .webm
    const blob = new Blob([chunk], { type: chunk.type || 'audio/webm' });
    sendAudioToServer(blob);
  };

  // Send collected audio to server
  const sendCollectedAudio = () => {
    if (audioChunksRef.current.length === 0) return;
    
    // Đảm bảo rằng type luôn là audio/webm
    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
    addLog(`Chuẩn bị gửi âm thanh đã thu thập: ${audioBlob.size} bytes - Type: ${audioBlob.type}`);
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
            format: 'webm', // Luôn chỉ định định dạng là webm
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
      audioPlayerRef.current.onerror = () => {
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
          connectWebSocket={connectWebSocket}
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
