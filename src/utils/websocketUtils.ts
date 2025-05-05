
import { toast } from "@/hooks/use-toast";

// Create a WebSocket connection
export const connectWebSocket = (
  wsRef: React.MutableRefObject<WebSocket | null>,
  setIsConnected: React.Dispatch<React.SetStateAction<boolean>>,
  setIsRecording: React.Dispatch<React.SetStateAction<boolean>>,
  addLog: (message: string) => void,
  handleWebSocketMessage: (event: MessageEvent) => void
) => {
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
    
    wsRef.current.onmessage = handleWebSocketMessage;
    
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

// Send audio to server via WebSocket
export const createSendAudioToServer = (
  wsRef: React.MutableRefObject<WebSocket | null>,
  addLog: (message: string) => void
) => {
  return (audioBlob: Blob) => {
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
            expectResponseFormat: 'mp3', // Yêu cầu phản hồi dạng MP3
            requestId: crypto.randomUUID() // Thêm requestId để theo dõi yêu cầu
          };
          
          try {
            const jsonString = JSON.stringify(message);
            wsRef.current?.send(jsonString);
            addLog(`Đã gửi dữ liệu âm thanh (${base64Audio.length} ký tự) với requestId: ${message.requestId}`);
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
};

// Process received audio from server
export const playReceivedAudio = (
  base64Audio: string, 
  format: string,
  audioPlayerRef: React.MutableRefObject<HTMLAudioElement | null>,
  setIsPlaying: React.Dispatch<React.SetStateAction<boolean>>,
  addLog: (message: string) => void,
  onPlaybackEnd?: () => void
) => {
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
