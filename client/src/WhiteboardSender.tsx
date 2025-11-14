import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { MousePointer2, Square, Circle, Minus, Pencil, Eraser, Image, Trash2, Zap, Type, Lock, Unlock, LogOut } from 'lucide-react';

/**
 * 共通型定義 (エクスポート)
 */

// 正規化された座標 (0.0 から 1.0)
export interface Point {
    x: number;
    y: number;
}

// 共通オブジェクトの基底型
export interface ObjectBase {
    id: string;
    type: string; // 必須
    color: string;
    lineWidth: number; // 正規化されていないピクセル値
}

// ペンツール
export interface PenObject extends ObjectBase {
    type: 'pen';
    points: Point[];
}

// 図形 (Rectangle, Circle, Image, Text) の基底型
export interface ShapeObject extends ObjectBase {
    x: number;
    y: number;
}

// 四角形
export interface RectangleObject extends ShapeObject {
    type: 'rectangle';
    width: number;
    height: number;
}

// 円/楕円
export interface CircleObject extends ShapeObject {
    type: 'circle';
    rx: number;
    ry: number;
}

// 直線
export interface LineObject extends ObjectBase {
    type: 'line';
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}

// 画像
export interface ImageObject extends ShapeObject {
    type: 'image';
    src: string; // Base64 or URL
    width: number;
    height: number;
}

// テキストオブジェクト
export interface TextObject extends ShapeObject {
    type: 'text';
    text: string;
    fontSize: number; // 正規化されていないピクセル値
    width: number; // テキストの幅 (正規化されていない)
    height: number; // テキストの高さ (正規化されていない)
}

export type WhiteboardObject = PenObject | RectangleObject | CircleObject | LineObject | ImageObject | TextObject;

// ツール名
type Tool = 'select' | 'rectangle' | 'circle' | 'line' | 'pen' | 'eraser' | 'laser' | 'text';

// リサイズハンドルの型
type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';


/**
 * WhiteboardSenderに渡すPropsの定義 (更新)
 */
export interface WhiteboardSenderProps {
    initialToolLockState?: boolean;
    onDisconnectCallback?: () => void;
    // ⭐️ 描画データが更新されたときに呼ばれるコールバックを追加
    onUpdateCallback?: (jsonString: string) => void;
}


/**
 * 共通定数定義 (省略)
 */
const BLUE_OUTLINE_WIDTH = 5;
const BLUE_OUTLINE_COLOR = '#7dd3fc';
const HANDLE_SIZE = 10;

/**
 * UUID生成ユーティリティ (省略)
 */
const generateId = (): string => crypto.randomUUID();

/**
 * 正規化座標 ⇔ 絶対座標の変換ユーティリティ (修正)
 */
// ⭐️ 正規化は XとYで呼び出し元が dimension を使い分ける
const normalize = (value: number, dimension: number): number => value / dimension;
const denormalize = (value: number, dimension: number): number => value * dimension;

/**
 * オブジェクトの型定義 (省略)
 */
const OBJECT_TYPES = {
    PEN: 'pen',
    RECTANGLE: 'rectangle',
    CIRCLE: 'circle',
    LINE: 'line',
    IMAGE: 'image',
    TEXT: 'text'
} as const;

// 線の太さの選択肢 (実際の lineWidth 値)
const LINE_WIDTH_OPTIONS = [2, 5, 10, 20];

/**
 * 型ガード (省略)
 */
const isText = (o: WhiteboardObject): o is TextObject => o.type === OBJECT_TYPES.TEXT;
const isShape = (o: WhiteboardObject): o is RectangleObject | CircleObject | ImageObject | TextObject =>
    o.type === OBJECT_TYPES.RECTANGLE || o.type === OBJECT_TYPES.CIRCLE || o.type === OBJECT_TYPES.IMAGE || o.type === OBJECT_TYPES.TEXT;
const isResizable = (o: WhiteboardObject): o is RectangleObject | CircleObject | ImageObject | TextObject => isShape(o);


/**
 * ヘルパー関数: オブジェクトの絶対座標での境界ボックスを計算 (修正)
 */
interface AbsoluteBounds { x: number, y: number, width: number, height: number }
const getShapeBounds = (obj: ShapeObject | TextObject, canvasSize: { width: number; height: number }): AbsoluteBounds => {
    // ⭐️ アスペクト比の計算を削除

    if (obj.type === OBJECT_TYPES.TEXT || obj.type === OBJECT_TYPES.RECTANGLE || obj.type === OBJECT_TYPES.IMAGE) {
        const rectObj = obj as RectangleObject | ImageObject | TextObject;
        return {
            x: denormalize(rectObj.x, canvasSize.width),
            // ⭐️ Y座標の非正規化を height 基準に戻す
            y: denormalize(rectObj.y, canvasSize.height),
            width: denormalize(rectObj.width, canvasSize.width),
            // ⭐️ height の非正規化を height 基準に戻す
            height: denormalize(rectObj.height, canvasSize.height)
        };
    }
    if (obj.type === OBJECT_TYPES.CIRCLE) {
        const circleObj = obj as CircleObject;
        const cx = denormalize(circleObj.x, canvasSize.width);
        // ⭐️ Y座標の非正規化を height 基準に戻す
        const cy = denormalize(circleObj.y, canvasSize.height);
        const rx = denormalize(circleObj.rx, canvasSize.width);
        // ⭐️ ry の非正規化を height 基準に戻す
        const ry = denormalize(circleObj.ry, canvasSize.height);
        return {
            x: cx - rx,
            y: cy - ry,
            width: rx * 2,
            height: ry * 2
        };
    }
    return { x: 0, y: 0, width: 0, height: 0 };
};

/**
 * ヘルパー関数: ハンドルがクリックされたかチェック (省略)
 */
const checkHandleHit = (obj: WhiteboardObject, selectedId: string | null, absX: number, absY: number, canvasSize: { width: number, height: number }): { id: string, handle: ResizeHandle } | null => {
    // ... (省略) ...
    if (obj.id !== selectedId || !isResizable(obj)) return null;

    // ⭐️ 修正済みの getShapeBounds を使用 (内部ロジックは height 基準に戻っている)
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
        const hitArea = HANDLE_SIZE;
        if (absX >= h.x - hitArea && absX <= h.x + hitArea &&
            absY >= h.y - hitArea && absY <= h.y + hitArea) {
            return { id: obj.id, handle: h.handle };
        }
    }
    return null;
};

/**
 * ヘルパー関数: リサイズ後のオブジェクトの状態を計算 (修正)
 */
