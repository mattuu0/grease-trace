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

    // 初期化処理
    // 初期化を検知するフラグ
    const [loading, setLoading] = React.useState(true);

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

                // videoタグにストリームを設定
                videoRef.current!.srcObject = stream;

                // 画面を共有している
                setIsScreenShared(true);

                // 接続中の相手のID
                setConnectedPeerId(call.peer);
            })

            call.on("close", () => {
                console.log("🎉 mediacall close!");
                setIsScreenShared(false);
            })

            console.log("🎉 mediacall!");
            call.answer();
        });

    }, [loading]);

    // カスタム切断処理のコールバック
    const myCustomDisconnect = useCallback(() => {
        console.log("🔥 カスタム切断処理実行!");
        alert("🎉 カスタム切断処理が実行されました！");
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

    return (
        // 親コンテナを相対位置、全画面に設定
        <div className="relative w-screen h-screen overflow-hidden">

            {/* 全画面ビデオタグ (背景) */}
            <video
                autoPlay
                loop
                muted
                playsInline

                // 動画のサイズをフィット
                // 絶対配置で全画面に広げ、オブジェクトフィットでカバー
                className="absolute inset-0 w-full h-full object-fill"
                // ビデオタグの参照をセット
                ref={videoRef}
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