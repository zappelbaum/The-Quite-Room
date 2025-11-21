import React, { useState, useEffect } from 'react';

interface Props {
  text: string;
  speed?: number;
  onComplete?: () => void;
  className?: string;
}

export const Typewriter: React.FC<Props> = ({ text, speed = 30, onComplete, className = '' }) => {
  const [displayedLength, setDisplayedLength] = useState(0);
  
  useEffect(() => {
    // Reset only if text actually changes identity (new message)
    setDisplayedLength(0);
    
    if (!text) return;

    const timer = setInterval(() => {
      setDisplayedLength((prev) => {
        if (prev >= text.length) {
          clearInterval(timer);
          if (onComplete) onComplete();
          return prev;
        }
        return prev + 1;
      });
    }, speed);

    return () => clearInterval(timer);
  }, [text, speed, onComplete]);

  // Using slice ensures we always render a valid substring of the source text,
  // preventing duplicate characters, missing spaces, or malformed concatenation.
  return <span className={`whitespace-pre-wrap ${className}`}>{text.slice(0, displayedLength)}</span>;
};