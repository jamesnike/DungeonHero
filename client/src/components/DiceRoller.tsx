import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dices } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DiceRollerProps {
  onRoll?: (value: number) => void;
  className?: string;
}

type Vec3 = [number, number, number];
type Face = { indices: [number, number, number]; normal: Vec3; value: number };
type Quat = [number, number, number, number];

const GOLDEN = (1 + Math.sqrt(5)) / 2;
const FACE_VALUES = [20, 2, 12, 5, 17, 7, 19, 8, 16, 3, 11, 18, 6, 15, 9, 14, 10, 13, 4, 1];
const LIGHT_DIR: Vec3 = normalize([0.35, 0.75, 1.2]);
const CAMERA_DISTANCE = 3.5;
const IDENTITY: Quat = [0, 0, 0, 1];
const DIE_BASE_COLOR = '#FFA5A5';
const OUTLINE_COLOR = '#2B1F33';

export default function DiceRoller({ onRoll, className = '' }: DiceRollerProps) {
  const [currentValue, setCurrentValue] = useState<number>(20);
  const [showResultOverlay, setShowResultOverlay] = useState(false);
  const [resultValue, setResultValue] = useState<number>(20);
  const [isRolling, setIsRolling] = useState(false);
  const [rollHistory, setRollHistory] = useState<number[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const orientationRef = useRef<Quat>(IDENTITY);
  const rollStateRef = useRef<{
    start: number;
    duration: number;
    from: Quat;
    to: Quat;
    spinAxis: Vec3;
    spinMagnitude: number;
    faceIndex: number;
  } | null>(null);
  const pendingResultRef = useRef<number | null>(null);

  const vertices = useMemo(() => {
    const raw: Vec3[] = [
      [-1, GOLDEN, 0],
      [1, GOLDEN, 0],
      [-1, -GOLDEN, 0],
      [1, -GOLDEN, 0],
      [0, -1, GOLDEN],
      [0, 1, GOLDEN],
      [0, -1, -GOLDEN],
      [0, 1, -GOLDEN],
      [GOLDEN, 0, -1],
      [GOLDEN, 0, 1],
      [-GOLDEN, 0, -1],
      [-GOLDEN, 0, 1],
    ];
    return raw.map(normalize);
  }, []);

  const faces = useMemo<Face[]>(() => {
    const indices: [number, number, number][] = [
      [0, 11, 5],
      [0, 5, 1],
      [0, 1, 7],
      [0, 7, 10],
      [0, 10, 11],
      [1, 5, 9],
      [5, 11, 4],
      [11, 10, 2],
      [10, 7, 6],
      [7, 1, 8],
      [3, 9, 4],
      [3, 4, 2],
      [3, 2, 6],
      [3, 6, 8],
      [3, 8, 9],
      [4, 9, 5],
      [2, 4, 11],
      [6, 2, 10],
      [8, 6, 7],
      [9, 8, 1],
    ];

    return indices.map((tri, idx) => {
      const [a, b, c] = tri;
      const normal = normalize(cross(sub(vertices[b], vertices[a]), sub(vertices[c], vertices[a])));
      return { indices: tri, normal, value: FACE_VALUES[idx] };
    });
  }, [vertices]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const currentCanvas = canvasRef.current;
      if (!currentCanvas) return;
      
      const dpr = window.devicePixelRatio || 1;
      const { width, height } = currentCanvas.getBoundingClientRect();
      
      if (width === 0 || height === 0) return;

      currentCanvas.width = width * dpr;
      currentCanvas.height = height * dpr;
      // Removed ctx.setTransform to avoid double-scaling since renderDie uses physical pixels
    };

    resize();
    
    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(resize);
    });
    resizeObserver.observe(canvas);

    const draw = (timestamp: number) => {
      const rollState = rollStateRef.current;
      if (rollState) {
        const t = Math.min((timestamp - rollState.start) / rollState.duration, 1);
        const eased = easeOutCubic(t);
        const base = quatSlerp(rollState.from, rollState.to, eased);
        const extraSpin = quatFromAxisAngle(rollState.spinAxis, (1 - eased) * rollState.spinMagnitude);
        orientationRef.current = quatNormalize(quatMultiply(extraSpin, base));
        if (t >= 1) {
          rollStateRef.current = null;
          pendingResultRef.current = FACE_VALUES[rollState.faceIndex];
          setIsRolling(false);
        }
      }

      if (pendingResultRef.current !== null) {
        const value = pendingResultRef.current;
        pendingResultRef.current = null;
        setCurrentValue(value);
        setResultValue(value);
        setShowResultOverlay(true);
        setTimeout(() => setShowResultOverlay(false), 1500);
        setRollHistory((prev) => [value, ...prev.slice(0, 2)]);
        onRoll?.(value);
      }

      renderDie(ctx, canvas, vertices, faces, orientationRef.current);
      animationRef.current = requestAnimationFrame(draw);
    };

    animationRef.current = requestAnimationFrame(draw);

    return () => {
      resizeObserver.disconnect();
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [faces, onRoll, vertices]);

  const rollDice = () => {
    if (isRolling) return;
    setIsRolling(true);
    const targetFaceIndex = Math.floor(Math.random() * faces.length);
    const alignQuat = quaternionFromVectors(faces[targetFaceIndex].normal, [0, 0, 1]);
    const twistQuat = quatFromAxisAngle([0, 0, 1], Math.random() * Math.PI * 2);
    const spinAxis = normalize([Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5]);
    const spinMagnitude = Math.PI * (5 + Math.random() * 4);

    rollStateRef.current = {
      start: performance.now(),
      duration: 1400,
      from: orientationRef.current,
      to: quatNormalize(quatMultiply(twistQuat, alignQuat)),
      spinAxis,
      spinMagnitude,
      faceIndex: targetFaceIndex,
    };
  };

  return (
    <Card 
      className={cn(
        'relative h-full w-full cursor-pointer overflow-hidden border-2 border-card-border bg-gradient-to-br from-slate-950/70 via-slate-900/40 to-slate-900/20 transition-all duration-200 hover:scale-[1.01]',
        className
      )}
      onClick={rollDice}
      data-testid="dice-roller"
    >
      <div className="flex h-full w-full flex-col gap-2 p-3 relative">
        {showResultOverlay && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in zoom-in duration-300 rounded-lg">
            <span className="text-6xl font-bold text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.5)] animate-bounce">
              {resultValue}
            </span>
          </div>
        )}
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-200">
          <Dices className="w-4 h-4" />
          <span className="font-medium">Twenty-Sided Die</span>
        </div>
        <div className="relative flex flex-1 items-center justify-center">
          <canvas ref={canvasRef} className="dice-canvas" />
          <div className="pointer-events-none absolute inset-x-10 -bottom-2 h-6 rounded-full bg-black/45 blur-lg" />
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{isRolling ? 'Rolling...' : 'Tap to roll'}</span>
          <span className="font-mono text-sm text-white/80">Result: {currentValue}</span>
        </div>
        {rollHistory.length > 0 && (
          <div className="flex gap-1">
            {rollHistory.slice(0, 3).map((value, idx) => (
              <Badge 
                key={idx}
                variant="outline" 
                className={`text-xs px-2 py-0 ${idx === 0 ? 'bg-primary/20' : 'opacity-60'}`}
              >
                {value}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

function renderDie(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  vertices: Vec3[],
  faces: Face[],
  quat: Quat
) {
  const width = canvas.width;
  const height = canvas.height;
  
  if (width === 0 || height === 0) return;

  ctx.clearRect(0, 0, width, height);
  const scale = Math.min(width, height) / 2.0;
  const matrix = quatToMatrix(quat);
  const transformed = vertices.map((v) => rotateVec(matrix, v));

  const faceEntries = faces.map((face) => {
    const pts = face.indices.map((i) => transformed[i]);
    const centroid = divide(addVec(addVec(pts[0], pts[1]), pts[2]), 3);
    return { face, pts, centroid, depth: centroid[2] };
  });

  faceEntries.sort((a, b) => a.depth - b.depth);

  for (const entry of faceEntries) {
    const { pts, face, centroid } = entry;
    const projected = pts.map((p) => project(p, scale, width, height));
    const normal = rotateVec(matrix, face.normal);
    const lighting = Math.max(0.12, dot(normalize(normal), LIGHT_DIR));
    const color = shadeColor(DIE_BASE_COLOR, lighting);

    ctx.beginPath();
    ctx.moveTo(projected[0].x, projected[0].y);
    projected.slice(1).forEach((pt) => ctx.lineTo(pt.x, pt.y));
    ctx.closePath();

    ctx.fillStyle = color;
    ctx.fill();

    ctx.strokeStyle = OUTLINE_COLOR;
    ctx.lineWidth = 2;
    ctx.stroke();

    const center2D = project(centroid, scale, width, height);
    const isTopFace = face === faceEntries[faceEntries.length - 1].face;
    
    ctx.fillStyle = isTopFace ? 'rgba(255,255,255,1.0)' : 'rgba(255,255,255,0.85)';
    ctx.font = `bold ${Math.max(12, scale * (isTopFace ? 5.0 : 0.25))}px var(--font-mono)`;
    
    // Add glow effect for top face
    if (isTopFace) {
      ctx.shadowColor = 'rgba(255, 255, 255, 0.9)';
      ctx.shadowBlur = 20;
    } else {
      ctx.shadowBlur = 0;
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(face.value.toString(), center2D.x, center2D.y);
    ctx.shadowBlur = 0; // Reset shadow
  }
}

function project(point: Vec3, scale: number, width: number, height: number) {
  const perspective = CAMERA_DISTANCE / (CAMERA_DISTANCE - point[2]);
  return {
    x: width / 2 + point[0] * scale * perspective,
    y: height / 2 - point[1] * scale * perspective,
  };
}

function normalize(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function addVec(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function divide(v: Vec3, scalar: number): Vec3 {
  return [v[0] / scalar, v[1] / scalar, v[2] / scalar];
}

function quatFromAxisAngle(axis: Vec3, angle: number): Quat {
  const half = angle / 2;
  const s = Math.sin(half);
  const [x, y, z] = normalize(axis);
  return [x * s, y * s, z * s, Math.cos(half)];
}

function quatMultiply(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

function quatNormalize(q: Quat): Quat {
  const len = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / len, q[1] / len, q[2] / len, q[3] / len];
}

function quatToMatrix(q: Quat) {
  const [x, y, z, w] = q;
  const xx = x * x;
  const yy = y * y;
  const zz = z * z;
  const xy = x * y;
  const xz = x * z;
  const yz = y * z;
  const wx = w * x;
  const wy = w * y;
  const wz = w * z;

  return [
    1 - 2 * (yy + zz),
    2 * (xy - wz),
    2 * (xz + wy),
    2 * (xy + wz),
    1 - 2 * (xx + zz),
    2 * (yz - wx),
    2 * (xz - wy),
    2 * (yz + wx),
    1 - 2 * (xx + yy),
  ];
}

function rotateVec(matrix: number[], v: Vec3): Vec3 {
  return [
    matrix[0] * v[0] + matrix[1] * v[1] + matrix[2] * v[2],
    matrix[3] * v[0] + matrix[4] * v[1] + matrix[5] * v[2],
    matrix[6] * v[0] + matrix[7] * v[1] + matrix[8] * v[2],
  ];
}

function quatSlerp(a: Quat, b: Quat, t: number): Quat {
  let cosHalfTheta = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  if (Math.abs(cosHalfTheta) >= 1) {
    return a;
  }
  if (cosHalfTheta < 0) {
    b = [-b[0], -b[1], -b[2], -b[3]];
    cosHalfTheta = -cosHalfTheta;
  }
  const halfTheta = Math.acos(Math.min(1, Math.max(-1, cosHalfTheta)));
  const sinHalfTheta = Math.sqrt(1 - cosHalfTheta * cosHalfTheta) || 1;
  const ratioA = Math.sin((1 - t) * halfTheta) / sinHalfTheta;
  const ratioB = Math.sin(t * halfTheta) / sinHalfTheta;
  return [
    a[0] * ratioA + b[0] * ratioB,
    a[1] * ratioA + b[1] * ratioB,
    a[2] * ratioA + b[2] * ratioB,
    a[3] * ratioA + b[3] * ratioB,
  ];
}

function quaternionFromVectors(v0: Vec3, v1: Vec3): Quat {
  const from = normalize(v0);
  const to = normalize(v1);
  const d = dot(from, to);
  if (d > 0.9999) return IDENTITY;
  if (d < -0.9999) {
    const axis = normalize(Math.abs(from[0]) > 0.1 ? cross([0, 1, 0], from) : cross([1, 0, 0], from));
    return quatFromAxisAngle(axis, Math.PI);
  }
  const axis = normalize(cross(from, to));
  return quatNormalize([
    axis[0],
    axis[1],
    axis[2],
    1 + d,
  ]);
}

function shadeColor(hex: string, intensity: number) {
  const base = hex.replace('#', '');
  const num = parseInt(base, 16);
  const r = Math.min(255, Math.round(((num >> 16) & 0xff) * intensity + 20));
  const g = Math.min(255, Math.round(((num >> 8) & 0xff) * intensity + 20));
  const b = Math.min(255, Math.round((num & 0xff) * intensity + 20));
  return `rgb(${r}, ${g}, ${b})`;
}

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}
