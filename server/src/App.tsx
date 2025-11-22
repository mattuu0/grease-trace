import React, { useState, useEffect, useRef } from 'react';
import {
    WhiteboardReceiver,
    WhiteboardObject,
    Point,
} from './whiteboardRecviver'; // WhiteboardReceiverをインポート

// peerをインポート
import { connectRemote, connectStream, getPeer } from './utils/peer';
import { availableMonitors, getCurrentWindow, LogicalPosition, LogicalSize } from '@tauri-apps/api/window';
import { getCurrent } from '@tauri-apps/plugin-deep-link';;

// 画面の選択を待っているか
let waitSelectScreen = false;

// 現在のストリームを保持する変数
let currentStream: MediaStream | null = null;

// 接続状態の型定義
type ConnectionStatus = "unconnected" | "connecting" | "connected" | "error" | "confirming";

/**
 * "screen:0:0" のような文字列を解析して、モニター番号を取得します。
 * モニター番号は、2番目のコロンの前の数値部分と想定します。
 * * @param screenString 解析対象の文字列 (例: "screen:0:0")
 * @returns モニター番号 (数値)。解析できない場合は null を返します。
 */
function getMonitorNumber(screenString: string): number | null {
    // 1. 文字列をコロン (":") で分割します。
    // 例: "screen:0:0" -> ["screen", "0", "0"]
    const parts = screenString.split(':');

    // 2. 配列の長さが3以上で、モニター番号に相当する部分 (インデックス1) が存在するかチェックします。
    // インデックス0: "screen"
    // インデックス1: "0" (モニター番号)
    // インデックス2: "0" (x座標など)
    if (parts.length > 1) {
        // 3. インデックス1の文字列を数値に変換します。
        const monitorNumberStr = parts[1];
        const monitorNumber = parseInt(monitorNumberStr, 10);

        // 4. 数値に正常に変換されたかチェックし、結果を返します。
        // isNaN(monitorNumber) は、parseIntが失敗した場合 (例: "screen:A:0") に true を返します。
        if (!isNaN(monitorNumber)) {
            return monitorNumber;
        }
    }

    // 解析に失敗した場合
    return null;
}

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

        // トラックの情報取得
        const videoTrack = stream.getVideoTracks()[0];
        const settings = videoTrack.getSettings();

        console.log("🎉 トラック情報:", settings);

        // モニター番号取得
        const monitorIndex = getMonitorNumber(settings.deviceId!);

        console.log("🎉 モニター番号:", monitorIndex);

        // ウィンドウを移動
        if (monitorIndex != null) {
            // モニターに移動
            await moveToMonitor(monitorIndex!);
        }

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


// moveToMonitor
// 指定した番号のモニターに移動する
async function moveToMonitor(monitorNumber: number) {
    // ウィンドウを取得
    const CurrentWindow = getCurrentWindow();

    // モニター情報を取得
    const monitors = await availableMonitors();
    const monitor = monitors[monitorNumber];

    if (!monitor) {
        return;
    }

    // ウィンドウを移動
    CurrentWindow.setSize(new LogicalSize(monitor?.size.width!, monitor?.size.height!));
    CurrentWindow.setPosition(new LogicalPosition(monitor?.position.x!, monitor?.position.y!));
}

function ShareScreenToRemote(remotePeerId: string) {

    // 画面共有を取得
    ShareScreen().then((stream) => {
        if (!stream) {
            return;
        }

        // マウスイベント除外を有効化
        getCurrentWindow().setIgnoreCursorEvents(true);
        
        // ストリームを送信
        connectStream(remotePeerId, stream);

        stream.getVideoTracks()[0].addEventListener("ended", () => {
            // マウスイベント除外を無効化
            getCurrentWindow().setIgnoreCursorEvents(false);

            // 終了したとき再度要求する
            ShareScreenToRemote(remotePeerId);
        });

        // トラックの情報取得
        const videoTrack = stream.getVideoTracks()[0];
        const settings = videoTrack.getSettings();

        // モニター番号取得
        const monitorIndex = getMonitorNumber(settings.deviceId!);
        // ウィンドウを移動
        if (monitorIndex) {
            moveToMonitor(monitorIndex!);
        }
    });
}

