
import React from 'react';
import { Atmosphere } from '../types';

interface Props {
  children: React.ReactNode;
  atmosphere?: Atmosphere;
}

export const TerminalLayout: React.FC<Props> = ({ children, atmosphere = Atmosphere.CALM }) => {
  return (
    <div className="min-h-screen bg-quiet-bg text-quiet-text font-mono relative overflow-hidden selection:bg-quiet-green selection:text-quiet-bg" style={{ backgroundColor: 'var(--quiet-bg-color, #050505)' }}>
      <div className="scanlines fixed inset-0 pointer-events-none z-50 opacity-50"></div>
      
      {/* CRT Vignette */}
      <div className="fixed inset-0 pointer-events-none z-40 bg-[radial-gradient(circle,rgba(0,0,0,0)_60%,rgba(0,0,0,0.6)_100%)]"></div>
      
      <div className="relative z-10 h-screen flex flex-col">
        {children}
      </div>
    </div>
  );
};
