import React, { useEffect, useRef } from 'react';

interface AudioSpectrumProps {
  analyser: AnalyserNode | null;
  isActive: boolean;
  color?: string;
  isInterrupted?: boolean;
}

export const AudioSpectrum: React.FC<AudioSpectrumProps> = ({
  analyser,
  isActive,
  color = '#70a4fc',
  isInterrupted = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const dataArray = new Uint8Array(64);

    const render = () => {
      const width = canvas.width;
      const height = canvas.height;
      const centerY = height / 2;

      ctx.clearRect(0, 0, width, height);

      if (analyser && isActive) {
        analyser.getByteFrequencyData(dataArray);
      } else {
        dataArray.fill(0);
      }

      const barCount = 40;
      const barWidth = width / barCount - 2;

      for (let i = 0; i < barCount; i++) {
        const val = isActive ? (dataArray[Math.floor((i / barCount) * dataArray.length)] || 0) / 255 : 0;
        const barHeight = Math.max(3, val * (height * 0.85));

        const x = i * (barWidth + 2);
        const y = centerY - barHeight / 2;

        ctx.fillStyle = isInterrupted ? '#ef4444' : color;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, 2);
        ctx.fill();
      }

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [analyser, isActive, color, isInterrupted]);

  return (
    <canvas
      ref={canvasRef}
      width={400}
      height={56}
      className="w-full h-14 rounded-lg bg-[#18191a] border border-[#282a2c]"
    />
  );
};
