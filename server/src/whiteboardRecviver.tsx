import React, { useState, useRef, useEffect, useMemo } from 'react';

/**
 * 共通型定義
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

// 描画関連の定数
const OBJECT_TYPES = {
    PEN: 'pen',
    RECTANGLE: 'rectangle',
    CIRCLE: 'circle',
    LINE: 'line',
    IMAGE: 'image',
    TEXT: 'text'
} as const;

/**
 * 共通ヘルパー関数
 */
// 正規化された座標から絶対座標への変換
const denormalize = (value: number, dimension: number): number => value * dimension;

// 型ガード (RenderObjectでのみ使用)
// const isText = (o: WhiteboardObject): o is TextObject => o.type === OBJECT_TYPES.TEXT;


/**
 * RenderObjectコンポーネント (描画ロジックの核)
 */
interface RenderObjectProps {
    obj: WhiteboardObject;
    canvasSize: { width: number; height: number };
    // 受信側では常に false/空関数を渡す
    isSelected: boolean;
    isEditing: boolean;
    onTextChange: (id: string, newText: string) => void;
    onTextBlur: (id: string) => void;
}

const RenderObject: React.FC<RenderObjectProps> = ({ obj, canvasSize }) => {
    const strokeWidth = obj.lineWidth;
    const commonProps = {
        opacity: 1,
        pointerEvents: "none" // 受信側なのでクリックイベントを無視
    };

    // 受信側では編集機能は不要だが、TextObjectの参照は必要
    const textObject = obj.type === OBJECT_TYPES.TEXT ? (obj as TextObject) : null;

    switch (obj.type) {
        case OBJECT_TYPES.PEN:
            const penObj = obj as PenObject;
            const polylinePoints = penObj.points.map(p =>
                `${denormalize(p.x, canvasSize.width)},${denormalize(p.y, canvasSize.height)}`
            ).join(' ');

            return (
                <polyline
                    points={polylinePoints}
                    fill="none"
                    stroke={penObj.color}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    {...commonProps}
                />
            );

        case OBJECT_TYPES.TEXT:
            if (!textObject) return null;

            const textX = denormalize(textObject.x, canvasSize.width);
            const textY = denormalize(textObject.y, canvasSize.height);

            // 受信側なので編集モードは表示しない
            const textPreview = textObject.text || 'テキストを入力...';

            return (
                <text
                    x={textX}
                    y={textY}
                    fontSize={textObject.fontSize}
                    fill={textObject.color}
                    dominantBaseline="text-before-edge"
                    {...commonProps}
                >
                    {textPreview}
                </text>
            );

        case OBJECT_TYPES.RECTANGLE:
            const rectObj = obj as RectangleObject;
            const rectProps = {
                x: denormalize(rectObj.x, canvasSize.width),
                y: denormalize(rectObj.y, canvasSize.height),
                width: denormalize(rectObj.width, canvasSize.width),
                height: denormalize(rectObj.height, canvasSize.height),
                rx: "2"
            };
            return (
                <rect
                    {...rectProps}
                    fill="none"
                    stroke={rectObj.color}
                    strokeWidth={strokeWidth}
                    {...commonProps}
                />
            );

        case OBJECT_TYPES.CIRCLE:
            const circleObj = obj as CircleObject;
            const circleProps = {
                cx: denormalize(circleObj.x, canvasSize.width),
                cy: denormalize(circleObj.y, canvasSize.height),
                rx: denormalize(circleObj.rx, canvasSize.width),
                ry: denormalize(circleObj.ry, canvasSize.height),
            };
            return (
                <ellipse
                    {...circleProps}
                    fill="none"
                    stroke={circleObj.color}
                    strokeWidth={strokeWidth}
                    {...commonProps}
                />
            );

        case OBJECT_TYPES.LINE:
            const lineObj = obj as LineObject;
            const lineProps = {
                x1: denormalize(lineObj.x1, canvasSize.width),
                y1: denormalize(lineObj.y1, canvasSize.height),
                x2: denormalize(lineObj.x2, canvasSize.width),
                y2: denormalize(lineObj.y2, canvasSize.height),
            };
            return (
                <line
                    {...lineProps}
                    stroke={lineObj.color}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    {...commonProps}
                />
            );

        case OBJECT_TYPES.IMAGE:
            const imageObj = obj as ImageObject;
            const imageProps = {
                x: denormalize(imageObj.x, canvasSize.width),
                y: denormalize(imageObj.y, canvasSize.height),
                width: denormalize(imageObj.width, canvasSize.width),
                height: denormalize(imageObj.height, canvasSize.height),
                href: imageObj.src,
            };
            return (
                <image
                    {...imageProps}
                    {...commonProps}
                />
            );

        default:
            return null;
    }
};


