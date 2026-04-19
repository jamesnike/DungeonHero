import { memo } from 'react';
import { Sword } from 'lucide-react';

interface SwordVector {
  left: number;
  top: number;
  angle: number;
  length: number;
}

interface SwordOverlayProps {
  show: boolean;
  swordVectors: Record<string, SwordVector>;
  activeSwordMonsterId: string | null;
}

function SwordOverlayInner({ show, swordVectors, activeSwordMonsterId }: SwordOverlayProps) {
  if (!show) return null;

  return (
    <>
      {Object.entries(swordVectors).map(([monsterId, vector]) => {
        const isActiveSword = activeSwordMonsterId === monsterId;
        return (
          <div key={`sword-${monsterId}`} className="pointer-events-none absolute inset-0 z-30">
            <div
              className={`absolute flex items-center ${isActiveSword ? 'opacity-100 animate-pulse' : 'opacity-30'}`}
              style={{
                left: vector.left,
                top: vector.top,
                width: vector.length,
                transform: `translate(-50%, -50%) rotate(${vector.angle}deg)`,
                transformOrigin: 'center',
              }}
            >
              <div
                className={`w-full h-1 bg-gradient-to-r from-transparent rounded-full blur-[1px] ${
                  isActiveSword
                    ? 'via-destructive/70 to-destructive'
                    : 'via-destructive/20 to-destructive/20'
                }`}
              />
              <Sword
                className={`ml-2 w-6 h-6 transform rotate-90 ${
                  isActiveSword
                    ? 'text-destructive drop-shadow-[0_0_14px_rgba(239,68,68,0.9)]'
                    : 'text-destructive/40'
                }`}
              />
            </div>
          </div>
        );
      })}
    </>
  );
}

export default memo(SwordOverlayInner);
