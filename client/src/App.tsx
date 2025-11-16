import React, { useCallback, useMemo } from 'react';
import { WhiteboardSender } from './WhiteboardSender'; // WhiteboardSenderをインポート
import {getPeer,getPeerConnection,setPeerConnection} from "./utils/peer"
import type { DataConnection, MediaConnection } from 'peerjs';

/**
 * デモ用メインアプリ
 */
export default function App(): React.ReactElement {
    // ビデオタグの参照
    const videoRef = React.useRef<HTMLVideoElement>(null);

    // 画面が共有されているか
    const [isScreenShared, setIsScreenShared] = React.useState(false);

    // 受信したMediaStream
    const [mediaStream, setMediaStream] = React.useState<MediaStream | null>(null);

    // 初期化処理
    // 初期化を検知するフラグ
    const [loading, setLoading] = React.useState(true);

    // 自身のPeerID
    const [myPeerId, setMyPeerId] = React.useState<string | null>(null);

    // 接続中の相手のID
    const [connectedPeerId, setConnectedPeerId] = React.useState<string | null>(null);

    // コンポーネントの初期化時にのみサービスを呼び出します
    React.useEffect(() => {
        // すでに初期化されていた場合は処理を抜けます
        if (!loading) {
            return;
        }

        // 初期化済みのフラグを立てます
        setLoading(false);

        // peerを初期化
        const mainPeer = getPeer();

        // peerサーバへの接続が完了した際にpeerIDを設定
        mainPeer.on("open", (id: string) => {
            console.log("🎉 peer open!", id);
            setMyPeerId(id);
        });

        // peer接続
        mainPeer.on("connection", (conn: DataConnection) => {
            console.log("🎉 peer接続成功!");

            console.log(conn.peer);

            // 接続中の相手のID
            setConnectedPeerId(conn.peer);
            
            // 接続情報を保存
            setPeerConnection(conn.peer, conn);
        });

        // mediacall が来た時の処理
        mainPeer.on("call", (call: MediaConnection) => {
            call.on("stream", (stream: MediaStream) => {
                console.log("🎉 mediacall stream!");

                // MediaStreamをstateに設定
                setMediaStream(stream);

                // 画面を共有している
                setIsScreenShared(true);

                // 接続中の相手のID
                setConnectedPeerId(call.peer);
            })

            call.on("close", () => {
                console.log("🎉 mediacall close!");
                setIsScreenShared(false);
                setMediaStream(null); // ストリームをクリア
            })

            console.log("🎉 mediacall!");
            call.answer();
        });

    }, [loading]);

    // mediaStreamが変更されたときにvideo要素に割り当てる
    React.useEffect(() => {
        if (videoRef.current) {
            videoRef.current.srcObject = mediaStream;
        }
    }, [mediaStream]);

    // カスタム切断処理のコールバック
    const myCustomDisconnect = useCallback(() => {
        console.log("🔥 カスタム切断処理実行!");
        // alert("🎉 カスタム切断処理が実行されました！");

        // リロードする
        window.location.reload();
    }, []);

    const initialSettings = useMemo(() => ({
        initialToolLockState: true,
        onDisconnectCallback: myCustomDisconnect
    }), [myCustomDisconnect]);

    const updateCallback = (jsonString: string) => {
        console.log("🎉 更新コールバック実行!");
        console.log(jsonString);

        // 画面が共有されている場合データを送信する
        if (isScreenShared) {
            console.log("🎉 画面が共有されているのでデータを送信します!");

            // 接続中の相手のIDがない場合は処理を抜けます
            if (!connectedPeerId) {
                console.log("🎉 接続中の相手のIDがありません!");
                return;
            }

            // 相手の接続情報を取得
            const remoteConnection = getPeerConnection(connectedPeerId);

            // 相手の接続情報がない場合は処理を抜けます
            if (!remoteConnection) {
                console.log("🎉 相手の接続情報がありません!");
                return;
            }

            // データを送信
            remoteConnection.send(jsonString);
        }
    }

    // 共有が開始されていない場合は待機画面を表示
    if (!isScreenShared) {
        const url = `whiteboard-app://connect/${myPeerId}`;
        return (
            <div className="flex flex-col items-center justify-center w-screen h-screen bg-gray-100">
                <h1 className="text-2xl font-bold mb-4">接続待機中...</h1>
                <p className="mb-2">以下のIDを共有してください:</p>
                <input
                    type="text"
                    readOnly
                    value={myPeerId || "IDを生成中..."}
                    className="p-2 border rounded w-80 text-center"
                />
                {myPeerId && (
                    <div className="mt-4">
                        <p className="mb-2">または、以下のリンクをクリックしてもらってください:</p>
                        <a href={url} className="text-blue-500 hover:underline break-all">
                            {url}
                        </a>
                    </div>
                )}
            </div>
        );
    }

    return (
        // 親コンテナを相対位置、全画面に設定
        <div className="relative w-screen h-screen overflow-hidden">

            {/* 全画面ビデオタグ (背景) */}
            <video
                ref={videoRef} // refを再設定
                autoPlay
                loop
                muted
                playsInline
                style={{ display: isScreenShared ? 'block' : 'none' }} // isScreenSharedで表示/非表示を切り替え

                // 動画のサイズをフィット
                // 絶対配置で全画面に広げ、オブジェクトフィットでカバー
                className="absolute inset-0 w-full h-full object-fill"
            />

            {/* ホワイトボード (ビデオの上に絶対配置で重ねる) */}
            <WhiteboardSender
                initialToolLockState={initialSettings.initialToolLockState}
                onDisconnectCallback={initialSettings.onDisconnectCallback}
                onUpdateCallback={updateCallback}
            />
        </div>
    );
}