/**
 * WhiteboardReceiver コンポーネント
 * (受信データの描画とキャンバス管理のみを行う)
 */
interface WhiteboardReceiverProps {
    receivedObjects: WhiteboardObject[];
    laserPointerPos: Point | null; // 正規化座標
}

export const WhiteboardReceiver: React.FC<WhiteboardReceiverProps> = ({
    receivedObjects,
    laserPointerPos
}) => {
    const canvasRef = useRef<SVGSVGElement | null>(null);
    const [canvasSize, setCanvasSize] = useState<{ width: number, height: number }>({ width: 800, height: 600 });

    // キャンバスサイズを親コンテナに合わせて設定
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

    const absoluteLaserPos = useMemo(() => {
        if (!laserPointerPos || laserPointerPos.x < 0 || laserPointerPos.y < 0) return null;
        return {
            x: denormalize(laserPointerPos.x, canvasSize.width),
            y: denormalize(laserPointerPos.y, canvasSize.height)
        };
    }, [laserPointerPos, canvasSize]);

    return (
        // 絶対配置で全画面に広げ、ビデオの上に重ねる
        <div className="absolute inset-0 z-10 flex flex-col">
            <div className="flex-1">
                <svg
                    ref={canvasRef}
                    // 背景を透明にするため、背景色やボーダーを削除
                    className="w-full h-full"
                >
                    {/* 既存オブジェクトの描画 */}
                    {receivedObjects.map(obj => (
                        <RenderObject
                            key={obj.id}
                            obj={obj}
                            canvasSize={canvasSize}
                            isSelected={false}
                            isEditing={false}
                            onTextChange={() => { }}
                            onTextBlur={() => { }}
                        />
                    ))}

                    {/* レーザーポインターの描画 */}
                    {absoluteLaserPos && (
                        <circle
                            cx={absoluteLaserPos.x}
                            cy={absoluteLaserPos.y}
                            r={10}
                            fill="#ff4136"
                            opacity={0.8}
                            pointerEvents="none"
                        >
                            {/* アニメーションを付けて目立たせる */}
                            <animate attributeName="r" values="10; 12; 10" dur="0.8s" repeatCount="indefinite" />
                            <animate attributeName="opacity" values="0.8; 0.6; 0.8" dur="0.8s" repeatCount="indefinite" />
                        </circle>
                    )}
                </svg>
            </div>
        </div>
    );
};

/**
 * 受信データ処理ヘルパー関数
 */

/**
 * JSON文字列をパースし、WhiteboardObject[]の型として返す
 * @param jsonData 受信したホワイトボードオブジェクトのJSON文字列
 * @returns 描画オブジェクトの配列
 */
export const parseWhiteboardData = (jsonData: string): WhiteboardObject[] => {
    try {
        const parsedData = JSON.parse(jsonData);

        // JSON.parseの結果が配列であることを確認
        if (!Array.isArray(parsedData)) {
            console.error("Parse Error: Received data is not an array.", parsedData);
            return [];
        }

        // 型チェック（簡易的なチェック。より厳密なバリデーションが必要な場合はライブラリ推奨）
        const validObjects = parsedData.filter((obj) => {
            // 必須プロパティ 'id' と 'type' が存在するかをチェック
            return obj && typeof obj.id === 'string' && typeof obj.type === 'string' &&
                Object.values(OBJECT_TYPES).includes(obj.type);
        }) as WhiteboardObject[]; // フィルタリングされた後のオブジェクトは WhiteboardObject[] と見なす

        return validObjects;

    } catch (e) {
        console.error("Failed to parse whiteboard JSON data:", e);
        return [];
    }
};