
import { useEffect, useRef } from 'react';

export function useAudioVisualization(
  canvasRef: React.RefObject<HTMLCanvasElement>,
  analyserRef: React.RefObject<AnalyserNode | null>,
  isRecording: boolean
) {
  const animationFrameRef = useRef<number | null>(null);
  
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
        canvasRef.current.height = canvasRef.current.height;
      }
    };
    
    handleResize();
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Start or stop visualization based on recording state
  useEffect(() => {
    if (isRecording) {
      startVisualizing();
    } else {
      stopVisualizing();
    }
    
    return () => {
      stopVisualizing();
    };
  }, [isRecording]);

  return { startVisualizing, stopVisualizing };
}
