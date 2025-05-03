
import { toast } from "@/hooks/use-toast";

interface SilenceDetection {
  lastVolume: number;
  silenceStart: number | null;
  speaking: boolean;
}

// Play audio from Blob (for MP3)
export const playAudioFromBlob = (
  audioBlob: Blob,
  audioPlayerRef: React.MutableRefObject<HTMLAudioElement | null>,
  setIsPlaying: (isPlaying: boolean) => void,
  addLog: (message: string) => void
) => {
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

// Setup audio recording
export const setupAudioRecording = async (
  streamRef: React.MutableRefObject<MediaStream | null>,
  audioContextRef: React.MutableRefObject<AudioContext | null>,
  analyserRef: React.MutableRefObject<AnalyserNode | null>,
  mediaRecorderRef: React.MutableRefObject<MediaRecorder | null>,
  audioChunksRef: React.MutableRefObject<Blob[]>,
  silenceDetectionRef: React.MutableRefObject<SilenceDetection>,
  addLog: (message: string) => void,
  processSpeechChunk: (data: Blob) => void,
  startVolumeDetection: () => void
): Promise<boolean> => {
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

// Process speech chunks
export const createProcessSpeechChunk = (
  silenceDetectionRef: React.MutableRefObject<SilenceDetection>,
  sendAudioToServer: (audioBlob: Blob) => void
) => {
  return (chunk: Blob) => {
    if (silenceDetectionRef.current.speaking) {
      // Nếu đang nói, chỉ thu thập dữ liệu và chờ khoảng lặng
      return;
    }
    
    // Nếu không phải đang nói, gửi dữ liệu đã thu thập
    const blob = new Blob([chunk], { type: chunk.type });
    sendAudioToServer(blob);
  };
};

// Send collected audio to server
export const createSendCollectedAudio = (
  audioChunksRef: React.MutableRefObject<Blob[]>,
  addLog: (message: string) => void,
  sendAudioToServer: (audioBlob: Blob) => void
) => {
  return () => {
    if (audioChunksRef.current.length === 0) return;
    
    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
    addLog(`Chuẩn bị gửi âm thanh đã thu thập: ${audioBlob.size} bytes`);
    sendAudioToServer(audioBlob);
    
    // Xóa các audio chunks đã gửi
    audioChunksRef.current = [];
  };
};
