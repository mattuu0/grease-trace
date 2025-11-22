import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { MousePointer2, Square, Circle, Minus, Pencil, Eraser, Image, Trash2, Zap, Type, Lock, Unlock, LogOut } from 'lucide-react';

// 正規化座標 (0.0 - 1.0)
export interface Point {
    x: number;
    y: number;
}

export interface ObjectBase {
    id: string;
    type: string;
    color: string;
    lineWidth: number;
}

export interface PenObject extends ObjectBase {
    type: 'pen';
    points: Point[];
}

export interface ShapeObject extends ObjectBase {
    x: number;
    y: number;
}

export interface RectangleObject extends ShapeObject {
    type: 'rectangle';
    width: number;
    height: number;
}

export interface CircleObject extends ShapeObject {
    type: 'circle';
    rx: number;
    ry: number;
}

export interface LineObject extends ObjectBase {
    type: 'line';
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}

export interface ImageObject extends ShapeObject {
    type: 'image';
    src: string;
    width: number;
    height: number;
}

export interface TextObject extends ShapeObject {
    type: 'text';
    text: string;
    fontSize: number;
    width: number;
    height: number;
}

export type GreaseTraceObject = PenObject | RectangleObject | CircleObject | LineObject | ImageObject | TextObject;

type Tool = 'select' | 'rectangle' | 'circle' | 'line' | 'pen' | 'eraser' | 'laser' | 'text';
type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export interface GreaseTraceSenderProps {
    videoRef: React.RefObject<HTMLVideoElement | null>;
    initialToolLockState?: boolean;
    onDisconnectCallback?: () => void;
    onUpdateCallback?: (jsonString: string) => void;
}

const BLUE_OUTLINE_WIDTH = 5;
const BLUE_OUTLINE_COLOR = '#7dd3fc';
const HANDLE_SIZE = 10;
const OBJECT_TYPES = {
    PEN: 'pen',
    RECTANGLE: 'rectangle',
    CIRCLE: 'circle',
    LINE: 'line',
    IMAGE: 'image',
    TEXT: 'text'
} as const;
const LINE_WIDTH_OPTIONS = [2, 5, 10, 20];

const generateId = (): string => crypto.randomUUID();

// シンプルな正規化・非正規化（キャンバス全体基準）
const normalize = (value: number, dimension: number): number => value / dimension;
const denormalize = (value: number, dimension: number): number => value * dimension;

const isText = (o: GreaseTraceObject): o is TextObject => o.type === OBJECT_TYPES.TEXT;
const isShape = (o: GreaseTraceObject): o is RectangleObject | CircleObject | ImageObject | TextObject =>
    o.type === OBJECT_TYPES.RECTANGLE || o.type === OBJECT_TYPES.CIRCLE || o.type === OBJECT_TYPES.IMAGE || o.type === OBJECT_TYPES.TEXT;
const isResizable = (o: GreaseTraceObject): o is RectangleObject | CircleObject | ImageObject | TextObject => isShape(o);

// オブジェクトの絶対座標での境界ボックスを計算
interface AbsoluteBounds { x: number, y: number, width: number, height: number }
const getShapeBounds = (obj: ShapeObject | TextObject, canvasSize: { width: number; height: number }): AbsoluteBounds => {
    if (obj.type === OBJECT_TYPES.TEXT || obj.type === OBJECT_TYPES.RECTANGLE || obj.type === OBJECT_TYPES.IMAGE) {
        const rectObj = obj as RectangleObject | ImageObject | TextObject;
        return {
            x: denormalize(rectObj.x, canvasSize.width),
            y: denormalize(rectObj.y, canvasSize.height),
            width: denormalize(rectObj.width, canvasSize.width),
            height: denormalize(rectObj.height, canvasSize.height)
        };
    }
    if (obj.type === OBJECT_TYPES.CIRCLE) {
        const circleObj = obj as CircleObject;
        const cx = denormalize(circleObj.x, canvasSize.width);
        const cy = denormalize(circleObj.y, canvasSize.height);
        const rx = denormalize(circleObj.rx, canvasSize.width);
        const ry = denormalize(circleObj.ry, canvasSize.height);
        return { x: cx - rx, y: cy - ry, width: rx * 2, height: ry * 2 };
    }
    return { x: 0, y: 0, width: 0, height: 0 };
};

// リサイズハンドルがクリックされたかチェック
const checkHandleHit = (obj: GreaseTraceObject, selectedId: string | null, absX: number, absY: number, canvasSize: { width: number, height: number }): { id: string, handle: ResizeHandle } | null => {
    if (obj.id !== selectedId || !isResizable(obj)) return null;

    const bounds = getShapeBounds(obj, canvasSize);
    const { x, y, width, height } = bounds;

    const handles: { x: number, y: number, handle: ResizeHandle }[] = [
        { x: x, y: y, handle: 'nw' },
        { x: x + width / 2, y: y, handle: 'n' },
        { x: x + width, y: y, handle: 'ne' },
        { x: x + width, y: y + height / 2, handle: 'e' },
        { x: x + width, y: y + height, handle: 'se' },
        { x: x + width / 2, y: y + height, handle: 's' },
        { x: x, y: y + height, handle: 'sw' },
        { x: x, y: y + height / 2, handle: 'w' },
    ];

    for (const h of handles) {
        if (absX >= h.x - HANDLE_SIZE && absX <= h.x + HANDLE_SIZE &&
            absY >= h.y - HANDLE_SIZE && absY <= h.y + HANDLE_SIZE) {
            return { id: obj.id, handle: h.handle };
        }
    }
    return null;
};

