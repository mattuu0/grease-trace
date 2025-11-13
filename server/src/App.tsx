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

// peerをインポート
import { connectRemote, connectStream, getPeer } from './utils/peer';

// 画面の選択を待っているか
let waitSelectScreen = false;

// 現在のストリームを保持する変数
let currentStream: MediaStream | null = null;

// 画面共有を取得する関数
async function ShareScreen() {
    // もしストリームがあるときそれを返す
    if (currentStream) {
        return currentStream;
    }

    // 画面選択待ち中なら待つ
    if (waitSelectScreen) {
        return null;
    }

    // 画面を共有している
    waitSelectScreen = true;

    try {
        // ストリームを取得
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });

        // 画面選択待ちを解除
        waitSelectScreen = false;

        // 現在のストリームを更新
        currentStream = stream;

        // イベント設定
        stream.getVideoTracks()[0].addEventListener("ended", () => {
            currentStream = null;
        });

        return stream;
    } catch (error) {
        console.log(error);

        waitSelectScreen = false;

        return null;
    }
}

export default function App(): React.ReactElement {

    const [objects, setObjects] = useState<WhiteboardObject[]>([]);
    const [laserPos, setLaserPos] = useState<Point | null>(null);

    // 初期化関数
    // 初期化を検知するフラグ
    const [loading, setLoading] = React.useState(true);

    // コンポーネントの初期化時にのみサービスを呼び出します
    React.useEffect(() => {
        // すでに初期化されていた場合は処理を抜けます
        if (!loading) {
            return;
        }

        // 初期化済みのフラグを立てます
        setLoading(false);

        console.log("🎉 初期化処理実行!");

        // 接続
        const connection = connectRemote("21061bed-4d7c-4a92-a905-2a1b884480b2");

        // コールバックを設定
        connection.on("data", (data: any) => {
            console.log("🎉 受信コールバック実行!");
            
            // jsonに変換
            const parsedData = JSON.parse(data);

            console.log(parsedData);

            // operation の時
            if (parsedData["type"] == "operation") {
                // 削除の時
                if (parsedData["op_type"] == "delete") {
                    // 削除するオブジェクトを探す
                    setObjects((prevObjects) => prevObjects.filter((object) => object.id != parsedData["data"]["id"]));
                    return;
                } else if (parsedData["op_type"] == "update") {
                    // オブジェクトを送信
                    setObjects((prevObjects) => prevObjects.map((object) => object.id == parsedData["data"]["id"] ? parsedData["data"] : object));
                    return;
                } 

                // jsonにパース
                // 型チェック（簡易的なチェック。より厳密なバリデーションが必要な場合はライブラリ推奨）
                const validObjects = [parsedData.data] as WhiteboardObject[]; // フィルタリングされた後のオブジェクトは WhiteboardObject[] と見なす

                console.log(validObjects);

                // データをセット (新規で追加)
                setObjects((prevObjects) => [...prevObjects, ...validObjects]);
            }
        });

        connection.on("open", () => {
            console.log("🎉 接続コールバック実行!");

            // 画面共有を取得
            ShareScreen().then((stream) => {
                if (!stream) {
                    return;
                }

                // ストリームを送信
                connectStream("21061bed-4d7c-4a92-a905-2a1b884480b2", stream);
            });
        });

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