import React, { useEffect, useRef } from 'react';
import { utils, stagger, createScope, createTimeline } from 'animejs';

interface AnimeButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
}

export const AnimeButton: React.FC<AnimeButtonProps> = ({ children, className = '', onClick, ...props }) => {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const scopeRef = useRef<any>(null);

  useEffect(() => {
    if (!buttonRef.current) return;

    const scopeConstructor = (scope: any) => {
      const circles = utils.$('.circle', buttonRef.current as HTMLElement);
      if (!circles || circles.length === 0) return;
      
      if (scope.i === undefined || scope.i > circles.length - 1) scope.i = 0;
      const i = scope.i++;
      
      utils.set(circles, {
        opacity: stagger([1, .25], { from: i, ease: 'out(3)' }),
      });
      
      createTimeline()
        .add(circles, {
          scale: [{ to: [.5, 1], duration: 250 }, { to: .5, duration: 750 }],
          duration: 750,
          loop: true,
        }, stagger(50, { from: i }))
        .seek(750);
    };

    try {
      scopeRef.current = createScope({ root: buttonRef.current }).add(scopeConstructor);
    } catch (e) {
      console.error('AnimeJS scope error:', e);
    }

    return () => {
      scopeRef.current = null;
    };
  }, []);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (scopeRef.current && scopeRef.current.refresh) {
      try {
        scopeRef.current.refresh();
      } catch (err) {
        console.error(err);
      }
    }
    if (onClick) {
      onClick(e);
    }
  };

  return (
    <button
      ref={buttonRef}
      onClick={handleClick}
      className={className}
      style={{ position: 'relative', overflow: 'hidden' }}
      {...props}
    >
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        pointerEvents: 'none', opacity: 0.15, zIndex: 0, gap: '8px'
      }}>
        <div className="circle" style={{ width: '16px', height: '16px', borderRadius: '50%', backgroundColor: 'white' }}></div>
        <div className="circle" style={{ width: '16px', height: '16px', borderRadius: '50%', backgroundColor: 'white' }}></div>
        <div className="circle" style={{ width: '16px', height: '16px', borderRadius: '50%', backgroundColor: 'white' }}></div>
        <div className="circle" style={{ width: '16px', height: '16px', borderRadius: '50%', backgroundColor: 'white' }}></div>
        <div className="circle" style={{ width: '16px', height: '16px', borderRadius: '50%', backgroundColor: 'white' }}></div>
      </div>
      <span style={{ position: 'relative', zIndex: 10 }}>{children}</span>
    </button>
  );
};
