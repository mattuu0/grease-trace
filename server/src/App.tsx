import React, { useState, useEffect } from 'react';
import {
    WhiteboardReceiver,
    WhiteboardObject,
    Point,
} from './whiteboardRecviver'; // WhiteboardReceiverをインポート

// peerをインポート
import { connectRemote, connectStream, getPeer } from './utils/peer';
import { currentMonitor, getCurrentWindow, LogicalPosition, LogicalSize } from '@tauri-apps/api/window';
import { onDeepLink } from '@tauri-apps/api/deep-link';

// 画面の選択を待っているか
let waitSelectScreen = false;

// 現在のストリームを保持する変数
let currentStream: MediaStream | null = null;

// 接続状態の型定義
type ConnectionStatus = "unconnected" | "connecting" | "connected" | "error";


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

function ShareScreenToRemote(remotePeerId: string) {

    // 画面共有を取得
    ShareScreen().then((stream) => {
        if (!stream) {
            return;
        }

        // ストリームを送信
        connectStream(remotePeerId, stream);

        stream.getVideoTracks()[0].addEventListener("ended", () => {
            // 終了したとき再度要求する
            ShareScreenToRemote(remotePeerId);
        })
    });
}

export default function App(): React.ReactElement {

    const [objects, setObjects] = useState<WhiteboardObject[]>([]);
    const [laserPos, setLaserPos] = useState<Point | null>(null);
    const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("unconnected");

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
    useEffect(() => {
        if (!loading) {
            return;
        }
        setLoading(false);

        console.log("🎉 初期化処理実行!");
        Init();
        
        // peerを初期化
        getPeer();

        // ディープリンク経由の接続処理
        const unlisten = onDeepLink((url) => {
            console.log("🎉 Deep link received:", url);
            const peerIdMatch = url.match(/connect\/([^/]+)/);
            if (peerIdMatch && peerIdMatch[1]) {
                const remotePeerId = peerIdMatch[1];
                console.log("🎉 Connecting to peer:", remotePeerId);
                setConnectionStatus("connecting");

                const connection = connectRemote(remotePeerId);

                connection.on("open", () => {
                    console.log("🎉 接続成功!");
                    setConnectionStatus("connected");
                    ShareScreenToRemote(remotePeerId);
                });

                connection.on("data", (data: any) => {
                    console.log("🎉 データ受信!");
                    const parsedData = JSON.parse(data);
                    if (parsedData["type"] == "operation") {
                        if (parsedData["op_type"] == "delete") {
                            setObjects((prevObjects) => prevObjects.filter((object) => object.id != parsedData["data"]["id"]));
                        } else if (parsedData["op_type"] == "update") {
                            setObjects((prevObjects) => prevObjects.map((object) => object.id == parsedData["data"]["id"] ? parsedData["data"] : object));
                        } else if (parsedData["op_type"] == "add") {
                            const validObjects = [parsedData.data] as WhiteboardObject[];
                            setObjects((prevObjects) => [...prevObjects, ...validObjects]);
                        } else if (parsedData["op_type"] == "laser_move") {
                            setLaserPos({ x: parsedData["data"]["x"], y: parsedData["data"]["y"] });
                            setLaserAnnotationPoints(parsedData["data"]["annotation"] || []);
                        } else if (parsedData["op_type"] == "laser_click") {
                            setLaserClickPos({ x: parsedData["data"]["x"], y: parsedData["data"]["y"], timestamp: Date.now() });
                        }
                    }
                });

                connection.on("error", (err) => {
                    console.error("🎉 接続エラー:", err);
                    setConnectionStatus("error");
                });

                connection.on("close", () => {
                    console.log("🎉 接続がクローズされました");
                    setConnectionStatus("unconnected");
                    setObjects([]);
                    setLaserPos(null);
                    setLaserAnnotationPoints([]);
                    setLaserClickPos(null);
                });
            }
        });

        return () => {
            unlisten.then(f => f());
        };

    }, [loading]);


    return (
        <div className="relative w-screen h-screen overflow-hidden">
            {connectionStatus !== "connected" && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-gray-800 bg-opacity-90 text-white">
                    <h1 className="text-3xl font-bold mb-4">Whiteboard Screen Share</h1>
                    {connectionStatus === "unconnected" && <p className="text-xl">クライアントからの接続を待機しています...</p>}
                    {connectionStatus === "connecting" && <p className="text-xl">接続中...</p>}
                    {connectionStatus === "error" && <p className="text-xl text-red-500">接続エラーが発生しました。</p>}
                </div>
            )}
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