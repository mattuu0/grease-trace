import React, { useState } from 'react';
import {
    WhiteboardReceiver,
    WhiteboardObject,
    Point,
} from './whiteboardRecviver'; // WhiteboardReceiverをインポート

// peerをインポート
import { connectRemote, connectStream } from './utils/peer';
import { currentMonitor, getCurrentWindow, LogicalPosition, LogicalSize } from '@tauri-apps/api/window';

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
        // マウスの除外を解除
        getCurrentWindow().setIgnoreCursorEvents(false);

        // ストリームを取得
        const stream = await navigator.mediaDevices.getDisplayMedia({
            video: {
                displaySurface: 'monitor' // モニター全体を優先
            },
            audio: false
        });

        // マウスを除外する
        getCurrentWindow().setIgnoreCursorEvents(true);

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
        // not allowedの場合
        if (error instanceof Error) {
            // ユーザーがマイクアクセスを許可していない場合
            if (error.name === "NotAllowedError") {
                // アプリを落とす
                getCurrentWindow().close();
                return null;
            }
        }

        // マウスを除外する
        getCurrentWindow().setIgnoreCursorEvents(true);

        console.log(error);

        waitSelectScreen = false;

        return null;
    }
}

function ShareScreenToRemote() {

    // 画面共有を取得
    ShareScreen().then((stream) => {
        if (!stream) {
            return;
        }

        // ストリームを送信
        connectStream("21061bed-4d7c-4a92-a905-2a1b884480b2", stream);

        stream.getVideoTracks()[0].addEventListener("ended", () => {
            // 終了したとき再度要求する
            ShareScreenToRemote();
        })
    });
}

export default function App(): React.ReactElement {

    const [objects, setObjects] = useState<WhiteboardObject[]>([]);
    const [laserPos, setLaserPos] = useState<Point | null>(null);

    // ⭐️ 追加: レーザーアノテーションの座標を保持
    const [laserAnnotationPoints, setLaserAnnotationPoints] = useState<Point[]>([]);
    // ⭐️ 追加: レーザーがクリックされた位置とタイムスタンプを保持
    const [laserClickPos, setLaserClickPos] = useState<Point & { timestamp: number } | null>(null);

    // 初期化関数
    // 初期化を検知するフラグ
    const [loading, setLoading] = React.useState(true);

    async function Init() {
        // マウスを除外する
        getCurrentWindow().setIgnoreCursorEvents(true);

        // ウィンドウを取得
        const CurrentWindow = getCurrentWindow();
        const monitor = await currentMonitor();
        CurrentWindow.setSize(new LogicalSize(monitor?.size.width!, monitor?.size.height!));
        CurrentWindow.setPosition(new LogicalPosition(monitor?.position.x!, monitor?.position.y!));
    }

    // コンポーネントの初期化時にのみサービスを呼び出します
    React.useEffect(() => {
        // すでに初期化されていた場合は処理を抜けます
        if (!loading) {
            return;
        }

        console.log("🎉 初期化処理実行!");

        // 初期化実行
        Init();

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
                } else if (parsedData["op_type"] == "add") {
                    // jsonにパース
                    // 型チェック（簡易的なチェック。より厳密なバリデーションが必要な場合はライブラリ推奨）
                    const validObjects = [parsedData.data] as WhiteboardObject[]; // フィルタリングされた後のオブジェクトは WhiteboardObject[] と見なす

                    console.log(validObjects);

                    // データをセット (新規で追加)
                    setObjects((prevObjects) => [...prevObjects, ...validObjects]);
                } else if (parsedData["op_type"] == "laser_move") {
                    setLaserPos({
                        x: parsedData["data"]["x"],
                        y: parsedData["data"]["y"]
                    });
                    // ⭐️ 修正: アノテーション座標を受信してセット
                    setLaserAnnotationPoints(parsedData["data"]["annotation"] || []);
                    return;

                } else if (parsedData["op_type"] == "laser_click") {
                    // ⭐️ 追加: クリック位置とタイムスタンプをセット
                    setLaserClickPos({
                        x: parsedData["data"]["x"],
                        y: parsedData["data"]["y"],
                        timestamp: Date.now() // 受信タイミングでクリックアニメーションをトリガー
                    });
                    return;
                }
            }
        });

        connection.on("open", () => {
            console.log("🎉 接続コールバック実行!");

            // 画面を共有
            ShareScreenToRemote();
        });

        
        // 初期化済みのフラグを立てます
        setLoading(false);

    }, [loading]);


    return (
        <div className="relative w-screen h-screen overflow-hidden">
            {/* 受信専用ホワイトボードを重ねる */}
            <WhiteboardReceiver
                receivedObjects={objects}
                laserPointerPos={laserPos}
                // ⭐️ 追加: レーザーアノテーション座標を渡す
                laserAnnotationPoints={laserAnnotationPoints}
                // ⭐️ 追加: レーザークリック位置を渡す
                laserClickPos={laserClickPos}
            />
        </div>
    );
}