// リサイズ後のオブジェクト状態を計算
const calculateResizedObject = (startObj: GreaseTraceObject, dx: number, dy: number, handle: ResizeHandle, canvasSize: { width: number, height: number }): GreaseTraceObject | null => {
    if (!isResizable(startObj)) return null;

    const startBounds = getShapeBounds(startObj, canvasSize);
    let newAbsX = startBounds.x;
    let newAbsY = startBounds.y;
    let newAbsW = startBounds.width;
    let newAbsH = startBounds.height;

    // ハンドルに応じて境界を更新
    switch (handle) {
        case 'nw': newAbsX += dx; newAbsY += dy; newAbsW -= dx; newAbsH -= dy; break;
        case 'n': newAbsY += dy; newAbsH -= dy; break;
        case 'ne': newAbsY += dy; newAbsW += dx; newAbsH -= dy; break;
        case 'e': newAbsW += dx; break;
        case 'se': newAbsW += dx; newAbsH += dy; break;
        case 's': newAbsH += dy; break;
        case 'sw': newAbsX += dx; newAbsW -= dx; newAbsH += dy; break;
        case 'w': newAbsX += dx; newAbsW -= dx; break;
    }

    // 最小サイズ制限
    const minSize = 5;
    if (newAbsW < minSize) {
        if (handle.includes('w')) newAbsX = startBounds.x + startBounds.width - minSize;
        newAbsW = minSize;
    }
    if (newAbsH < minSize) {
        if (handle.includes('n')) newAbsY = startBounds.y + startBounds.height - minSize;
        newAbsH = minSize;
    }

    // 正規化して返す
    const newW = normalize(newAbsW, canvasSize.width);
    const newH = normalize(newAbsH, canvasSize.height);

    if (startObj.type === OBJECT_TYPES.RECTANGLE || startObj.type === OBJECT_TYPES.IMAGE || startObj.type === OBJECT_TYPES.TEXT) {
        const newX = normalize(newAbsX, canvasSize.width);
        const newY = normalize(newAbsY, canvasSize.height);

        if (startObj.type === OBJECT_TYPES.TEXT) {
            const textObj = startObj as TextObject;
            const startArea = textObj.width * textObj.height;
            const newArea = newW * newH;
            const ratio = startArea === 0 ? 1 : Math.sqrt(newArea / startArea);
            const newFontSize = Math.max(5, textObj.fontSize * ratio);
            return { ...textObj, x: newX, y: newY, width: newW, height: newH, fontSize: newFontSize } as TextObject;
        } else {
            return { ...startObj, x: newX, y: newY, width: newW, height: newH } as RectangleObject | ImageObject;
        }
    } else if (startObj.type === OBJECT_TYPES.CIRCLE) {
        const circleObj = startObj as CircleObject;
        const newCenterX = normalize(newAbsX + newAbsW / 2, canvasSize.width);
        const newCenterY = normalize(newAbsY + newAbsH / 2, canvasSize.height);
        return { ...circleObj, x: newCenterX, y: newCenterY, rx: newW / 2, ry: newH / 2 } as CircleObject;
    }

    return null;
}

// オブジェクト描画コンポーネント
interface RenderObjectProps {
    obj: GreaseTraceObject;
    canvasSize: { width: number; height: number };
    isSelected: boolean;
    isEditing: boolean;
    onTextChange: (id: string, newText: string) => void;
    onTextBlur: (id: string) => void;
}

const getHandleCursor = (handle: ResizeHandle): string => {
    const cursors: Record<ResizeHandle, string> = {
        nw: 'nwse-resize', n: 'ns-resize', ne: 'nesw-resize', e: 'ew-resize',
        se: 'nwse-resize', s: 'ns-resize', sw: 'nesw-resize', w: 'ew-resize',
    };
    return cursors[handle];
};

