
import { toast } from "@/hooks/use-toast";

interface SilenceDetection {
  lastVolume: number;
  silenceStart: number | null;
  speaking: boolean;
  sentenceDetected: boolean;
}

// Play audio from Blob (for MP3)
export const playAudioFromBlob = (
  audioBlob: Blob,
  audioPlayerRef: React.MutableRefObject<HTMLAudioElement | null>,
  setIsPlaying: (isPlaying: boolean) => void,
  addLog: (message: string) => void,
  onPlaybackEnd?: () => void
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
      
      // Gọi callback khi kết thúc phát âm thanh
      if (onPlaybackEnd) {
        onPlaybackEnd();
      }
    };
    audioPlayerRef.current.onerror = () => {
      setIsPlaying(false);
      addLog('Lỗi phát âm thanh');
      
      // Trong trường hợp lỗi, cũng gọi callback để đảm bảo quay lại ghi âm
      if (onPlaybackEnd) {
        onPlaybackEnd();
      }
    };
    
    audioPlayerRef.current.play().catch(error => {
      if (error instanceof Error) {
        addLog('Lỗi phát âm thanh: ' + error.message);
        // Trong trường hợp lỗi, cũng gọi callback để đảm bảo quay lại ghi âm
        if (onPlaybackEnd) {
          onPlaybackEnd();
        }
      }
    });
  } catch (error) {
    if (error instanceof Error) {
      addLog('Lỗi xử lý âm thanh: ' + error.message);
      // Trong trường hợp lỗi, cũng gọi callback để đảm bảo quay lại ghi âm
      if (onPlaybackEnd) {
        onPlaybackEnd();
      }
    }
  }
};

// Setup audio recording với phát hiện realtime
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
    
    // Cài đặt xử lý dữ liệu âm thanh realtime
    mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        audioChunksRef.current.push(event.data);
        addLog(`Đã thu thập đoạn âm thanh: ${event.data.size} bytes - Type: ${event.data.type}`);
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

// Process speech chunks - phát hiện kết thúc câu nói
export const createProcessSpeechChunk = (
  silenceDetectionRef: React.MutableRefObject<SilenceDetection>,
  sendAudioToServer: (audioBlob: Blob) => void
) => {
  return (chunk: Blob) => {
    // Trong chế độ realtime, chúng ta gửi dữ liệu khi phát hiện kết thúc câu
    // Dữ liệu sẽ được thu thập và xử lý trong sendCollectedAudio
    return;
  };
};

// Send collected audio to server - khi phát hiện kết thúc một câu
export const createSendCollectedAudio = (
  audioChunksRef: React.MutableRefObject<Blob[]>,
  addLog: (message: string) => void,
  sendAudioToServer: (audioBlob: Blob) => void
) => {
  return () => {
    if (audioChunksRef.current.length === 0) return;
    
    // Tạo blob từ các phần audio đã thu thập
    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
    addLog(`Chuẩn bị gửi câu nói đã thu thập: ${audioBlob.size} bytes`);
    sendAudioToServer(audioBlob);
    
    // Xóa các audio chunks đã gửi để chuẩn bị cho câu tiếp theo
    audioChunksRef.current = [];
  };
};
