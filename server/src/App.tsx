import React, { useState, useEffect } from 'react';
import {
    WhiteboardReceiver,
    WhiteboardObject,
    Point,
    RectangleObject,
    PenObject,
    TextObject,
    CircleObject, // シミュレーションデータに使用するためインポート
    parseWhiteboardData
} from './whiteboardRecviver'; // WhiteboardReceiverをインポート

// peerjs
import { DataConnection, Peer } from "peerjs";

/**
 * デモ用メインアプリ (データのシミュレーションとReceiverの配置)
 */
export default function App(): React.ReactElement {

    const [objects, setObjects] = useState<WhiteboardObject[]>([]);
    const [laserPos, setLaserPos] = useState<Point | null>(null);

    // コネクション
    const [dataConnection, setDataConnection] = useState<DataConnection | null>(null);

    // 初期化関数
    // 初期化を検知するフラグ
    const [loading, setLoading] = React.useState(true);

    // コンポーネントの初期化時にのみサービスを呼び出します
    React.useEffect(() => {
        // すでに初期化されていた場合は処理を抜けます
        if (!loading) {
            return;
        }

        console.log("🎉 初期化処理実行!");

        // 初期化処理を実行します
        const mainPeer = new Peer(crypto.randomUUID());

        // コネクションを開始します
        const DataConn = mainPeer.connect("21061bed-4d7c-4a92-a905-2a1b884480b2");

        DataConn.on('open', function () {
            console.log('Connected to server');
            // here you have conn.id
            DataConn.send('hi!');
        });

        // 受信処理
        DataConn.on('data', function (data) {
            console.log('Received: ', data);

            // ここで受信したデータを処理します
            const parsedData = parseWhiteboardData(data as string);

            setObjects(parsedData);
        });

        // コネクションを保持
        setDataConnection(DataConn);

        // 初期化済みのフラグを立てます
        setLoading(false);
    }, [loading]);


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