const RenderObject: React.FC<RenderObjectProps> = ({ obj, canvasSize, isSelected, isEditing, onTextChange, onTextBlur }) => {
    const textRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (isEditing && textRef.current) textRef.current.focus();
    }, [isEditing]);

    let selectionElement: React.ReactElement | null = null;
    let resizeHandles: React.ReactElement | null = null;

    // 選択状態の表示
    if (isSelected && isResizable(obj) && !isEditing) {
        const bounds = getShapeBounds(obj, canvasSize);
        const padding = obj.type === OBJECT_TYPES.TEXT ? 2 : 1;
        
        selectionElement = (
            <rect
                x={bounds.x - padding}
                y={bounds.y - padding}
                width={bounds.width + padding * 2}
                height={bounds.height + padding * 2}
                fill="none"
                stroke={BLUE_OUTLINE_COLOR}
                strokeWidth="2"
                opacity={obj.type === OBJECT_TYPES.TEXT ? "0.6" : "0.9"}
                pointerEvents="none"
            />
        );

        // リサイズハンドル
        const handles: { x: number, y: number, handle: ResizeHandle }[] = [
            { x: bounds.x, y: bounds.y, handle: 'nw' },
            { x: bounds.x + bounds.width / 2, y: bounds.y, handle: 'n' },
            { x: bounds.x + bounds.width, y: bounds.y, handle: 'ne' },
            { x: bounds.x + bounds.width, y: bounds.y + bounds.height / 2, handle: 'e' },
            { x: bounds.x + bounds.width, y: bounds.y + bounds.height, handle: 'se' },
            { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height, handle: 's' },
            { x: bounds.x, y: bounds.y + bounds.height, handle: 'sw' },
            { x: bounds.x, y: bounds.y + bounds.height / 2, handle: 'w' },
        ];

        resizeHandles = (
            <g>
                {handles.map(h => (
                    <rect
                        key={h.handle}
                        x={h.x - HANDLE_SIZE / 2}
                        y={h.y - HANDLE_SIZE / 2}
                        width={HANDLE_SIZE}
                        height={HANDLE_SIZE}
                        fill={BLUE_OUTLINE_COLOR}
                        stroke="white"
                        strokeWidth="1"
                        style={{ cursor: getHandleCursor(h.handle) }}
                    />
                ))}
            </g>
        );
    }

    // タイプ別の描画
    switch (obj.type) {
        case OBJECT_TYPES.PEN:
            const penObj = obj as PenObject;
            const points = penObj.points.map(p => 
                `${denormalize(p.x, canvasSize.width)},${denormalize(p.y, canvasSize.height)}`
            ).join(' ');
            return (
                <g>
                    {isSelected && (
                        <polyline points={points} fill="none" stroke={BLUE_OUTLINE_COLOR} 
                            strokeWidth={penObj.lineWidth + BLUE_OUTLINE_WIDTH} strokeLinecap="round" 
                            strokeLinejoin="round" opacity="0.6" pointerEvents="none" />
                    )}
                    <polyline points={points} fill="none" stroke={penObj.color} 
                        strokeWidth={penObj.lineWidth} strokeLinecap="round" strokeLinejoin="round" />
                </g>
            );

        case OBJECT_TYPES.TEXT:
            const textObj = obj as TextObject;
            const textX = denormalize(textObj.x, canvasSize.width);
            const textY = denormalize(textObj.y, canvasSize.height);

            if (isEditing) {
                const bounds = getShapeBounds(textObj, canvasSize);
                return (
                    <foreignObject x={bounds.x - BLUE_OUTLINE_WIDTH} y={bounds.y - BLUE_OUTLINE_WIDTH}
                        width={bounds.width + BLUE_OUTLINE_WIDTH * 2} height={bounds.height + BLUE_OUTLINE_WIDTH * 2}>
                        <textarea ref={textRef} value={textObj.text}
                            onChange={(e) => onTextChange(obj.id, e.target.value)}
                            onBlur={() => onTextBlur(obj.id)}
                            placeholder="テキストを入力..."
                            style={{
                                width: '100%', height: '100%', fontSize: `${textObj.fontSize}px`,
                                color: textObj.color, border: `2px solid ${BLUE_OUTLINE_COLOR}`,
                                padding: '5px', resize: 'none', boxSizing: 'border-box',
                                backgroundColor: 'rgba(255, 255, 255, 0.9)', userSelect: 'auto',
                            }}
                        />
                    </foreignObject>
                );
            }
            return (
                <g>
                    {selectionElement}
                    <text x={textX} y={textY} fontSize={textObj.fontSize} fill={textObj.color}
                        dominantBaseline="text-before-edge" style={{ userSelect: 'none' }}>
                        {textObj.text || 'テキストを入力...'}
                    </text>
                    {resizeHandles}
                </g>
            );

        case OBJECT_TYPES.RECTANGLE:
            const rectObj = obj as RectangleObject;
            return (
                <g>
                    {selectionElement}
                    <rect
                        x={denormalize(rectObj.x, canvasSize.width)}
                        y={denormalize(rectObj.y, canvasSize.height)}
                        width={denormalize(rectObj.width, canvasSize.width)}
                        height={denormalize(rectObj.height, canvasSize.height)}
                        rx="2" fill="none" stroke={rectObj.color} strokeWidth={rectObj.lineWidth}
                    />
                    {resizeHandles}
                </g>
            );

        case OBJECT_TYPES.CIRCLE:
            const circleObj = obj as CircleObject;
            return (
                <g>
                    {selectionElement}
                    <ellipse
                        cx={denormalize(circleObj.x, canvasSize.width)}
                        cy={denormalize(circleObj.y, canvasSize.height)}
                        rx={denormalize(circleObj.rx, canvasSize.width)}
                        ry={denormalize(circleObj.ry, canvasSize.height)}
                        fill="none" stroke={circleObj.color} strokeWidth={circleObj.lineWidth}
                    />
                    {resizeHandles}
                </g>
            );

        case OBJECT_TYPES.LINE:
            const lineObj = obj as LineObject;
            return (
                <g>
                    {isSelected && (
                        <line
                            x1={denormalize(lineObj.x1, canvasSize.width)}
                            y1={denormalize(lineObj.y1, canvasSize.height)}
                            x2={denormalize(lineObj.x2, canvasSize.width)}
                            y2={denormalize(lineObj.y2, canvasSize.height)}
                            stroke={BLUE_OUTLINE_COLOR} strokeWidth={lineObj.lineWidth + BLUE_OUTLINE_WIDTH}
                            opacity="0.6" strokeLinecap="round" pointerEvents="none"
                        />
                    )}
                    <line
                        x1={denormalize(lineObj.x1, canvasSize.width)}
                        y1={denormalize(lineObj.y1, canvasSize.height)}
                        x2={denormalize(lineObj.x2, canvasSize.width)}
                        y2={denormalize(lineObj.y2, canvasSize.height)}
                        stroke={lineObj.color} strokeWidth={lineObj.lineWidth} strokeLinecap="round"
                    />
                </g>
            );

        case OBJECT_TYPES.IMAGE:
            const imageObj = obj as ImageObject;
            return (
                <g>
                    {selectionElement}
                    <image
                        x={denormalize(imageObj.x, canvasSize.width)}
                        y={denormalize(imageObj.y, canvasSize.height)}
                        width={denormalize(imageObj.width, canvasSize.width)}
                        height={denormalize(imageObj.height, canvasSize.height)}
                        href={imageObj.src}
                    />
                    {resizeHandles}
                </g>
            );

        default:
            return null;
    }
};

