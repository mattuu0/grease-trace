/**
 * ファイル名: App.tsx
 * 説明: アダプターパターンを使用したメインアプリケーション
 */

import React, { useCallback, useMemo, useEffect } from 'react';
import { WhiteboardSender } from './WhiteboardSender';
import { getSimplePeerAdapter } from './connect/simple-peer-adapter';
import type { IP2PDataConnection } from './connect/p2p-adapter-interface';

/**
 * デモ用メインアプリ（アダプターパターン使用）
 */
export default function App(): React.ReactElement {
    // ビデオタグの参照
    const videoRef = React.useRef<HTMLVideoElement>(null);

    // 画面が共有されているか
    const [isScreenShared, setIsScreenShared] = React.useState(false);

    // 受信したMediaStream
    const [mediaStream, setMediaStream] = React.useState<MediaStream | null>(null);

    // 自身のPeerID
    const [myPeerId, setMyPeerId] = React.useState<string | null>(null);

    // 接続中の相手のID
    const [connectedPeerId, setConnectedPeerId] = React.useState<string | null>(null);

    // データコネクション
    const [dataConnection, setDataConnection] = React.useState<IP2PDataConnection | null>(null);

    // P2Pアダプター
    const adapter = useMemo(() => getSimplePeerAdapter(), []);

    // 初期化処理
    useEffect(() => {
        let mounted = true;

        const init = async () => {
            try {
                // 初期化完了（接続識別子返却）
                const peerId = await adapter.initialize();
                
                if (mounted) {
                    console.log('🎉 Adapter initialized!', peerId);
                    setMyPeerId(peerId);
                }

                // データコネクション接続イベント
                adapter.onDataConnectionIncoming((connection) => {
                    if (!mounted) return;
                    
                    console.log('🎉 Data connection incoming!', connection.remotePeerId);
                    setConnectedPeerId(connection.remotePeerId);
                    setDataConnection(connection);
                });

                // 受信イベント呼び出し
                adapter.onDataReceived((remotePeerId, data) => {
                    console.log('📩 Data received from', remotePeerId, ':', data);
                });

                // MediaStream受信イベント
                adapter.onMediaStreamReceived((remotePeerId, stream) => {
                    if (!mounted) return;
                    
                    console.log('🎥 MediaStream received from', remotePeerId);
                    setMediaStream(stream);
                    setIsScreenShared(true);
                    setConnectedPeerId(remotePeerId);
                });

                // 切断イベント
                adapter.onDisconnected((remotePeerId) => {
                    console.log('👋 Disconnected from', remotePeerId);
                    
                    if (remotePeerId === connectedPeerId) {
                        setIsScreenShared(false);
                        setMediaStream(null);
                        setConnectedPeerId(null);
                        setDataConnection(null);
                    }
                });

            } catch (error) {
                console.error('❌ Initialization error:', error);
            }
        };

        init();

        return () => {
            mounted = false;
        };
    }, [adapter]);

    // mediaStreamが変更されたときにvideo要素に割り当てる
    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.srcObject = mediaStream;
        }
    }, [mediaStream]);

    // カスタム切断処理のコールバック
    const myCustomDisconnect = useCallback(() => {
        console.log("🔥 カスタム切断処理実行!");
        window.location.reload();
    }, []);

    const initialSettings = useMemo(() => ({
        initialToolLockState: true,
        onDisconnectCallback: myCustomDisconnect
    }), [myCustomDisconnect]);

    // データ送信関数
    const updateCallback = useCallback((jsonString: string) => {
        console.log("🎉 更新コールバック実行!");
        console.log(jsonString);

        // 画面が共有されている場合データを送信する
        if (isScreenShared && dataConnection && dataConnection.isOpen) {
            console.log("📤 送信中...");
            
            try {
                dataConnection.send(jsonString);
            } catch (error) {
                console.error("❌ 送信エラー:", error);
            }
        }
    }, [isScreenShared, dataConnection]);

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
        <div className="relative w-screen h-screen overflow-hidden">
            {/* 全画面ビデオタグ (背景) */}
            <video
                ref={videoRef}
                autoPlay
                loop
                muted
                playsInline
                style={{ display: isScreenShared ? 'block' : 'none' }}
                className="absolute inset-0 w-full h-full object-fill"
            />

            {/* ホワイトボード */}
            <WhiteboardSender
                videoRef={videoRef}
                initialToolLockState={initialSettings.initialToolLockState}
                onDisconnectCallback={initialSettings.onDisconnectCallback}
                onUpdateCallback={updateCallback}
            />
        </div>
    );
}
