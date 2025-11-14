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
// ⭐️ 修正: denormalize は XとYで呼び出し元が dimension を使い分ける
const denormalize = (value: number, dimension: number): number => value * dimension;

// 型ガード (RenderObjectでのみ使用)
// const isText = (o: WhiteboardObject): o is TextObject => o.type === OBJECT_TYPES.TEXT;


/**
 * RenderObjectコンポーネント (描画ロジックの核) (修正)
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

    // ⭐️ アスペクト比の計算を削除

    // 受信側では編集機能は不要だが、TextObjectの参照は必要
    const textObject = obj.type === OBJECT_TYPES.TEXT ? (obj as TextObject) : null;

    switch (obj.type) {
        case OBJECT_TYPES.PEN:
            const penObj = obj as PenObject;
            const polylinePoints = penObj.points.map(p =>
                // ⭐️ Y座標の非正規化を height 基準に戻す
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
            // ⭐️ Y座標の非正規化を height 基準に戻す
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
                // ⭐️ Y座標の非正規化を height 基準に戻す
                y: denormalize(rectObj.y, canvasSize.height),
                width: denormalize(rectObj.width, canvasSize.width),
                // ⭐️ height の非正規化を height 基準に戻す
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
                // ⭐️ Y座標の非正規化を height 基準に戻す
                cy: denormalize(circleObj.y, canvasSize.height),
                rx: denormalize(circleObj.rx, canvasSize.width),
                // ⭐️ ry の非正規化を height 基準に戻す
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
                // ⭐️ Y座標の非正規化を height 基準に戻す
                y1: denormalize(lineObj.y1, canvasSize.height),
                x2: denormalize(lineObj.x2, canvasSize.width),
                // ⭐️ Y座標の非正規化を height 基準に戻す
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
                // ⭐️ Y座標の非正規化を height 基準に戻す
                y: denormalize(imageObj.y, canvasSize.height),
                width: denormalize(imageObj.width, canvasSize.width),
                // ⭐️ height の非正規化を height 基準に戻す
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
    // ⭐️ 追加: レーザーアノテーションの座標
    laserAnnotationPoints: Point[];
    // ⭐️ 追加: レーザークリック位置
    laserClickPos: Point & { timestamp: number } | null;
}

export const WhiteboardReceiver: React.FC<WhiteboardReceiverProps> = ({
    receivedObjects,
    laserPointerPos,
    laserAnnotationPoints, // ⭐️ 受け取り
    laserClickPos // ⭐️ 受け取り
}) => {
    const canvasRef = useRef<SVGSVGElement | null>(null);
    const [canvasSize, setCanvasSize] = useState<{ width: number, height: number }>({ width: 800, height: 600 });
    const [clickAnimationKey, setClickAnimationKey] = useState(0);

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

    // ⭐️ 追加: クリック位置が更新されたらアニメーションをトリガー
    useEffect(() => {
        if (laserClickPos) {
            // keyを更新することで、SVG要素が再マウントされアニメーションが再トリガーされる
            setClickAnimationKey(prev => prev + 1);
        }
    }, [laserClickPos]);


    // ⭐️ absoluteLaserPos の Y座標の計算を height 基準に戻す
    const absoluteLaserPos = useMemo(() => {
        if (!laserPointerPos || laserPointerPos.x < 0 || laserPointerPos.y < 0) return null;
        return {
            x: denormalize(laserPointerPos.x, canvasSize.width),
            // ⭐️ Y座標の非正規化を height 基準に戻す
            y: denormalize(laserPointerPos.y, canvasSize.height)
        };
    }, [laserPointerPos, canvasSize]); // ⭐️ 依存配列から aspectRatio を削除

    // ⭐️ 追加: absoluteLaserAnnotationPoints (アノテーションのピクセル座標)
    const absoluteLaserAnnotationPoints = useMemo(() => {
        return laserAnnotationPoints.map(p => ({
            x: denormalize(p.x, canvasSize.width),
            y: denormalize(p.y, canvasSize.height)
        }));
    }, [laserAnnotationPoints, canvasSize]);

    // ⭐️ 追加: absoluteLaserClickPos (クリックアニメーションのピクセル座標)
    const absoluteLaserClickPos = useMemo(() => {
        if (!laserClickPos) return null;
        return {
            x: denormalize(laserClickPos.x, canvasSize.width),
            y: denormalize(laserClickPos.y, canvasSize.height),
            timestamp: laserClickPos.timestamp // タイムスタンプはそのまま保持
        };
    }, [laserClickPos, canvasSize]);


    return (
        // 絶対配置で全画面に広げ、ビデオの上に重ねる
        <div className="absolute inset-0 z-10 flex flex-col">
            <div className="flex-1">
                <svg
                    ref={canvasRef}
                    // 背景を透明にするため、背景色やボーダーを削除
                    className="w-full h-full"
                >
                    {/* 既存オブジェクトの描画 (アスペクト比対応済み) */}
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

                    {/* ⭐️ 追加: レーザーポインターのアノテーションの描画 */}
                    {absoluteLaserAnnotationPoints.length > 1 && (
                        <polyline
                            points={absoluteLaserAnnotationPoints.map(p => `${p.x},${p.y}`).join(' ')}
                            fill="none"
                            stroke="#ff4136"
                            strokeWidth={5}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            opacity={0.8}
                            pointerEvents="none"
                        />
                    )}

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

                    {/* ⭐️ 追加: クリックアニメーションの描画 */}
                    {absoluteLaserClickPos && (
                        <circle
                            key={clickAnimationKey} // keyの変更でアニメーションを強制的に再実行
                            cx={absoluteLaserClickPos.x}
                            cy={absoluteLaserClickPos.y}
                            r={12}
                            fill="none"
                            stroke="#ff4136"
                            strokeWidth={2}
                            opacity={0.8}
                            pointerEvents="none"
                        >
                            {/* クリック時にrとopacityがアニメーションする */}
                            <animate attributeName="r" from="12" to="18" dur="0.3s" begin="0s" fill="freeze" />
                            <animate attributeName="opacity" from="0.8" to="0" dur="0.3s" begin="0s" fill="freeze" />
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
        let parsedData = JSON.parse(jsonData);

        // 型チェック（簡易的なチェック。より厳密なバリデーションが必要な場合はライブラリ推奨）
        const validObjects = [parsedData.data] as WhiteboardObject[]; // フィルタリングされた後のオブジェクトは WhiteboardObject[] と見なす

        return validObjects;

    } catch (e) {
        console.error("Failed to parse whiteboard JSON data:", e);
        return [];
    }
};