export default function App(): React.ReactElement {

    const [objects, setObjects] = useState<WhiteboardObject[]>([]);
    const [laserPos, setLaserPos] = useState<Point | null>(null);
    const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("unconnected");
    const [manualPeerId, setManualPeerId] = useState("");
    const [pendingPeerId, setPendingPeerId] = useState<string | null>(null);

    const [laserAnnotationPoints, setLaserAnnotationPoints] = useState<Point[]>([]);
    const [laserClickPos, setLaserClickPos] = useState<Point & { timestamp: number } | null>(null);
    
    // ⭐️ 追加: リモート画面のアスペクト比を管理するState (デフォルト 16:9)
    const [remoteAspectRatio, setRemoteAspectRatio] = useState<number>(16 / 9);

    // 初期化関数
    // 初期化を検知するフラグ
    const [loading, setLoading] = React.useState(true);

    const connectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    async function Init() {
        // デスクトップ0番に移動
        await moveToMonitor(0);
    }

    // Peer IDを使用して接続を開始する関数
    const connectToPeer = (remotePeerId: string | null) => {
        if (!remotePeerId) {
            return;
        }
        console.log("🎉 Connecting to peer:", remotePeerId);
        setConnectionStatus("connecting");

        // 接続タイムアウトを設定 (10秒)
        connectionTimeoutRef.current = setTimeout(() => {
            setConnectionStatus((currentStatus) => {
                if (currentStatus === "connecting") {
                    console.error("🎉 接続がタイムアウトしました。");
                    return "error";
                }
                return currentStatus;
            });
        }, 10000);

        const clearConnectionTimeout = () => {
            if (connectionTimeoutRef.current) {
                clearTimeout(connectionTimeoutRef.current);
                connectionTimeoutRef.current = null;
            }
        };

        const connection = connectRemote(remotePeerId);

        connection.on("open", () => {
            clearConnectionTimeout();
            console.log("🎉 接続成功!");
            setConnectionStatus("connected");
            // 接続が成功したらマウスイベントを無視する
            getCurrentWindow().setIgnoreCursorEvents(false);
            ShareScreenToRemote(remotePeerId);
        });

        connection.on("data", (data: any) => {
            console.log("🎉 データ受信!");
            try {
                const parsedData = JSON.parse(data);

                // ⭐️ 追加: アスペクト比が含まれていれば更新
                if (parsedData.aspect_ratio) {
                    setRemoteAspectRatio(parsedData.aspect_ratio);
                }

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
            } catch (e) {
                console.error("JSON Parse Error", e);
            }
        });

        const stopScreenShare = () => {
            if (currentStream) {
                currentStream.getTracks().forEach(track => track.stop());
                currentStream = null;
                console.log("🎉 画面共有を停止しました");
            }
            // 接続が切れたらマウスイベントを再度有効にする
            getCurrentWindow().setIgnoreCursorEvents(false);
            setObjects([]);
            setLaserPos(null);
            setLaserAnnotationPoints([]);
            setLaserClickPos(null);
        };

        connection.on("error", (err) => {
            clearConnectionTimeout();
            console.error("🎉 接続エラー:", err);
            setConnectionStatus("error");
            stopScreenShare();
            // 3秒後に自動的に接続画面に戻る
            setTimeout(() => {
                setConnectionStatus("unconnected");
            }, 3000);
        });

        connection.on("close", () => {
            clearConnectionTimeout();
            console.log("🎉 接続がクローズされました");
            setConnectionStatus("unconnected");
            stopScreenShare();
        });
    };

    // ディープリンクを処理する関数
    const handleDeepLink = (url: string) => {
        console.log("🎉 Deep link received:", url);
        const peerIdMatch = url.match(/connect\/([^/]+)/);
        if (peerIdMatch && peerIdMatch[1]) {
            setPendingPeerId(peerIdMatch[1]);
            setConnectionStatus("confirming");
        }
    };

    // コンポーネントの初期化時にのみサービスを呼び出します
    useEffect(() => {
        if (!loading) {
            return;
        }
        setLoading(false);

        console.log("🎉 初期化処理実行!");
        Init();

        // peerを初期化
        const peer = getPeer();

        // PeerJSサーバーから切断されたときの処理
        peer.on('disconnected', () => {
            console.log('🎉 PeerJSサーバーから切断されました。');
            setConnectionStatus('unconnected');
        });


        // アプリケーション起動時のディープリンクを処理
        getCurrent().then((urls: string[] | null) => {
            if (urls && urls.length > 0) {
                handleDeepLink(urls[0]);
            }
        });
    }, [loading]);


    return (
        <div className="relative w-screen h-screen overflow-hidden bg-transparent">
            {connectionStatus !== "connected" && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-gray-200">
                    <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-xl shadow-lg">
                        <h1 className="text-3xl font-bold text-center text-gray-800">grease-trace</h1>

                        {connectionStatus === "unconnected" && (
                            <div className="flex flex-col items-center space-y-4">
                                <p className="text-lg text-gray-600">IDを入力して接続してください</p>
                                <input
                                    type="text"
                                    value={manualPeerId}
                                    onChange={(e) => setManualPeerId(e.target.value)}
                                    className="w-full px-4 py-3 text-lg text-center text-gray-700 bg-gray-100 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                                    placeholder="相手のIDを入力"
                                />
                                <div className="flex w-full gap-4">
                                    <button
                                        onClick={() => connectToPeer(manualPeerId)}
                                        className="w-full px-6 py-3 text-lg font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-transform transform hover:scale-105"
                                    >
                                        接続
                                    </button>
                                    <button
                                        onClick={() => {
                                            console.log("🎉 閉じる");
                                            getCurrentWindow().close();
                                        }}
                                        className="w-full px-6 py-3 text-lg font-bold text-white bg-red-600 rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-transform transform hover:scale-105"
                                    >
                                        閉じる
                                    </button>
                                </div>
                            </div>
                        )}

                        {connectionStatus === "confirming" && (
                            <div className="text-center space-y-4">
                                <p className="text-lg text-gray-700">以下のIDから接続要求があります:</p>
                                <p className="text-lg font-mono bg-gray-100 p-2 rounded break-all">{pendingPeerId}</p>
                                <p className="text-lg text-gray-700">接続しますか？</p>
                                <div className="flex w-full gap-4 pt-2">
                                    <button
                                        onClick={() => connectToPeer(pendingPeerId)}
                                        className="w-full px-6 py-3 text-lg font-bold text-white bg-green-600 rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-transform transform hover:scale-105"
                                    >
                                        承認
                                    </button>
                                    <button
                                        onClick={() => {
                                            setConnectionStatus("unconnected");
                                            setPendingPeerId(null);
                                        }}
                                        className="w-full px-6 py-3 text-lg font-bold text-white bg-red-600 rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-transform transform hover:scale-105"
                                    >
                                        拒否
                                    </button>
                                </div>
                            </div>
                        )}

                        {connectionStatus === "connecting" && (
                            <div className="text-center">
                                <p className="text-xl text-gray-700">接続中...</p>
                                <div className="mt-4 w-16 h-16 mx-auto border-4 border-blue-500 border-solid rounded-full animate-spin border-t-transparent"></div>
                                <p className="text-gray-600 mt-4">10秒以内に接続できない場合は、<br/>自動的に前の画面に戻ります。</p>
                            </div>
                        )}

                        {connectionStatus === "error" && (
                            <div className="text-center">
                                <p className="text-xl text-red-500">接続エラーが発生しました。</p>
                                <p className="text-gray-600 mt-2">IDを確認して再度お試しください。</p>
                                <button
                                    onClick={() => setConnectionStatus("unconnected")}
                                    className="mt-4 px-6 py-3 text-lg font-bold text-white bg-gray-600 rounded-lg hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-transform transform hover:scale-105"
                                >
                                    戻る
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}


            {/* 受信専用ホワイトボードを重ねる */}
            <WhiteboardReceiver
                receivedObjects={objects}
                laserPointerPos={laserPos}
                laserAnnotationPoints={laserAnnotationPoints}
                laserClickPos={laserClickPos}
                // ⭐️ 追加: アスペクト比を渡す
                remoteAspectRatio={remoteAspectRatio}
            />
        </div>
    );
}
