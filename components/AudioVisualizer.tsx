import React, { useEffect, useRef } from 'react';
import { AudioVisualizerProps } from '../types';

const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ analyser, isListening }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;

    const render = () => {
      // Set canvas size
      canvas.width = canvas.clientWidth * window.devicePixelRatio;
      canvas.height = canvas.clientHeight * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;

      ctx.clearRect(0, 0, width, height);

      if (analyser && isListening) {
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteFrequencyData(dataArray);

        // Visualizer settings
        const barWidth = (width / bufferLength) * 2.5;
        let barHeight;
        let x = 0;

        // Draw bars
        for (let i = 0; i < bufferLength; i++) {
          barHeight = (dataArray[i] / 255) * height;
          
          // Gradient for the bars
          const gradient = ctx.createLinearGradient(0, height, 0, height - barHeight);
          gradient.addColorStop(0, '#3b82f6'); // Blue
          gradient.addColorStop(1, '#8b5cf6'); // Purple

          ctx.fillStyle = gradient;
          
          // Rounded bars
          ctx.beginPath();
          ctx.roundRect(x, height - barHeight, barWidth, barHeight, 4);
          ctx.fill();

          x += barWidth + 2;
        }
      } else {
        // Idle animation
        ctx.strokeStyle = 'rgba(59, 130, 246, 0.2)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        
        for (let x = 0; x < width; x++) {
          const y = height / 2 + Math.sin(x * 0.05 + Date.now() * 0.002) * 10;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      animationId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [analyser, isListening]);

  return (
    <canvas 
      ref={canvasRef} 
      className="w-full h-full rounded-xl bg-slate-900/50 backdrop-blur-sm border border-slate-800 shadow-inner"
    />
  );
};

export default AudioVisualizer;
