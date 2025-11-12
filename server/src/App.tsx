import React, { useState, useEffect } from 'react';
import {
    WhiteboardReceiver,
    WhiteboardObject,
    Point,
    RectangleObject,
    PenObject,
    TextObject,
    CircleObject // シミュレーションデータに使用するためインポート
} from './whiteboardRecviver'; // WhiteboardReceiverをインポート
import { Peer } from "peerjs";

/**
 * デモ用メインアプリ (データのシミュレーションとReceiverの配置)
 */
export default function App(): React.ReactElement {

    const [objects, setObjects] = useState<WhiteboardObject[]>([]);
    const [laserPos, setLaserPos] = useState<Point | null>(null);

    // ⭐️ データ受信シミュレーション (本番環境ではWebSocketなどに置き換える)
    useEffect(() => {
        // ダミーの初期オブジェクトを設定
        const initialObjects: WhiteboardObject[] = [
            { id: '1', type: 'rectangle', color: '#1e3a8a', lineWidth: 5, x: 0.1, y: 0.1, width: 0.2, height: 0.3 } as RectangleObject,
            {
                id: '2', type: 'pen', color: '#b91c1c', lineWidth: 8, points: [
                    { x: 0.5, y: 0.5 }, { x: 0.55, y: 0.45 }, { x: 0.6, y: 0.5 }, { x: 0.65, y: 0.55 }
                ]
            } as PenObject,
            { id: '3', type: 'text', color: '#000000', lineWidth: 0, x: 0.7, y: 0.2, text: "受信専用デモ", fontSize: 30, width: 0.1, height: 0.05 } as TextObject
        ];
        setObjects(initialObjects);

        // レーザーポインター移動シミュレーション
        const moveLaser = (count: number) => {
            if (count > 200) return;
            const x = 0.3 + 0.1 * Math.sin(count * 0.1);
            const y = 0.7 + 0.1 * Math.cos(count * 0.1);
            setLaserPos({ x, y });
            // console.log(`Laser: (${x.toFixed(2)}, ${y.toFixed(2)})`);
            setTimeout(() => moveLaser(count + 1), 50);
        };

        const laserTimer = setTimeout(() => moveLaser(0), 100); // 遅延させて開始

        // 5秒後にオブジェクト追加をシミュレート
        const addObjTimer = setTimeout(() => {
            setObjects(prev => [
                ...prev,
                { id: '4', type: 'circle', color: '#059669', lineWidth: 3, x: 0.2, y: 0.75, rx: 0.08, ry: 0.08 } as CircleObject
            ]);
            // 8秒後にレーザーを非表示に (最初のsetTimeoutから8秒後)
            const hideLaserTimer = setTimeout(() => setLaserPos(null), 3000);
            return () => clearTimeout(hideLaserTimer);
        }, 5000);

        return () => {
            clearTimeout(laserTimer);
            clearTimeout(addObjTimer);
        };
    }, []);

    return (
        <div className="relative w-screen h-screen overflow-hidden">
            {/* 全画面ビデオタグ (背景) */}
            <video
                autoPlay
                loop
                muted
                playsInline
                className="absolute inset-0 w-full h-full object-cover"
                // TODO: 実際の動画URLに置き換えてください
                src="https://www.w3schools.com/tags/movie.mp4"
            />

            {/* 受信専用ホワイトボードを重ねる */}
            <WhiteboardReceiver
                receivedObjects={objects}
                laserPointerPos={laserPos}
            />
        </div>
    );
}