const calculateResizedObject = (startObj: WhiteboardObject, dx: number, dy: number, handle: ResizeHandle, canvasSize: { width: number, height: number }): WhiteboardObject | null => {
    // ... (省略) ...
    if (!isResizable(startObj)) return null;

    const startShapeObj = startObj as RectangleObject | CircleObject | ImageObject | TextObject;
    const canvasW = canvasSize.width;
    const canvasH = canvasSize.height;
    // ⭐️ アスペクト比の計算を削除

    // ⭐️ 修正済みの getShapeBounds を使用 (内部ロジックは height 基準に戻っている)
    const startBounds = getShapeBounds(startShapeObj, canvasSize);

    // 現在の絶対座標の境界ボックス (左上X, Y, 幅, 高さ)
    let newAbsX = startBounds.x;
    let newAbsY = startBounds.y;
    let newAbsW = startBounds.width;
    let newAbsH = startBounds.height;

    // 1. 境界ボックスの絶対座標を更新 (ピクセル値)
    switch (handle) {
        case 'nw':
            newAbsX += dx; newAbsY += dy; newAbsW -= dx; newAbsH -= dy; break;
        case 'n':
            newAbsY += dy; newAbsW += 0; newAbsH -= dy; break;
        case 'ne':
            newAbsY += dy; newAbsW += dx; newAbsH -= dy; break;
        case 'e':
            newAbsX += 0; newAbsY += 0; newAbsW += dx; newAbsH += 0; break;
        case 'se':
            newAbsW += dx; newAbsH += dy; break;
        case 's':
            newAbsW += 0; newAbsH += dy; break;
        case 'sw':
            newAbsX += dx; newAbsY += 0; newAbsW -= dx; newAbsH += dy; break;
        case 'w':
            newAbsX += dx; newAbsY += 0; newAbsW -= dx; newAbsH += 0; break;
    }

    // 最小サイズチェック (ピクセル)
    const minW_px = 5;
    const minH_px = 5;

    if (newAbsW < minW_px) {
        if (handle.includes('w')) { newAbsX = startBounds.x + startBounds.width - minW_px; } // 左側リサイズの場合は右に固定
        newAbsW = minW_px;
    }
    if (newAbsH < minH_px) {
        if (handle.includes('n')) { newAbsY = startBounds.y + startBounds.height - minH_px; } // 上側リサイズの場合は下に固定
        newAbsH = minH_px;
    }

    // 2. 正規化された新しいプロパティを計算
    // ⭐️ Y関連の正規化を height 基準に戻す
    const newW = normalize(newAbsW, canvasW);
    const newH = normalize(newAbsH, canvasH);


    if (startShapeObj.type === OBJECT_TYPES.RECTANGLE || startShapeObj.type === OBJECT_TYPES.IMAGE || startShapeObj.type === OBJECT_TYPES.TEXT) {
        // ⭐️ Y関連の正規化を height 基準に戻す
        const newX = normalize(newAbsX, canvasW);
        const newY = normalize(newAbsY, canvasH);

        if (startShapeObj.type === OBJECT_TYPES.TEXT) {
            // (fontSize の計算ロジック)
            const startW_norm = 'width' in startShapeObj ? startShapeObj.width : startShapeObj.rx * 2;
            const startH_norm = 'height' in startShapeObj ? startShapeObj.height : startShapeObj.ry * 2;
            const ratio = (startW_norm * startH_norm === 0) ? 1 : Math.sqrt((newW * newH) / (startW_norm * startH_norm));
            let newFontSize = startShapeObj.fontSize * ratio;
            newFontSize = Math.max(5, newFontSize);

            return {
                ...startShapeObj,
                x: newX,
                y: newY,
                width: newW,
                height: newH,
                fontSize: newFontSize
            } as TextObject;

        } else {
            return {
                ...startShapeObj,
                x: newX,
                y: newY,
                width: newW,
                height: newH,
            } as RectangleObject | ImageObject;
        }

    } else if (startShapeObj.type === OBJECT_TYPES.CIRCLE) {
        // 円/楕円
        // ⭐️ Y関連の正規化を height 基準に戻す
        const newX_center_norm = normalize(newAbsX + newAbsW / 2, canvasW); // 中心X
        const newY_center_norm = normalize(newAbsY + newAbsH / 2, canvasH); // 中心Y

        return {
            ...startShapeObj,
            x: newX_center_norm,
            y: newY_center_norm,
            rx: newW / 2,
            ry: newH / 2
        } as CircleObject;
    }

    return null;
}

// RenderObjectコンポーネント (修正)
interface RenderObjectProps {
    obj: WhiteboardObject;
    canvasSize: { width: number; height: number };
    isSelected: boolean;
    isEditing: boolean;
    onTextChange: (id: string, newText: string) => void;
    onTextBlur: (id: string) => void;
}

const getHandleCursor = (handle: ResizeHandle): string => {
    const handleCursors: Record<ResizeHandle, string> = {
        nw: 'nwse-resize', n: 'ns-resize', ne: 'nesw-resize', e: 'ew-resize',
        se: 'nwse-resize', s: 'ns-resize', sw: 'nesw-resize', w: 'ew-resize',
    };
    return handleCursors[handle];
};

