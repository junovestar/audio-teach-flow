
import { toast } from "@/hooks/use-toast";

// Create a WebSocket connection with auto-reconnect ability
export const connectWebSocket = (
  wsRef: React.MutableRefObject<WebSocket | null>,
  setIsConnected: React.Dispatch<React.SetStateAction<boolean>>,
  setIsRecording: React.Dispatch<React.SetStateAction<boolean>>,
  addLog: (message: string) => void,
  handleWebSocketMessage: (event: MessageEvent) => void
) => {
  try {
    // Close existing connection if open
    if (wsRef.current) {
      if (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING) {
        wsRef.current.close();
        addLog('Đóng kết nối WebSocket cũ để tạo kết nối mới');
      }
    }
    
    wsRef.current = new WebSocket('wss://ws.thanhpn.online:3001');
    addLog('Đang thử kết nối đến WebSocket server...');
    
    wsRef.current.onopen = () => {
      setIsConnected(true);
      addLog('Kết nối thành công với WebSocket server');
      toast({
        title: "Kết nối thành công",
        description: "Đã kết nối với WebSocket server",
      });
    };
    
    wsRef.current.onclose = (event) => {
      setIsConnected(false);
      setIsRecording(false);
      addLog(`Mất kết nối với WebSocket server (Code: ${event.code})`);
      toast({
        title: "Mất kết nối",
        description: "Mất kết nối với WebSocket server",
        variant: "destructive",
      });
      
      // Auto reconnect after 3 seconds
      setTimeout(() => {
        addLog('Đang thử kết nối lại tự động...');
        connectWebSocket(wsRef, setIsConnected, setIsRecording, addLog, handleWebSocketMessage);
      }, 3000);
    };
    
    wsRef.current.onmessage = handleWebSocketMessage;
    
    wsRef.current.onerror = (error) => {
      addLog('Lỗi WebSocket: ' + JSON.stringify(error));
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
          
          // Thêm thông tin về MIME type của blob để debug
          addLog(`Gửi audio với MIME type: ${audioBlob.type}, kích thước: ${audioBlob.size} bytes`);
          
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
      const state = wsRef.current ? wsRef.current.readyState : 'null';
      addLog(`Không thể gửi âm thanh: WebSocket không được kết nối (state: ${state})`);
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
    
    // Đảm bảo đúng format MIME
    let mimeType = `audio/${format}`;
    // Đảm bảo format MP3 luôn được sử dụng chính xác
    if (format === 'mp3') {
      mimeType = 'audio/mpeg';
    }
    
    const blob = new Blob(byteArrays, { type: mimeType });
    addLog(`Đã tạo audio blob với MIME type: ${mimeType}, kích thước: ${blob.size} bytes`);
    
    if (blob.size <= 0) {
      addLog('Cảnh báo: Blob âm thanh có kích thước 0, không thể phát');
      if (onPlaybackEnd) {
        onPlaybackEnd();
      }
      return;
    }
    
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
    audioPlayerRef.current.onerror = (e) => {
      const error = e as ErrorEvent;
      setIsPlaying(false);
      addLog(`Lỗi phát âm thanh: ${error.message || (audioPlayerRef.current?.error?.message) || 'Không rõ lỗi'}`);
      URL.revokeObjectURL(audioUrl);
      
      // Thử lại với MIME type khác
      if (mimeType !== 'audio/mpeg') {
        addLog('Thử lại với MIME type audio/mpeg');
        const mpegBlob = new Blob(byteArrays, { type: 'audio/mpeg' });
        const newAudioUrl = URL.createObjectURL(mpegBlob);
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
    };
    
    audioPlayerRef.current.play().catch(error => {
      if (error instanceof Error) {
        addLog('Lỗi phát âm thanh: ' + error.message);
        
        // Thử lại với MIME type khác
        if (mimeType !== 'audio/mpeg') {
          addLog('Thử lại với MIME type audio/mpeg');
          const mpegBlob = new Blob(byteArrays, { type: 'audio/mpeg' });
          const newAudioUrl = URL.createObjectURL(mpegBlob);
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
