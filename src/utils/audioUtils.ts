
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
    // Ghi log thông tin về blob để debug
    addLog(`Xử lý audio blob: type=${audioBlob.type || 'unknown'}, size=${audioBlob.size} bytes`);
    
    // Kiểm tra kích thước blob
    if (audioBlob.size <= 0) {
      addLog('Cảnh báo: Blob âm thanh có kích thước 0, không thể phát');
      if (onPlaybackEnd) {
        onPlaybackEnd();
      }
      return;
    }
    
    // Nếu không có MIME type hoặc không hợp lệ, thử dùng audio/mpeg
    let processedBlob = audioBlob;
    if (!audioBlob.type || audioBlob.type === 'unknown') {
      processedBlob = new Blob([audioBlob], { type: 'audio/mpeg' });
      addLog('Đã gán MIME type audio/mpeg cho blob không có type');
    }
    
    const audioUrl = URL.createObjectURL(processedBlob);
    
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
    audioPlayerRef.current.onerror = (e) => {
      const error = e as ErrorEvent;
      setIsPlaying(false);
      
      // Thử phát lại với một MIME type khác nếu lỗi
      const errorMsg = error.message || audioPlayerRef.current?.error?.message || 'Không rõ lỗi';
      addLog(`Lỗi phát âm thanh: ${errorMsg}`);
      
      // Giải phóng URL trước khi thử lại
      URL.revokeObjectURL(audioUrl);
      
      // Có thể thử lại với một MIME type khác
      if (processedBlob.type !== 'audio/mpeg' && processedBlob.type !== audioBlob.type) {
        addLog('Thử lại phát âm thanh với MIME type khác: audio/mpeg');
        const mpegBlob = new Blob([audioBlob], { type: 'audio/mpeg' });
        const newAudioUrl = URL.createObjectURL(mpegBlob);
        
        // Tạo player mới để tránh các vấn đề với player cũ
        const newPlayer = new Audio(newAudioUrl);
        newPlayer.onplay = () => {
          setIsPlaying(true);
          addLog('Đang phát âm thanh với MIME type mới (audio/mpeg)');
        };
        newPlayer.onended = () => {
          setIsPlaying(false);
          addLog('Kết thúc phát âm thanh (MIME type mới)');
          URL.revokeObjectURL(newAudioUrl);
          if (onPlaybackEnd) onPlaybackEnd();
        };
        newPlayer.onerror = () => {
          setIsPlaying(false);
          addLog('Vẫn không thể phát âm thanh sau khi thử MIME type khác');
          URL.revokeObjectURL(newAudioUrl);
          if (onPlaybackEnd) onPlaybackEnd();
        };
        
        audioPlayerRef.current = newPlayer;
        newPlayer.play().catch(finalErr => {
          addLog(`Lỗi cuối cùng: ${finalErr.message}`);
          if (onPlaybackEnd) onPlaybackEnd();
        });
        return;
      }
      
      // Trong trường hợp lỗi, cũng gọi callback để đảm bảo quay lại ghi âm
      if (onPlaybackEnd) {
        onPlaybackEnd();
      }
    };
    
    audioPlayerRef.current.play().catch(error => {
      if (error instanceof Error) {
        addLog('Lỗi phát âm thanh: ' + error.message);
        URL.revokeObjectURL(audioUrl); // Giải phóng bộ nhớ
        
        // Thử phát lại với một MIME type khác
        if (processedBlob.type !== 'audio/mpeg') {
          addLog('Thử lại phát âm thanh với MIME type: audio/mpeg');
          const mpegBlob = new Blob([audioBlob], { type: 'audio/mpeg' });
          const newAudioUrl = URL.createObjectURL(mpegBlob);
          
          // Cập nhật player hiện tại
          audioPlayerRef.current!.src = newAudioUrl;
          audioPlayerRef.current!.play().catch(err => {
            addLog('Vẫn không thể phát âm thanh: ' + err.message);
            URL.revokeObjectURL(newAudioUrl);
            if (onPlaybackEnd) onPlaybackEnd();
          });
          return;
        }
        
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
    
    // Nếu đã có stream, hãy dừng các track trước
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop();
        addLog('Đã dừng track âm thanh cũ');
      });
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
    // Nếu đã tồn tại một audioContext, hãy đóng nó trước
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        await audioContextRef.current.close();
        addLog('Đã đóng AudioContext cũ');
      } catch (err) {
        addLog('Lỗi khi đóng AudioContext cũ: ' + (err instanceof Error ? err.message : 'Không rõ lỗi'));
      }
    }
    
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
  sendAudioToServer: (audioBlob: Blob) => void,
  onSendStart?: () => void
) => {
  return () => {
    if (audioChunksRef.current.length === 0) {
      addLog('Không có đoạn âm thanh nào để gửi');
      return;
    }
    
    // Tạo blob từ các phần audio đã thu thập
    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
    addLog(`Chuẩn bị gửi câu nói đã thu thập: ${audioBlob.size} bytes`);
    
    if (audioBlob.size <= 0) {
      addLog('Không gửi vì kích thước blob = 0');
      audioChunksRef.current = [];
      return;
    }
    
    // Kích hoạt callback khi bắt đầu gửi
    if (onSendStart) {
      onSendStart();
    }
    
    // Gửi audio đến server
    sendAudioToServer(audioBlob);
    
    // Xóa các audio chunks đã gửi để chuẩn bị cho câu tiếp theo
    addLog('Đã xóa audio chunks cũ sau khi gửi');
    audioChunksRef.current = [];
  };
};