// メインコンポーネント
export const GreaseTraceSender: React.FC<GreaseTraceSenderProps> = ({
    videoRef,
    initialToolLockState = false,
    onDisconnectCallback,
    onUpdateCallback
}) => {
    const canvasRef = useRef<SVGSVGElement | null>(null);
    const [objects, setObjects] = useState<GreaseTraceObject[]>([]);
    const [tool, setTool] = useState<Tool>('select');
    const [color, setColor] = useState<string>('#1e293b');
    const [lineWidth, setLineWidth] = useState<number>(LINE_WIDTH_OPTIONS[0]);
    const [isDrawing, setIsDrawing] = useState(false);
    const [currentPoints, setCurrentPoints] = useState<Point[]>([]);
    const [startPos, setStartPos] = useState<Point | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
    const [dragStartObject, setDragStartObject] = useState<GreaseTraceObject | null>(null);
    const [isResizing, setIsResizing] = useState(false);
    const [resizingHandle, setResizingHandle] = useState<ResizeHandle | null>(null);
    const [mousePos, setMousePos] = useState<{ x: number, y: number } | null>(null);
    const [isLaserAnnotationActive, setIsLaserAnnotationActive] = useState(false);
    const [laserAnnotationPoints, setLaserAnnotationPoints] = useState<Point[]>([]);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [isToolLocked, setIsToolLocked] = useState(initialToolLockState);
    
    const laserTimeoutRef = useRef<number | null>(null);
    const lastEmitTimeRef = useRef(0);
    const EMIT_INTERVAL = 33;

    // 線幅に応じたインジケーターサイズを取得
    const getIndicatorSize = (lw: number): number => {
        switch (lw) {
            case 2: return 6;
            case 5: return 10;
            case 10: return 16;
            case 20: return 24;
            default: return 6;
        }
    };

    // ビデオのアスペクト比を取得
    const getAspectRatio = useCallback((): number => {
        if (videoRef.current?.videoWidth && videoRef.current?.videoHeight) {
            return videoRef.current.videoWidth / videoRef.current.videoHeight;
        }
        return 16 / 9;
    }, [videoRef]);

    // キャンバスサイズ更新
    useEffect(() => {
        const updateSize = () => {
            if (canvasRef.current) {
                const rect = canvasRef.current.getBoundingClientRect();
                setCanvasSize({ width: rect.width, height: rect.height });
            }
        };
        updateSize();
        window.addEventListener('resize', updateSize);
        return () => window.removeEventListener('resize', updateSize);
    }, []);

    useEffect(() => {
        return () => {
            if (laserTimeoutRef.current) clearTimeout(laserTimeoutRef.current);
        };
    }, []);

    // 選択オブジェクトのスタイル更新
    useEffect(() => {
        if (selectedId) {
            setObjects(prev => prev.map(obj => {
                if (obj.id !== selectedId) return obj;

                if (isText(obj)) {
                    const newFontSize = lineWidth * 10;
                    if (obj.color === color && obj.fontSize === newFontSize) return obj;
                    const updated = { ...obj, color, fontSize: newFontSize } as TextObject;
                    onUpdateCallback?.(emitOperation('update', updated));
                    return updated;
                } else {
                    if (obj.color === color && obj.lineWidth === lineWidth) return obj;
                    const updated = { ...obj, color, lineWidth } as GreaseTraceObject;
                    onUpdateCallback?.(emitOperation('update', updated));
                    return updated;
                }
            }));
        }
    }, [color, lineWidth, selectedId]);

    // Delete/Backspaceキー
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (selectedId && (e.key === 'Delete' || e.key === 'Backspace')) {
                if (editingId) return;
                e.preventDefault();
                setObjects(prev => prev.filter(obj => obj.id !== selectedId));
                onUpdateCallback?.(emitOperation('delete', { id: selectedId }));
                setSelectedId(null);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedId, editingId]);

    // JSON操作データ生成
    const emitOperation = useCallback((opType: string, data: any): string => {
        return JSON.stringify({
            type: 'operation',
            op_type: opType,
            timestamp: Date.now(),
            aspect_ratio: getAspectRatio(),
            data
        });
    }, [getAspectRatio]);

    // 切断処理
    const handleDisconnect = useCallback(() => {
        onDisconnectCallback?.();
    }, [onDisconnectCallback]);

    // マウス座標を0.0-1.0の正規化座標に変換（キャンバス全体基準）
    const getNormalizedPosition = useCallback((e: React.MouseEvent<SVGSVGElement>): Point | null => {
        if (!canvasRef.current) return null;
        const rect = canvasRef.current.getBoundingClientRect();
        const x = normalize(e.clientX - rect.left, canvasSize.width);
        const y = normalize(e.clientY - rect.top, canvasSize.height);
        if (isNaN(x) || isNaN(y)) return null;
        return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
    }, [canvasSize]);

    // ポイントがオブジェクト内にあるか判定
    const isPointInObject = (obj: GreaseTraceObject, x: number, y: number): boolean => {
        const absX = denormalize(x, canvasSize.width);
        const absY = denormalize(y, canvasSize.height);

        if (isResizable(obj)) {
            const bounds = getShapeBounds(obj, canvasSize);
            return absX >= bounds.x && absX <= bounds.x + bounds.width &&
                   absY >= bounds.y && absY <= bounds.y + bounds.height;
        }

        if (obj.type === OBJECT_TYPES.LINE) {
            const lineObj = obj as LineObject;
            const x1 = denormalize(lineObj.x1, canvasSize.width);
            const y1 = denormalize(lineObj.y1, canvasSize.height);
            const x2 = denormalize(lineObj.x2, canvasSize.width);
            const y2 = denormalize(lineObj.y2, canvasSize.height);
            
            const dx = x2 - x1;
            const dy = y2 - y1;
            const lenSq = dx * dx + dy * dy;
            const t = lenSq === 0 ? -1 : ((absX - x1) * dx + (absY - y1) * dy) / lenSq;
            
            const nearX = t < 0 ? x1 : t > 1 ? x2 : x1 + t * dx;
            const nearY = t < 0 ? y1 : t > 1 ? y2 : y1 + t * dy;
            const dist = Math.sqrt((absX - nearX) ** 2 + (absY - nearY) ** 2);
            return dist < 10;
        }

        if (obj.type === OBJECT_TYPES.PEN) {
            const penObj = obj as PenObject;
            for (let i = 0; i < penObj.points.length - 1; i++) {
                const x1 = denormalize(penObj.points[i].x, canvasSize.width);
                const y1 = denormalize(penObj.points[i].y, canvasSize.height);
                const x2 = denormalize(penObj.points[i + 1].x, canvasSize.width);
                const y2 = denormalize(penObj.points[i + 1].y, canvasSize.height);
                
                const dx = x2 - x1;
                const dy = y2 - y1;
                const lenSq = dx * dx + dy * dy;
                const t = lenSq === 0 ? -1 : ((absX - x1) * dx + (absY - y1) * dy) / lenSq;
                
                const nearX = t < 0 ? x1 : t > 1 ? x2 : x1 + t * dx;
                const nearY = t < 0 ? y1 : t > 1 ? y2 : y1 + t * dy;
                const dist = Math.sqrt((absX - nearX) ** 2 + (absY - nearY) ** 2);
                if (dist < 10) return true;
            }
        }

        return false;
    };

    // マウスダウン
    const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
        if (editingId) return;

        const pos = getNormalizedPosition(e);
        if (!pos) return;

        const rect = canvasRef.current!.getBoundingClientRect();
        const absX = e.clientX - rect.left;
        const absY = e.clientY - rect.top;

        if (tool === 'select') {
            // リサイズハンドルチェック
            const hitHandle = objects.reduce<{ id: string, handle: ResizeHandle } | null>((hit, obj) => 
                hit || checkHandleHit(obj, selectedId, absX, absY, canvasSize), null);

            if (hitHandle) {
                setIsResizing(true);
                setResizingHandle(hitHandle.handle);
                setSelectedId(hitHandle.id);
                setStartPos(pos);
                setDragStartObject(objects.find(o => o.id === hitHandle.id) || null);
                return;
            }

            // オブジェクト選択
            const clicked = [...objects].reverse().find(obj => isPointInObject(obj, pos.x, pos.y));
            setSelectedId(clicked ? clicked.id : null);
            if (clicked) {
                setIsDragging(true);
                setStartPos(pos);
                setDragStartObject(clicked);
                setColor(clicked.color);
                setLineWidth(clicked.type === OBJECT_TYPES.TEXT ? (clicked as TextObject).fontSize / 10 : clicked.lineWidth);
            }
        } else if (tool === 'text') {
            // テキストオブジェクト作成
            const newObj: TextObject = {
                id: generateId(),
                type: OBJECT_TYPES.TEXT,
                color,
                lineWidth: 0,
                x: pos.x,
                y: pos.y,
                text: "",
                fontSize: lineWidth * 10,
                width: normalize(200, canvasSize.width),
                height: normalize(30, canvasSize.height)
            };
            setObjects(prev => [...prev, newObj]);
            onUpdateCallback?.(emitOperation('add', newObj));
            setTimeout(() => {
                setEditingId(newObj.id);
                setSelectedId(newObj.id);
                if (!isToolLocked) setTool('select');
            }, 0);
        } else if (tool === 'eraser') {
            // 消しゴム
            const toDelete = [...objects].reverse().find(obj => isPointInObject(obj, pos.x, pos.y));
            if (toDelete) {
                setObjects(prev => prev.filter(obj => obj.id !== toDelete.id));
                onUpdateCallback?.(emitOperation('delete', { id: toDelete.id }));
            }
        } else if (tool === 'laser') {
            // レーザーポインター
            setIsDrawing(true);
            setIsLaserAnnotationActive(true);
            setStartPos(pos);
            setLaserAnnotationPoints([pos]);
            onUpdateCallback?.(emitOperation('laser_click', { x: pos.x, y: pos.y }));
        } else {
            // 描画開始
            setIsDrawing(true);
            setStartPos(pos);
            setCurrentPoints([pos]);
        }
    };

    // ダブルクリック
    const handleDoubleClick = () => {
        if (tool === 'select' && selectedId) {
            const obj = objects.find(o => o.id === selectedId);
            if (obj?.type === OBJECT_TYPES.TEXT) {
                setEditingId(selectedId);
            }
        }
    };

    // マウス移動
    const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
        if (editingId) return;

        const pos = getNormalizedPosition(e);
        if (!pos) return;

        if (canvasRef.current) {
            const rect = canvasRef.current.getBoundingClientRect();
            setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
        }

        if (tool === 'laser') {
            if (laserTimeoutRef.current) clearTimeout(laserTimeoutRef.current);
            if (isDrawing && isLaserAnnotationActive) {
                setLaserAnnotationPoints(prev => [...prev, pos]);
            }
            const now = Date.now();
            if (now - lastEmitTimeRef.current > EMIT_INTERVAL) {
                onUpdateCallback?.(emitOperation('laser_move', {
                    x: pos.x,
                    y: pos.y,
                    annotation: isLaserAnnotationActive ? laserAnnotationPoints : []
                }));
                lastEmitTimeRef.current = now;
            }
            return;
        }

        if (tool === 'select' && isResizing && selectedId && dragStartObject && resizingHandle) {
            const dx = denormalize(pos.x - startPos!.x, canvasSize.width);
            const dy = denormalize(pos.y - startPos!.y, canvasSize.height);
            const newObj = calculateResizedObject(dragStartObject, dx, dy, resizingHandle, canvasSize);
            if (newObj) {
                setObjects(prev => prev.map(obj => obj.id === selectedId ? newObj : obj));
            }
            return;
        }

        if (tool === 'select' && isDragging && selectedId && startPos && dragStartObject) {
            const dx = pos.x - startPos.x;
            const dy = pos.y - startPos.y;

            setObjects(prev => prev.map(obj => {
                if (obj.id !== selectedId) return obj;

                if (obj.type === OBJECT_TYPES.PEN) {
                    return { ...obj, points: (dragStartObject as PenObject).points.map(p => ({ x: p.x + dx, y: p.y + dy })) } as PenObject;
                } else if (obj.type === OBJECT_TYPES.LINE) {
                    const startLine = dragStartObject as LineObject;
                    return { ...obj, x1: startLine.x1 + dx, y1: startLine.y1 + dy, x2: startLine.x2 + dx, y2: startLine.y2 + dy } as LineObject;
                } else if (isShape(obj)) {
                    const startShape = dragStartObject as ShapeObject;
                    return { ...obj, x: startShape.x + dx, y: startShape.y + dy };
                }
                return obj;
            }));
        } else if (isDrawing) {
            if (tool === 'pen') {
                setCurrentPoints(prev => [...prev, pos]);
            } else {
                setCurrentPoints([startPos!, pos]);
            }
        }
    };

    // マウスアップ
    const handleMouseUp = (e: React.MouseEvent<SVGSVGElement>) => {
        if (editingId) return;

        if (tool === 'select' && isResizing && selectedId) {
            const obj = objects.find(o => o.id === selectedId);
            if (obj) onUpdateCallback?.(emitOperation('update', obj));
            setIsResizing(false);
            setResizingHandle(null);
            setStartPos(null);
            setDragStartObject(null);
            return;
        }

        if (tool === 'select' && isDragging && selectedId) {
            const obj = objects.find(o => o.id === selectedId);
            if (obj) onUpdateCallback?.(emitOperation('update', obj));
            setIsDragging(false);
            setStartPos(null);
            setDragStartObject(null);
        } else if (tool === 'laser' && isDrawing && isLaserAnnotationActive) {
            setIsDrawing(false);
            setStartPos(null);
            const finalPos = getNormalizedPosition(e);
            if (finalPos) {
                onUpdateCallback?.(emitOperation('laser_move', { x: finalPos.x, y: finalPos.y, annotation: laserAnnotationPoints }));
            }
            if (laserTimeoutRef.current) clearTimeout(laserTimeoutRef.current);
            laserTimeoutRef.current = window.setTimeout(() => {
                onUpdateCallback?.(emitOperation('laser_move', { x: -1, y: -1, annotation: [] }));
                setIsLaserAnnotationActive(false);
                setLaserAnnotationPoints([]);
            }, 300);
        } else if (isDrawing && startPos) {
            const pos = getNormalizedPosition(e);
            if (!pos) return;

            const finalPoints = tool === 'pen' ? currentPoints : [startPos, pos];
            const newObj = createObject(tool, finalPoints, color, lineWidth);

            if (newObj) {
                setObjects(prev => [...prev, newObj]);
                onUpdateCallback?.(emitOperation('add', newObj));
                if (!isToolLocked) {
                    setTool('select');
                    setSelectedId(newObj.id);
                }
            }

            setIsDrawing(false);
            setCurrentPoints([]);
            setStartPos(null);
        }

        if (tool === 'laser' && !isLaserAnnotationActive) {
            if (laserTimeoutRef.current) clearTimeout(laserTimeoutRef.current);
            laserTimeoutRef.current = window.setTimeout(() => {
                onUpdateCallback?.(emitOperation('laser_move', { x: -1, y: -1, annotation: [] }));
            }, 300);
        } else if (tool !== 'laser') {
            setMousePos(null);
            setIsDrawing(false);
            setCurrentPoints([]);
            setStartPos(null);
        }
    };

    // マウスリーブ
    const handleMouseLeave = (e: React.MouseEvent<SVGSVGElement>) => {
        if (editingId) return;
        if (isDrawing || (tool === 'select' && isDragging) || (tool === 'select' && isResizing)) {
            handleMouseUp(e);
        }
        if (tool === 'laser') {
            if (laserTimeoutRef.current) clearTimeout(laserTimeoutRef.current);
            laserTimeoutRef.current = window.setTimeout(() => {
                onUpdateCallback?.(emitOperation('laser_move', { x: -1, y: -1, annotation: [] }));
            }, 300);
        }
        setMousePos(null);
    };

    // オブジェクト作成
    const createObject = (type: Tool, points: Point[], color: string, lineWidth: number): GreaseTraceObject | null => {
        if (points.length < 1) return null;
        const start = points[0];
        const end = points[points.length - 1];

        switch (type) {
            case 'pen':
                if (points.length < 2) return null;
                return { id: generateId(), type: OBJECT_TYPES.PEN, color, lineWidth, points } as PenObject;

            case 'rectangle':
                const width = Math.abs(end.x - start.x);
                const height = Math.abs(end.y - start.y);
                if (width < 0.001 || height < 0.001) return null;
                return {
                    id: generateId(),
                    type: OBJECT_TYPES.RECTANGLE,
                    color,
                    lineWidth,
                    x: Math.min(start.x, end.x),
                    y: Math.min(start.y, end.y),
                    width,
                    height
                } as RectangleObject;

            case 'circle':
                const rx = Math.abs(end.x - start.x) / 2;
                const ry = Math.abs(end.y - start.y) / 2;
                if (rx < 0.001 || ry < 0.001) return null;
                return {
                    id: generateId(),
                    type: OBJECT_TYPES.CIRCLE,
                    color,
                    lineWidth,
                    x: start.x + (end.x - start.x) / 2,
                    y: start.y + (end.y - start.y) / 2,
                    rx,
                    ry
                } as CircleObject;

            case 'line':
                const dist = Math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2);
                if (dist < 0.001) return null;
                return {
                    id: generateId(),
                    type: OBJECT_TYPES.LINE,
                    color,
                    lineWidth,
                    x1: start.x,
                    y1: start.y,
                    x2: end.x,
                    y2: end.y
                } as LineObject;

            default:
                return null;
        }
    };

    // 画像アップロード
    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new window.Image();
            img.onload = () => {
                const ratio = img.height / img.width;
                const initialWidth = 0.15;
                const initialHeight = initialWidth * ratio;

                const newObj: ImageObject = {
                    id: generateId(),
                    type: OBJECT_TYPES.IMAGE,
                    color: '#000000',
                    lineWidth: 0,
                    x: 0.5 - initialWidth / 2,
                    y: 0.5 - initialHeight / 2,
                    width: initialWidth,
                    height: initialHeight,
                    src: event.target?.result as string
                };
                setObjects(prev => [...prev, newObj]);
                onUpdateCallback?.(emitOperation('add', newObj));
                if (!isToolLocked) {
                    setTool('select');
                    setSelectedId(newObj.id);
                }
            };
            img.src = event.target?.result as string;
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    // 削除
    const handleDelete = () => {
        if (!selectedId) return;
        setObjects(prev => prev.filter(obj => obj.id !== selectedId));
        onUpdateCallback?.(emitOperation('delete', { id: selectedId }));
        setSelectedId(null);
    };

    // プレビュー図形
    const previewShapeProps = useMemo(() => {
        if (!isDrawing || tool === 'pen' || tool === 'laser' || !startPos || currentPoints.length === 0) return null;
        const endPos = currentPoints[currentPoints.length - 1];

        if (tool === 'rectangle') {
            return {
                x: denormalize(Math.min(startPos.x, endPos.x), canvasSize.width),
                y: denormalize(Math.min(startPos.y, endPos.y), canvasSize.height),
                width: Math.abs(denormalize(endPos.x - startPos.x, canvasSize.width)),
                height: Math.abs(denormalize(endPos.y - startPos.y, canvasSize.height))
            };
        }
        if (tool === 'circle') {
            return {
                cx: denormalize((startPos.x + endPos.x) / 2, canvasSize.width),
                cy: denormalize((startPos.y + endPos.y) / 2, canvasSize.height),
                rx: Math.abs(denormalize(endPos.x - startPos.x, canvasSize.width)) / 2,
                ry: Math.abs(denormalize(endPos.y - startPos.y, canvasSize.height)) / 2
            };
        }
        if (tool === 'line') {
            return {
                x1: denormalize(startPos.x, canvasSize.width),
                y1: denormalize(startPos.y, canvasSize.height),
                x2: denormalize(endPos.x, canvasSize.width),
                y2: denormalize(endPos.y, canvasSize.height)
            };
        }
        return null;
    }, [isDrawing, tool, startPos, currentPoints, canvasSize]);

    // カーソルスタイル
    const svgCursorStyle = useMemo(() => {
        if (tool === 'pen' || tool === 'eraser' || tool === 'laser' || tool === 'text') return 'none';
        if (isResizing && resizingHandle) return getHandleCursor(resizingHandle);
        return tool === 'select' ? 'default' : 'crosshair';
    }, [tool, isResizing, resizingHandle]);

    // テキスト編集
    const handleTextChange = useCallback((id: string, newText: string) => {
        setObjects(prev => prev.map(obj => {
            if (obj.id === id && obj.type === OBJECT_TYPES.TEXT) {
                return { ...obj, text: newText } as TextObject;
            }
            return obj;
        }));
    }, []);

    const handleTextBlur = useCallback((id: string) => {
        const textObj = objects.find(obj => obj.id === id);
        if (textObj) onUpdateCallback?.(emitOperation('update', textObj));
        setEditingId(null);
    }, [objects, onUpdateCallback]);

    return (
        <div className="absolute inset-0 z-10 flex flex-col">
            {/* ツールバー */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20">
                <div className="flex items-center gap-2 p-3 bg-white border border-gray-200 rounded-xl shadow-lg">
                    <div className="flex items-center gap-1 p-1 bg-gray-50 rounded-lg">
                        {[
                            { id: 'select' as Tool, icon: MousePointer2, label: '選択' },
                            { id: 'rectangle' as Tool, icon: Square, label: '四角' },
                            { id: 'circle' as Tool, icon: Circle, label: '円' },
                            { id: 'line' as Tool, icon: Minus, label: '線' },
                            { id: 'pen' as Tool, icon: Pencil, label: 'ペン' },
                            { id: 'eraser' as Tool, icon: Eraser, label: '消しゴム' },
                            { id: 'laser' as Tool, icon: Zap, label: 'レーザー' },
                            { id: 'text' as Tool, icon: Type, label: 'テキスト' }
                        ].map(({ id, icon: Icon, label }) => (
                            <button
                                key={id}
                                onClick={() => {
                                    setTool(id);
                                    setSelectedId(null);
                                    setEditingId(null);
                                    if (laserTimeoutRef.current) clearTimeout(laserTimeoutRef.current);
                                    setMousePos(null);
                                }}
                                className={`p-2.5 rounded transition-all ${tool === id ? 'bg-blue-500 text-white shadow-sm' : 'hover:bg-gray-100 text-gray-700'}`}
                                title={label}
                            >
                                <Icon size={18} strokeWidth={2} />
                            </button>
                        ))}
                    </div>

                    {/* ツールロック */}
                    <button
                        onClick={() => setIsToolLocked(prev => !prev)}
                        className={`p-2.5 rounded transition-all ${isToolLocked ? 'bg-red-500 text-white shadow-sm' : 'hover:bg-gray-100 text-gray-700'}`}
                        title={isToolLocked ? 'ロック解除' : 'ロック'}
                    >
                        {isToolLocked ? <Lock size={18} strokeWidth={2} /> : <Unlock size={18} strokeWidth={2} />}
                    </button>

                    <div className="w-px h-8 bg-gray-200 mx-1" />

                    {/* 色選択 */}
                    <input
                        type="color"
                        value={color}
                        onChange={(e) => setColor(e.target.value)}
                        className="w-8 h-8 rounded cursor-pointer border-2 border-gray-200"
                        title="色"
                    />

                    {/* 線幅選択 */}
                    <div className="flex gap-1 px-2">
                        {LINE_WIDTH_OPTIONS.map(width => (
                            <button
                                key={width}
                                onClick={() => setLineWidth(width)}
                                className={`w-8 h-8 rounded flex items-center justify-center transition-colors ${lineWidth === width ? 'bg-gray-200' : 'hover:bg-gray-100'}`}
                                title={`${width}px`}
                            >
                                <div
                                    className="rounded-full"
                                    style={{
                                        width: `${getIndicatorSize(width)}px`,
                                        height: `${getIndicatorSize(width)}px`,
                                        backgroundColor: (selectedId || tool === 'pen') ? color : 'rgb(55, 65, 81)'
                                    }}
                                />
                            </button>
                        ))}
                    </div>

                    <div className="w-px h-8 bg-gray-200 mx-1" />

                    {/* 画像アップロード */}
                    <label className="p-2.5 rounded hover:bg-gray-100 cursor-pointer transition-colors" title="画像">
                        <Image size={18} strokeWidth={2} className="text-gray-700" />
                        <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                    </label>

                    {/* 削除ボタン */}
                    {selectedId && (
                        <button onClick={handleDelete} className="p-2.5 rounded hover:bg-red-100 text-red-600 transition-colors" title="削除">
                            <Trash2 size={18} strokeWidth={2} />
                        </button>
                    )}

                    {/* 切断ボタン */}
                    <button onClick={handleDisconnect} className="p-2.5 rounded hover:bg-gray-100 text-gray-700 transition-colors" title="切断">
                        <LogOut size={18} strokeWidth={2} />
                    </button>
                </div>
            </div>

            {/* キャンバス */}
            <div className="flex-1">
                <svg
                    ref={canvasRef}
                    className="w-full h-full"
                    style={{ cursor: svgCursorStyle }}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseLeave}
                    onDoubleClick={handleDoubleClick}
                >
                    {/* 既存オブジェクト */}
                    {objects.map(obj => (
                        <RenderObject
                            key={obj.id}
                            obj={obj}
                            canvasSize={canvasSize}
                            isSelected={obj.id === selectedId}
                            isEditing={obj.id === editingId}
                            onTextChange={handleTextChange}
                            onTextBlur={handleTextBlur}
                        />
                    ))}

                    {/* 描画中プレビュー */}
                    {isDrawing && tool === 'pen' && currentPoints.length > 1 && (
                        <polyline
                            points={currentPoints.map(p => `${denormalize(p.x, canvasSize.width)},${denormalize(p.y, canvasSize.height)}`).join(' ')}
                            fill="none"
                            stroke={color}
                            strokeWidth={lineWidth}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            opacity="0.7"
                        />
                    )}
                    {isDrawing && tool === 'rectangle' && previewShapeProps && (
                        <rect {...previewShapeProps} fill="none" stroke={color} strokeWidth={lineWidth} opacity="0.7" />
                    )}
                    {isDrawing && tool === 'circle' && previewShapeProps && (
                        <ellipse cx={previewShapeProps.cx} cy={previewShapeProps.cy} rx={previewShapeProps.rx} ry={previewShapeProps.ry} fill="none" stroke={color} strokeWidth={lineWidth} opacity="0.7" />
                    )}
                    {isDrawing && tool === 'line' && previewShapeProps && (
                        <line x1={previewShapeProps.x1} y1={previewShapeProps.y1} x2={previewShapeProps.x2} y2={previewShapeProps.y2} stroke={color} strokeWidth={lineWidth} strokeLinecap="round" opacity="0.7" />
                    )}

                    {/* レーザーアノテーション */}
                    {tool === 'laser' && isLaserAnnotationActive && laserAnnotationPoints.length > 1 && (
                        <polyline
                            points={laserAnnotationPoints.map(p => `${denormalize(p.x, canvasSize.width)},${denormalize(p.y, canvasSize.height)}`).join(' ')}
                            fill="none"
                            stroke="#ff4136"
                            strokeWidth={5}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            opacity="0.8"
                        />
                    )}

                    {/* カーソル表示 */}
                    {mousePos && (tool === 'pen' || tool === 'eraser' || tool === 'laser' || tool === 'text') && (
                        <circle
                            cx={mousePos.x}
                            cy={mousePos.y}
                            r={tool === 'laser' ? 8 : tool === 'text' ? lineWidth * 5 : lineWidth * 0.5 + 5}
                            fill={tool === 'laser' ? '#ff4136' : 'none'}
                            stroke={tool === 'pen' ? color : tool === 'eraser' ? 'rgb(248, 113, 113)' : tool === 'text' ? color : '#ff4136'}
                            strokeWidth={tool === 'laser' ? 0 : 2}
                            pointerEvents="none"
                        >
                            {tool === 'laser' && (
                                <>
                                    <animate attributeName="r" values="8; 10; 8" dur="0.8s" repeatCount="indefinite" />
                                    <animate attributeName="opacity" values="1; 0.8; 1" dur="0.8s" repeatCount="indefinite" />
                                </>
                            )}
                        </circle>
                    )}
                </svg>
            </div>
        </div>
    );
};
