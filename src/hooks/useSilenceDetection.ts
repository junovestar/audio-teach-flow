
import { useRef, useEffect } from 'react';

interface SilenceDetection {
  lastVolume: number;
  silenceStart: number | null;
  speaking: boolean;
  sentenceDetected: boolean;
}

export function useSilenceDetection(
  isRecording: boolean,
  analyserRef: React.RefObject<AnalyserNode | null>,
  sendCollectedAudio: () => void,
  addLog: (message: string) => void
) {
  const silenceDetectionRef = useRef<SilenceDetection>({
    lastVolume: 0,
    silenceStart: null,
    speaking: false,
    sentenceDetected: false
  });

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
        silenceDetectionRef.current.sentenceDetected = false;
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
          silenceDetectionRef.current.sentenceDetected = true;
          addLog('Phát hiện kết thúc câu nói');
          
          // Gửi các đoạn âm thanh đã thu thập
          sendCollectedAudio();
          
          // Reset silenceStart để sẵn sàng cho câu tiếp theo
          silenceDetectionRef.current.silenceStart = null;
        }
      } 
      // Nếu tiếp tục nói, đặt lại thời gian im lặng
      else if (avgVolume > silenceThreshold) {
        silenceDetectionRef.current.silenceStart = null;
      }
      
      silenceDetectionRef.current.lastVolume = avgVolume;
      
      // Tiếp tục kiểm tra - realtime liên tục
      if (isRecording) {
        requestAnimationFrame(checkVolume);
      }
    };
    
    checkVolume();
  };

  // Khởi động phát hiện khi bắt đầu ghi âm
  useEffect(() => {
    if (isRecording) {
      startVolumeDetection();
    }
    
    return () => {
      // Không cần dọn dẹp, sẽ tự kết thúc khi isRecording = false
    };
  }, [isRecording]);

  return { silenceDetectionRef, startVolumeDetection };
}