const RenderObject: React.FC<RenderObjectProps> = ({ obj, canvasSize, isSelected, isEditing, onTextChange, onTextBlur }) => {
    const strokeWidth = obj.lineWidth;
    const commonProps = {
        opacity: 1,
    };

    // ⭐️ アスペクト比の計算を削除

    const textRef = useRef<HTMLTextAreaElement>(null);
    const textObject = obj.type === OBJECT_TYPES.TEXT ? (obj as TextObject) : null;

    useEffect(() => {
        if (isEditing && textRef.current) {
            textRef.current.focus();
        }
    }, [isEditing]);

    let selectionElement: React.ReactElement | null = null;
    let resizeHandlesElement: React.ReactElement | null = null;

    if (isSelected && isResizable(obj) && !isEditing) {
        const shapeObj = obj as RectangleObject | CircleObject | ImageObject | TextObject;
        // ⭐️ 修正済みの getShapeBounds を使用 (内部ロジックは height 基準に戻っている)
        const bounds = getShapeBounds(shapeObj, canvasSize);
        const { x, y, width, height } = bounds;

        if (obj.type !== OBJECT_TYPES.TEXT) {
            selectionElement = (
                <rect
                    x={x - 1}
                    y={y - 1}
                    width={width + 2}
                    height={height + 2}
                    fill="none"
                    stroke={BLUE_OUTLINE_COLOR}
                    strokeWidth="2"
                    opacity="0.9"
                    pointerEvents="none"
                />
            );
        } else {
            selectionElement = (
                <rect
                    x={x - 2}
                    y={y - 2}
                    width={width + 4}
                    height={height + 4}
                    fill="none"
                    stroke={BLUE_OUTLINE_COLOR}
                    strokeWidth="2"
                    opacity="0.6"
                    pointerEvents="none"
                />
            );
        }

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

        resizeHandlesElement = (
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

    switch (obj.type) {
        case OBJECT_TYPES.PEN:
            const penObj = obj as PenObject;
            const polylinePoints = penObj.points.map(p =>
                // ⭐️ Y座標の非正規化を height 基準に戻す
                `${denormalize(p.x, canvasSize.width)},${denormalize(p.y, canvasSize.height)}`
            ).join(' ');

            return (
                <g>
                    {isSelected && (
                        <polyline
                            points={polylinePoints}
                            fill="none"
                            stroke={BLUE_OUTLINE_COLOR}
                            strokeWidth={penObj.lineWidth + BLUE_OUTLINE_WIDTH}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            opacity="0.6"
                            pointerEvents="none"
                        />
                    )}
                    <polyline
                        points={polylinePoints}
                        fill="none"
                        stroke={penObj.color}
                        strokeWidth={strokeWidth}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        {...commonProps}
                    />
                </g>
            );

        case OBJECT_TYPES.TEXT:
            if (!textObject) return null;

            const textX = denormalize(textObject.x, canvasSize.width);
            // ⭐️ Y座標の非正規化を height 基準に戻す
            const textY = denormalize(textObject.y, canvasSize.height);

            if (isEditing) {
                // ⭐️ 修正済みの getShapeBounds を使用 (内部ロジックは height 基準に戻っている)
                const bounds = getShapeBounds(textObject, canvasSize);
                return (
                    <foreignObject
                        x={bounds.x - BLUE_OUTLINE_WIDTH}
                        y={bounds.y - BLUE_OUTLINE_WIDTH}
                        width={bounds.width + BLUE_OUTLINE_WIDTH * 2}
                        height={bounds.height + BLUE_OUTLINE_WIDTH * 2}
                        style={{ overflow: 'visible' }}
                    >
                        <textarea
                            ref={textRef}
                            value={textObject.text}
                            onChange={(e) => onTextChange(obj.id, e.target.value)}
                            onBlur={() => onTextBlur(obj.id)}
                            placeholder="テキストを入力..."
                            style={{
                                width: '100%',
                                height: '100%',
                                fontSize: `${textObject.fontSize}px`,
                                color: textObject.color,
                                border: `2px solid ${BLUE_OUTLINE_COLOR}`,
                                padding: '5px',
                                resize: 'none',
                                boxSizing: 'border-box',
                                backgroundColor: 'rgba(255, 255, 255, 0.9)',
                                userSelect: 'auto',
                            }}
                        />
                    </foreignObject>
                );
            } else {
                const textPreview = textObject.text || 'テキストを入力...';

                return (
                    <g>
                        {selectionElement}
                        <text
                            x={textX}
                            y={textY}
                            fontSize={textObject.fontSize}
                            fill={textObject.color}
                            dominantBaseline="text-before-edge"
                            style={{
                                WebkitUserSelect: 'none',
                                MozUserSelect: 'none',
                                msUserSelect: 'none',
                                userSelect: 'none',
                            }}
                            {...commonProps}
                        >
                            {textPreview}
                        </text>
                        {resizeHandlesElement}
                    </g>
                );
            }

        case OBJECT_TYPES.RECTANGLE:
            const rectObj = obj as RectangleObject;
            const rectProps = {
                x: denormalize(rectObj.x, canvasSize.width),
                // ⭐️ Y座標の非正規化を height 基準に戻す
                y: denormalize(rectObj.y, canvasSize.height),
                width: denormalize(rectObj.width, canvasSize.width),
                // ⭐️ height の非正規化を height 基準に戻す
                height: denormalize(rectObj.height, canvasSize.height),
                rx: "2"
            };
            return (
                <g>
                    {selectionElement}
                    <rect
                        {...rectProps}
                        fill="none"
                        stroke={rectObj.color}
                        strokeWidth={strokeWidth}
                        {...commonProps}
                    />
                    {resizeHandlesElement}
                </g>
            );

        case OBJECT_TYPES.CIRCLE:
            const circleObj = obj as CircleObject;
            const circleProps = {
                cx: denormalize(circleObj.x, canvasSize.width),
                // ⭐️ Y座標の非正規化を height 基準に戻す
                cy: denormalize(circleObj.y, canvasSize.height),
                rx: denormalize(circleObj.rx, canvasSize.width),
                // ⭐️ ry の非正規化を height 基準に戻す
                ry: denormalize(circleObj.ry, canvasSize.height),
            };
            return (
                <g>
                    {selectionElement}
                    <ellipse
                        {...circleProps}
                        fill="none"
                        stroke={circleObj.color}
                        strokeWidth={strokeWidth}
                        {...commonProps}
                    />
                    {resizeHandlesElement}
                </g>
            );

        case OBJECT_TYPES.LINE:
            const lineObj = obj as LineObject;
            const lineProps = {
                x1: denormalize(lineObj.x1, canvasSize.width),
                // ⭐️ Y座標の非正規化を height 基準に戻す
                y1: denormalize(lineObj.y1, canvasSize.height),
                x2: denormalize(lineObj.x2, canvasSize.width),
                // ⭐️ Y座標の非正規化を height 基準に戻す
                y2: denormalize(lineObj.y2, canvasSize.height),
            };
            return (
                <g>
                    {isSelected && (
                        <line
                            {...lineProps}
                            stroke={BLUE_OUTLINE_COLOR}
                            strokeWidth={lineObj.lineWidth + BLUE_OUTLINE_WIDTH}
                            opacity="0.6"
                            strokeLinecap="round"
                            pointerEvents="none"
                        />
                    )}
                    <line
                        {...lineProps}
                        stroke={lineObj.color}
                        strokeWidth={strokeWidth}
                        strokeLinecap="round"
                        {...commonProps}
                    />
                </g>
            );

        case OBJECT_TYPES.IMAGE:
            const imageObj = obj as ImageObject;
            const imageProps = {
                x: denormalize(imageObj.x, canvasSize.width),
                // ⭐️ Y座標の非正規化を height 基準に戻す
                y: denormalize(imageObj.y, canvasSize.height),
                width: denormalize(imageObj.width, canvasSize.width),
                // ⭐️ height の非正規化を height 基準に戻す
                height: denormalize(imageObj.height, canvasSize.height),
                href: imageObj.src,
            };
            return (
                <g>
                    {selectionElement}
                    <image
                        {...imageProps}
                        {...commonProps}
                    />
                    {resizeHandlesElement}
                </g>
            );

        default:
            return null;
    }
};


/**
 * メインホワイトボードコンポーネント（送信側）
 */
export const WhiteboardSender: React.FC<WhiteboardSenderProps> = ({
    initialToolLockState = false,
    onDisconnectCallback,
    onUpdateCallback // ⭐️ 新しいProp
}) => {
    const canvasRef = useRef<SVGSVGElement | null>(null);
    const [objects, setObjects] = useState<WhiteboardObject[]>([]);
    const [tool, setTool] = useState<Tool>('select');
    const [color, setColor] = useState<string>('#1e293b');
    const [lineWidth, setLineWidth] = useState<number>(LINE_WIDTH_OPTIONS[0]);
    const [isDrawing, setIsDrawing] = useState<boolean>(false);
    const [currentPoints, setCurrentPoints] = useState<Point[]>([]);
    const [startPos, setStartPos] = useState<Point | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [isDragging, setIsDragging] = useState<boolean>(false);
    const [canvasSize, setCanvasSize] = useState<{ width: number, height: number }>({ width: 800, height: 600 });

    // ⭐️ アスペクト比の useMemo を削除

    const [dragStartObject, setDragStartObject] = useState<WhiteboardObject | null>(null);

    const [isResizing, setIsResizing] = useState<boolean>(false);
    const [resizingHandle, setResizingHandle] = useState<ResizeHandle | null>(null);

    const [mousePos, setMousePos] = useState<{ x: number, y: number } | null>(null);
    const laserTimeoutRef = useRef<number | null>(null);
    const lastEmitTimeRef = useRef(0);
    const EMIT_INTERVAL = 33;

    // レーザーポインターのアノテーション/クリック強調用ステート
    const [isLaserAnnotationActive, setIsLaserAnnotationActive] = useState<boolean>(false);
    const [laserAnnotationPoints, setLaserAnnotationPoints] = useState<Point[]>([]);

    // テキスト編集用ステート
    const [editingId, setEditingId] = useState<string | null>(null);

    // ツールロック状態の初期値にPropsを使用
    const [isToolLocked, setIsToolLocked] = useState<boolean>(initialToolLockState);

    const getIndicatorSize = (lineWidth: number): number => {
        switch (lineWidth) {
            case 2: return 6;
            case 5: return 10;
            case 10: return 16;
            case 20: return 24;
            default: return 6;
        }
    };

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

    useEffect(() => {
        if (selectedId) {
            setObjects(prev => prev.map(obj => {
                if (obj.id !== selectedId) return obj;

                // ... (色の変更ロジックは省略) ...
                if (isText(obj)) {
                    const calculatedNewFontSize = lineWidth * 10;
                    if (obj.color === color && obj.fontSize === calculatedNewFontSize) return obj;

                    const updatedObj = {
                        ...obj,
                        color,
                        fontSize: calculatedNewFontSize
                    } as TextObject;
                    // ⭐️ 更新を即時送信
                    onUpdateCallback?.(emitOperation('update', updatedObj));
                    return updatedObj;

                } else {
                    if (obj.color === color && obj.lineWidth === lineWidth) return obj;

                    const updatedObj = {
                        ...obj,
                        color,
                        lineWidth
                    } as WhiteboardObject;
                    // ⭐️ 更新を即時送信
                    onUpdateCallback?.(emitOperation('update', updatedObj));
                    return updatedObj;
                }
            }));
        }
    }, [color, lineWidth, selectedId, onUpdateCallback]);


    /**
     * Delete/Backspaceキーによる削除処理 (省略)
     */
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (selectedId && (e.key === 'Delete' || e.key === 'Backspace')) {
                if (editingId) return;

                e.preventDefault();

                setObjects(prev => prev.filter(obj => obj.id !== selectedId));
                // ⭐️ 削除操作を外部に通知
                onUpdateCallback?.(emitOperation('delete', { id: selectedId }));
                setSelectedId(null);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedId, editingId, onUpdateCallback]);


    /**
     * JSONストリーム生成 - オペレーション (更新)
     */
    const emitOperation = useCallback((opType: 'add' | 'update' | 'delete' | 'laser_move' | 'laser_click', data: any): string => {
        const operation = {
            type: 'operation',
            op_type: opType,
            timestamp: Date.now(),
            data: data
        };
        const jsonString = JSON.stringify(operation);

        // ⭐️ onUpdateCallbackが提供されていれば実行
        // onUpdateCallback?.(jsonString); // -> onUpdateCallbackを呼び出し元でチェックするように変更

        return jsonString;
    }, []);

    /**
     * 切断ボタンのコールバック関数 (Propsで渡された関数を優先)
     */
    const handleDisconnect = useCallback(() => {
        if (onDisconnectCallback) {
            onDisconnectCallback();
        } else {
            console.log("⚠️ Disconnect button clicked: Executing default callback.");
            alert("切断処理を実行しました。ここに実際の切断ロジックを追加してください。");
        }
    }, [onDisconnectCallback]);

    /**
     * 正規化座標を取得 (修正)
     */
    const getNormalizedPosition = useCallback((e: React.MouseEvent<SVGSVGElement>): Point => {
        if (!canvasRef.current) return { x: 0, y: 0 };
        const rect = canvasRef.current.getBoundingClientRect();

        // ⭐️ Y座標の正規化を height 基準に戻す
        return {
            x: normalize(e.clientX - rect.left, canvasSize.width),
            y: normalize(e.clientY - rect.top, canvasSize.height)
        };
    }, [canvasSize]); // ⭐️ 依存配列から aspectRatio を削除

    /**
     * ポイントがオブジェクト内にあるか判定 (修正)
     */
    const isPointInObject = (obj: WhiteboardObject, x: number, y: number): boolean => {
        // (x, y は正規化座標)

        // ⭐️ アスペクト比の計算を削除
        // ⭐️ ピクセル座標に変換 (height 基準)
        const absX = denormalize(x, canvasSize.width);
        const absY = denormalize(y, canvasSize.height);


        if (isResizable(obj)) {
            // ⭐️ 修正済みの getShapeBounds を使用 (内部ロジックは height 基準に戻っている)
            const bounds = getShapeBounds(obj, canvasSize);
            return absX >= bounds.x && absX <= bounds.x + bounds.width &&
                absY >= bounds.y && absY <= bounds.y + bounds.height;
        }

        // Line, Penのロジック
        if (obj.type === OBJECT_TYPES.LINE) {
            // ⭐️ Y座標の非正規化を height 基準に戻す
            const x1 = denormalize(obj.x1, canvasSize.width);
            const y1 = denormalize(obj.y1, canvasSize.height);
            const x2 = denormalize(obj.x2, canvasSize.width);
            const y2 = denormalize(obj.y2, canvasSize.height);

            const A = absX - x1;
            const B = absY - y1;
            const C = x2 - x1;
            const D = y2 - y1;
            const dot = A * C + B * D;
            const lenSq = C * C + D * D;
            const param = lenSq !== 0 ? dot / lenSq : -1;

            let xx: number, yy: number;
            if (param < 0) {
                xx = x1;
                yy = y1;
            } else if (param > 1) {
                xx = x2;
                yy = y2;
            } else {
                xx = x1 + param * C;
                yy = y1 + param * D;
            }

            const dx = absX - xx;
            const dy = absY - yy;
            return Math.sqrt(dx * dx + dy * dy) < 10;
        }

        if (obj.type === OBJECT_TYPES.PEN) {
            for (let i = 0; i < obj.points.length - 1; i++) {
                // ⭐️ Y座標の非正規化を height 基準に戻す
                const x1 = denormalize(obj.points[i].x, canvasSize.width);
                const y1 = denormalize(obj.points[i].y, canvasSize.height);
                const x2 = denormalize(obj.points[i + 1].x, canvasSize.width);
                const y2 = denormalize(obj.points[i + 1].y, canvasSize.height);

                const A = absX - x1;
                const B = absY - y1;
                const C = x2 - x1;
                const D = y2 - y1;
                const dot = A * C + B * D;
                const lenSq = C * C + D * D;
                const param = lenSq !== 0 ? dot / lenSq : -1;

                let xx: number, yy: number;
                if (param < 0) {
                    xx = x1;
                    yy = y1;
                } else if (param > 1) {
                    xx = x2;
                    yy = y2;
                } else {
                    xx = x1 + param * C;
                    yy = y1 + param * D;
                }

                const dx = absX - xx;
                const dy = absY - yy;
                if (Math.sqrt(dx * dx + dy * dy) < 10) return true;
            }
            return false;
        }

        return false;
    };


    /**
     * 描画開始処理 (省略)
     */
    const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
        if (editingId) return;

        const pos = getNormalizedPosition(e);
        const { clientX, clientY } = e;
        const rect = canvasRef.current!.getBoundingClientRect();
        const absX = clientX - rect.left;
        const absY = clientY - rect.top;

        if (tool === 'select') {

            const hitHandleInfo = objects.reduce((hit: { id: string, handle: ResizeHandle } | null, obj) => {
                if (hit) return hit;
                return checkHandleHit(obj, selectedId, absX, absY, canvasSize);
            }, null);

            if (hitHandleInfo) {
                setIsResizing(true);
                setResizingHandle(hitHandleInfo.handle);
                setSelectedId(hitHandleInfo.id);
                setStartPos(pos);
                setDragStartObject(JSON.parse(JSON.stringify(objects.find(o => o.id === hitHandleInfo.id))));
                return;
            }


            const clicked = [...objects].reverse().find(obj => isPointInObject(obj, pos.x, pos.y));
            setSelectedId(clicked ? clicked.id : null);
            if (clicked) {
                setIsDragging(true);
                setStartPos(pos);
                setDragStartObject(JSON.parse(JSON.stringify(clicked)));
                setColor(clicked.color);
                setLineWidth(clicked.type === OBJECT_TYPES.TEXT ? (clicked as TextObject).fontSize / 10 : clicked.lineWidth);
            } else {
                setStartPos(null);
                setDragStartObject(null);
            }
        } else if (tool === 'text') {
            // ⭐️ Y関連の正規化を height 基準に戻す
            const newObj: TextObject = {
                id: generateId(),
                type: OBJECT_TYPES.TEXT,
                color: color,
                lineWidth: 0,
                x: pos.x,
                y: pos.y,
                text: "",
                fontSize: lineWidth * 10,
                width: normalize(200, canvasSize.width),
                height: normalize(30, canvasSize.height) // ⭐️ 変更
            };
            setObjects(prev => [...prev, newObj]);
            // ⭐️ 新規オブジェクトの追加を外部に通知
            onUpdateCallback?.(emitOperation('add', newObj));

            setTimeout(() => {
                setEditingId(newObj.id);
                setSelectedId(newObj.id);

                if (!isToolLocked) {
                    setTool('select');
                }
            }, 0);

        } else if (tool === 'eraser') {
            const toDelete = [...objects].reverse().find(obj => isPointInObject(obj, pos.x, pos.y));
            if (toDelete) {
                setObjects(prev => prev.filter(obj => obj.id !== toDelete.id));
                // ⭐️ 削除操作を外部に通知
                onUpdateCallback?.(emitOperation('delete', { id: toDelete.id }));
            }
        } else if (tool === 'laser') {
            setIsDrawing(true);
            setIsLaserAnnotationActive(true);
            setStartPos(pos);
            setLaserAnnotationPoints([pos]);

            // ⭐️ 修正: レーザークリック操作を外部に通知
            onUpdateCallback?.(emitOperation('laser_click', { x: pos.x, y: pos.y }));

        } else {
            setIsDrawing(true);
            setStartPos(pos);
            if (tool === 'pen') {
                setCurrentPoints([pos]);
            } else {
                setCurrentPoints([pos]);
            }
        }
    };

    /**
     * ダブルクリック処理 (省略)
     */
    const handleDoubleClick = (_e: React.MouseEvent<SVGSVGElement>) => {
        if (tool === 'select' && selectedId) {
            const selectedObj = objects.find(obj => obj.id === selectedId);
            if (selectedObj && selectedObj.type === OBJECT_TYPES.TEXT) {
                setEditingId(selectedId);
            }
        }
    };

    /**
     * 描画中処理 (省略)
     */
    const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
        if (editingId) return;

        const pos = getNormalizedPosition(e);

        if (canvasRef.current) {
            const rect = canvasRef.current.getBoundingClientRect();
            setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
        }

        if (tool === 'laser') {
            if (laserTimeoutRef.current) {
                clearTimeout(laserTimeoutRef.current);
                laserTimeoutRef.current = null;
            }

            if (isDrawing && isLaserAnnotationActive) {
                // ⭐️ isDrawing時にcurrentPointsではなくlaserAnnotationPointsを更新
                setLaserAnnotationPoints(prev => [...prev, pos]);
            }

            const now = Date.now();
            if (now - lastEmitTimeRef.current > EMIT_INTERVAL) {
                // ⭐️ 修正: レーザー移動操作を外部に通知 (アノテーション座標を含める)
                onUpdateCallback?.(emitOperation('laser_move', {
                    x: pos.x,
                    y: pos.y,
                    // ⭐️ 追加: アノテーションの全座標を送信
                    annotation: isLaserAnnotationActive ? laserAnnotationPoints : []
                }));
                lastEmitTimeRef.current = now;
            }
            return;
        }

        if (tool === 'select' && isResizing && selectedId && dragStartObject && resizingHandle) {
            // ⭐️ dx, dy (ピクセル) の計算を height 基準に戻す
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

                const startObj = dragStartObject as WhiteboardObject;

                if (obj.type === OBJECT_TYPES.PEN && startObj.type === OBJECT_TYPES.PEN) {
                    return {
                        ...obj,
                        points: startObj.points.map(p => ({
                            x: p.x + dx,
                            y: p.y + dy
                        }))
                    } as PenObject;
                } else if (obj.type === OBJECT_TYPES.LINE && startObj.type === OBJECT_TYPES.LINE) {
                    return {
                        ...obj,
                        x1: startObj.x1 + dx,
                        y1: startObj.y1 + dy,
                        x2: startObj.x2 + dx,
                        y2: startObj.y2 + dy
                    } as LineObject;
                } else if (isShape(obj) && isShape(startObj)) {
                    return {
                        ...obj,
                        x: startObj.x + dx,
                        y: startObj.y + dy
                    } as RectangleObject | CircleObject | ImageObject | TextObject;
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

    /**
     * 描画終了処理 (省略)
     */
    const handleMouseUp = (e: React.MouseEvent<SVGSVGElement>) => {
        if (editingId) return;

        if (tool === 'select' && isResizing && selectedId) {
            const resizedObj = objects.find(obj => obj.id === selectedId);
            if (resizedObj) {
                // ⭐️ 更新操作を外部に通知
                onUpdateCallback?.(emitOperation('update', resizedObj));
            }
            setIsResizing(false);
            setResizingHandle(null);
            setStartPos(null);
            setDragStartObject(null);
            return;
        }


        if (tool === 'select' && isDragging && selectedId) {
            const movedObj = objects.find(obj => obj.id === selectedId);
            if (movedObj) {
                // ⭐️ 更新操作を外部に通知
                onUpdateCallback?.(emitOperation('update', movedObj));
            }
            setIsDragging(false);
            setStartPos(null);
            setDragStartObject(null);
        } else if (tool === 'laser' && isDrawing && isLaserAnnotationActive) {
            setIsDrawing(false);
            // setIsLaserAnnotationActive(false); // 停止時に `laser_move` で空配列を送るため、ここでは維持
            setStartPos(null);
            // setLaserAnnotationPoints([]); // 停止時に `laser_move` で空配列を送るため、ここでは維持

            // 最後の座標とアノテーションを送信し、その後停止を通知
            onUpdateCallback?.(emitOperation('laser_move', {
                x: getNormalizedPosition(e).x,
                y: getNormalizedPosition(e).y,
                annotation: laserAnnotationPoints, // 最後に描画した全座標
            }));

            if (laserTimeoutRef.current) clearTimeout(laserTimeoutRef.current);
            laserTimeoutRef.current = setTimeout(() => {
                // ⭐️ 修正: レーザー停止操作を外部に通知 (座標を無効化し、アノテーションを空にする)
                onUpdateCallback?.(emitOperation('laser_move', { x: -1, y: -1, annotation: [] }));
                setIsLaserAnnotationActive(false);
                setLaserAnnotationPoints([]);
            }, 300);

        } else if (isDrawing && startPos) {
            const pos = getNormalizedPosition(e);
            let finalPoints = currentPoints;
            if (tool !== 'pen') {
                finalPoints = [startPos, pos];
            }

            const newObj = createObject(tool, finalPoints, color, lineWidth);

            if (newObj) {
                setObjects(prev => [...prev, newObj]);
                // ⭐️ 新規オブジェクトの追加を外部に通知
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
            laserTimeoutRef.current = setTimeout(() => {
                // ⭐️ 修正: レーザー停止操作を外部に通知 (座標を無効化し、アノテーションを空にする)
                onUpdateCallback?.(emitOperation('laser_move', { x: -1, y: -1, annotation: [] }));
            }, 300);
        } else if (tool !== 'laser') {
            setMousePos(null);
            setIsDrawing(false);
            setCurrentPoints([]);
            setStartPos(null);
        }
    };

    /**
     * マウスがキャンバスから離れた時の処理 (省略)
     */
    const handleMouseLeave = (e: React.MouseEvent<SVGSVGElement>) => {
        if (editingId) return;

        if (isDrawing || (tool === 'select' && isDragging) || (tool === 'select' && isResizing)) {
            handleMouseUp(e);
        }

        if (tool === 'laser') {
            if (laserTimeoutRef.current) clearTimeout(laserTimeoutRef.current);
            laserTimeoutRef.current = setTimeout(() => {
                // ⭐️ 修正: レーザー停止操作を外部に通知 (座標を無効化し、アノテーションを空にする)
                onUpdateCallback?.(emitOperation('laser_move', { x: -1, y: -1, annotation: [] }));
            }, 300);
        }

        setMousePos(null);
    };

    // オブジェクト作成 (省略)
    const createObject = (type: Tool, points: Point[], color: string, lineWidth: number): WhiteboardObject | null => {
        if (points.length < 1) return null;
        const start = points[0];
        const end = points[points.length - 1];

        switch (type) {
            case 'pen':
                if (points.length < 2) return null;
                const penBase: ObjectBase = {
                    id: generateId(),
                    color,
                    lineWidth: lineWidth,
                    type: OBJECT_TYPES.PEN
                };
                return { ...penBase, points } as PenObject;

            case 'rectangle':
                const width = Math.abs(end.x - start.x);
                const height = Math.abs(end.y - start.y);
                if (width < 0.001 || height < 0.001) return null;

                const rectBase: ObjectBase = {
                    id: generateId(),
                    color,
                    lineWidth: lineWidth,
                    type: OBJECT_TYPES.RECTANGLE
                };
                return {
                    ...rectBase,
                    x: Math.min(start.x, end.x),
                    y: Math.min(start.y, end.y),
                    width,
                    height
                } as RectangleObject;

            case 'circle':
                const rx = Math.abs(end.x - start.x) / 2;
                const ry = Math.abs(end.y - start.y) / 2;
                if (rx < 0.001 || ry < 0.001) return null;

                const circleBase: ObjectBase = {
                    id: generateId(),
                    color,
                    lineWidth: lineWidth,
                    type: OBJECT_TYPES.CIRCLE
                };
                return {
                    ...circleBase,
                    x: start.x + (end.x - start.x) / 2, // 中心X
                    y: start.y + (end.y - start.y) / 2, // 中心Y
                    rx,
                    ry
                } as CircleObject;

            case 'line':
                const dist = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));
                if (dist < 0.001) return null;

                const lineBase: ObjectBase = {
                    id: generateId(),
                    color,
                    lineWidth: lineWidth,
                    type: OBJECT_TYPES.LINE
                };
                return {
                    ...lineBase,
                    x1: start.x,
                    y1: start.y,
                    x2: end.x,
                    y2: end.y
                } as LineObject;

            default:
                return null;
        }
    };

    // 画像アップロード処理 (修正)
    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event: ProgressEvent<FileReader>) => {
            const img = new window.Image();
            img.onload = () => {
                const imgW = img.width;
                const imgH = img.height;
                const canvasW = canvasSize.width;
                const canvasH = canvasSize.height; // ⭐️ canvasH を使用
                // ⭐️ アスペクト比の計算を削除

                const initialNormalizedWidth = 0.15;
                const initialPixelWidth = denormalize(initialNormalizedWidth, canvasW);

                const ratio = imgH / imgW;
                const initialPixelHeight = initialPixelWidth * ratio;

                // ⭐️ Y関連の正規化を height 基準に戻す
                const initialNormalizedHeight = normalize(initialPixelHeight, canvasH);
                const initialY_norm = 0.5 - initialNormalizedHeight / 2;


                const newObj: ImageObject = {
                    id: generateId(),
                    type: OBJECT_TYPES.IMAGE,
                    color: '#000000',
                    lineWidth: 0,
                    x: 0.5 - initialNormalizedWidth / 2,
                    y: initialY_norm, // ⭐️ 変更
                    width: initialNormalizedWidth,
                    height: initialNormalizedHeight, // ⭐️ 変更
                    src: (event.target?.result as string) || ''
                };
                setObjects(prev => [...prev, newObj]);
                // ⭐️ 新規オブジェクトの追加を外部に通知
                onUpdateCallback?.(emitOperation('add', newObj));

                if (!isToolLocked) {
                    setTool('select');
                    setSelectedId(newObj.id);
                }
            };
            img.src = (event.target?.result as string) || '';
        };
        reader.readAsDataURL(file);

        if (e.target) {
            e.target.value = '';
        }
    };
    // 削除処理 (省略)
    const handleDelete = () => {
        if (!selectedId) return;
        setObjects(prev => prev.filter(obj => obj.id !== selectedId));
        // ⭐️ 削除操作を外部に通知
        onUpdateCallback?.(emitOperation('delete', { id: selectedId }));
        setSelectedId(null);
    };

    // プレビュー図形プロパティ計算 (修正)
    const previewShapeProps = useMemo(() => {
        if (!isDrawing || tool === 'pen' || tool === 'laser' || !startPos || currentPoints.length === 0) return null;
        const endPos = currentPoints[currentPoints.length - 1];
        // ⭐️ アスペクト比の計算を削除

        if (tool === 'rectangle') {
            const x = denormalize(Math.min(startPos.x, endPos.x), canvasSize.width);
            // ⭐️ Y座標の非正規化を height 基準に戻す
            const y = denormalize(Math.min(startPos.y, endPos.y), canvasSize.height);
            const width = Math.abs(denormalize(endPos.x - startPos.x, canvasSize.width));
            // ⭐️ height の非正規化を height 基準に戻す
            const height = Math.abs(denormalize(endPos.y - startPos.y, canvasSize.height));
            return { x, y, width, height };
        }
        if (tool === 'circle') {
            const cx = denormalize((startPos.x + endPos.x) / 2, canvasSize.width);
            // ⭐️ Y座標の非正規化を height 基準に戻す
            const cy = denormalize((startPos.y + endPos.y) / 2, canvasSize.height);
            const rx = Math.abs(denormalize(endPos.x - startPos.x, canvasSize.width)) / 2;
            // ⭐️ ry の非正規化を height 基準に戻す
            const ry = Math.abs(denormalize(endPos.y - startPos.y, canvasSize.height)) / 2;
            return { cx, cy, rx, ry };
        }

        if (tool === 'line') {
            const x1 = denormalize(startPos.x, canvasSize.width);
            // ⭐️ Y座標の非正規化を height 基準に戻す
            const y1 = denormalize(startPos.y, canvasSize.height);
            const x2 = denormalize(endPos.x, canvasSize.width);
            // ⭐️ Y座標の非正規化を height 基準に戻す
            const y2 = denormalize(endPos.y, canvasSize.height);
            return { x1, y1, x2, y2 };
        }
        return null;
    }, [isDrawing, tool, startPos, currentPoints, canvasSize]); // ⭐️ 依存配列から aspectRatio を削除

    // カーソルスタイル計算 (省略)
    const svgCursorStyle = useMemo(() => {
        if (tool === 'pen' || tool === 'eraser' || tool === 'laser' || tool === 'text') {
            return 'none';
        }
        if (isResizing && resizingHandle) {
            const handleCursors: Record<ResizeHandle, string> = {
                nw: 'nwse-resize', n: 'ns-resize', ne: 'nesw-resize', e: 'ew-resize',
                se: 'nwse-resize', s: 'ns-resize', sw: 'nesw-resize', w: 'ew-resize',
            };
            return handleCursors[resizingHandle];
        }

        return tool === 'select' ? 'default' : 'crosshair';
    }, [tool, isResizing, resizingHandle]);

    // テキスト編集ロジック (省略)
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

        if (textObj) {
            // ⭐️ テキスト編集完了時の更新を外部に通知
            onUpdateCallback?.(emitOperation('update', textObj));
        }
        setEditingId(null);
    }, [objects, emitOperation, onUpdateCallback]);


    return (
        // ⭐️ 変更点1: 絶対配置で全画面に広げ、z-indexを10に設定
        <div className="absolute inset-0 z-10 flex flex-col">

            {/* ツールバーのオーバーレイ表示 */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20">
                <div className="flex items-center gap-2 p-3 bg-white border border-gray-200 rounded-xl shadow-lg">
                    {/* ... (ツールボタン群は省略) ... */}
                    <div className="flex items-center gap-1 p-1 bg-gray-50 rounded-lg">
                        {[
                            { id: 'select' as Tool, icon: MousePointer2, label: '選択' },
                            { id: 'rectangle' as Tool, icon: Square, label: '四角' },
                            { id: 'circle' as Tool, icon: Circle, label: '円' },
                            { id: 'line' as Tool, icon: Minus, label: '線' },
                            { id: 'pen' as Tool, icon: Pencil, label: 'ペン' },
                            { id: 'eraser' as Tool, icon: Eraser, label: '消しゴム' },
                            { id: 'laser' as Tool, icon: Zap, label: 'レーザーポインター' },
                            { id: 'text' as Tool, icon: Type, label: 'テキスト' }
                        ].map(({ id, icon: Icon, label }) => (
                            <button
                                key={id}
                                onClick={() => {
                                    setTool(id);
                                    setSelectedId(null);
                                    setEditingId(null);
                                    if (laserTimeoutRef.current) {
                                        clearTimeout(laserTimeoutRef.current);
                                        laserTimeoutRef.current = null;
                                    }
                                    setMousePos(null);
                                }}
                                className={`p-2.5 rounded transition-all ${tool === id
                                    ? 'bg-blue-500 text-white shadow-sm'
                                    : 'hover:bg-gray-100 text-gray-700'
                                    }`}
                                title={label}
                            >
                                <Icon size={18} strokeWidth={2} />
                            </button>
                        ))}
                    </div>

                    {/* ツールロックボタン */}
                    <button
                        onClick={() => setIsToolLocked(prev => !prev)}
                        className={`p-2.5 rounded transition-all ${isToolLocked
                            ? 'bg-red-500 text-white shadow-sm'
                            : 'hover:bg-gray-100 text-gray-700'
                            }`}
                        title={isToolLocked ? 'ツールロック中 (解除)' : 'ツールをロック'}
                    >
                        {isToolLocked ? <Lock size={18} strokeWidth={2} /> : <Unlock size={18} strokeWidth={2} />}
                    </button>

                    <div className="w-px h-8 bg-gray-200 mx-1" />
                    <div className="flex items-center gap-2">
                        <input
                            type="color"
                            value={color}
                            onChange={(e) => setColor(e.target.value)}
                            className="w-8 h-8 rounded cursor-pointer border-2 border-gray-200"
                            title="色"
                        />
                    </div>
                    <div className="flex items-center gap-2 px-2">
                        <div className="flex gap-1">
                            {LINE_WIDTH_OPTIONS.map(width => {
                                const indicatorSize = getIndicatorSize(width);
                                return (
                                    <button
                                        key={width}
                                        onClick={() => setLineWidth(width)}
                                        className={`w-8 h-8 rounded flex items-center justify-center transition-colors ${lineWidth === width ? 'bg-gray-200' : 'hover:bg-gray-100'
                                            }`}
                                        title={`${width}px`}
                                    >
                                        <div
                                            className="rounded-full bg-gray-700"
                                            style={{
                                                width: `${indicatorSize}px`,
                                                height: `${indicatorSize}px`,
                                                backgroundColor: (selectedId || tool === 'pen') ? color : 'rgb(55, 65, 81)'
                                            }}
                                        />
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    <div className="w-px h-8 bg-gray-200 mx-1" />
                    <label className="p-2.5 rounded hover:bg-gray-100 cursor-pointer transition-colors" title="画像を挿入">
                        <Image size={18} strokeWidth={2} className="text-gray-700" />
                        <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                    </label>
                    {selectedId && (
                        <button
                            onClick={handleDelete}
                            className="p-2.5 rounded hover:bg-red-100 text-red-600 transition-colors"
                            title="選択を削除"
                        >
                            <Trash2 size={18} strokeWidth={2} />
                        </button>
                    )}

                    {/* 切断ボタン */}
                    <button
                        onClick={handleDisconnect}
                        className="p-2.5 rounded hover:bg-gray-100 text-gray-700 transition-colors"
                        title="切断"
                    >
                        <LogOut size={18} strokeWidth={2} />
                    </button>
                </div>
            </div>

            {/* キャンバスエリア (画面全体を占める) */}
            <div className="flex-1">
                <svg
                    ref={canvasRef}
                    // ⭐️ 変更点2: 背景色、影、ボーダーを全て削除し、透明なキャンバスにする
                    className="w-full h-full"
                    style={{ cursor: svgCursorStyle }}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseLeave}
                    onDoubleClick={handleDoubleClick}
                >

                    {/* 既存オブジェクトの描画 (省略) */}
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

                    {/* 描画中のプレビュー (省略) */}
                    {isDrawing && tool !== 'laser' && tool === 'pen' && currentPoints.length > 1 && (
                        <polyline
                            points={currentPoints.map(p =>
                                // ⭐️ Y座標の非正規化を height 基準に戻す
                                `${denormalize(p.x, canvasSize.width)},${denormalize(p.y, canvasSize.height)}`
                            ).join(' ')}
                            fill="none"
                            stroke={color}
                            strokeWidth={lineWidth}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            opacity="0.7"
                        />
                    )}
                    {isDrawing && tool === 'rectangle' && previewShapeProps && (
                        <rect
                            x={previewShapeProps.x}
                            y={previewShapeProps.y}
                            width={previewShapeProps.width}
                            height={previewShapeProps.height}
                            fill="none"
                            stroke={color}
                            strokeWidth={lineWidth}
                            opacity="0.7"
                        />
                    )}
                    {isDrawing && tool === 'circle' && previewShapeProps && (
                        <ellipse
                            cx={previewShapeProps.cx}
                            cy={previewShapeProps.cy}
                            rx={previewShapeProps.rx}
                            ry={previewShapeProps.ry}
                            fill="none"
                            stroke={color}
                            strokeWidth={lineWidth}
                            opacity="0.7"
                        />
                    )}
                    {isDrawing && tool === 'line' && previewShapeProps && (
                        <line
                            x1={previewShapeProps.x1}
                            y1={previewShapeProps.y1}
                            x2={previewShapeProps.x2}
                            y2={previewShapeProps.y2}
                            stroke={color}
                            strokeWidth={lineWidth}
                            strokeLinecap="round"
                            opacity="0.7"
                        />
                    )}

                    {/* レーザーポインターのアノテーション/カーソル (省略) */}
                    {tool === 'laser' && isLaserAnnotationActive && laserAnnotationPoints.length > 1 && (
                        <polyline
                            points={laserAnnotationPoints.map(p =>
                                // ⭐️ Y座標の非正規化を height 基準に戻す
                                `${denormalize(p.x, canvasSize.width)},${denormalize(p.y, canvasSize.height)}`
                            ).join(' ')}
                            fill="none"
                            stroke="#ff4136"
                            strokeWidth={5}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            opacity="0.8"
                        />
                    )}

                    {mousePos && (tool === 'pen' || tool === 'eraser' || tool === 'laser' || tool === 'text') && (
                        <circle
                            cx={mousePos.x}
                            cy={mousePos.y}
                            r={tool === 'laser' ? 8 : (tool === 'text' ? lineWidth * 5 : lineWidth * 0.5 + 5)}
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

                    {mousePos && tool === 'laser' && isLaserAnnotationActive && (
                        <circle
                            cx={mousePos.x}
                            cy={mousePos.y}
                            r={12}
                            fill="none"
                            stroke="#ff4136"
                            strokeWidth={2}
                            opacity={0.8}
                            pointerEvents="none"
                        >
                            <animate attributeName="r" values="12; 18; 12" dur="0.3s" begin="mousedown" fill="freeze" />
                            <animate attributeName="opacity" values="0.8; 0; 0.8" dur="0.3s" begin="mousedown" fill="freeze" />
                        </circle>
                    )}
                </svg>
            </div>
        </div>
    );
};