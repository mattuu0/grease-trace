import React, { useCallback, useMemo } from 'react';
import { WhiteboardSender } from './WhiteboardSender'; // WhiteboardSenderをインポート
import { type DataConnection, Peer } from "peerjs";

/**
 * デモ用メインアプリ
 */
export default function App(): React.ReactElement {
    // 初期化処理
    // 初期化を検知するフラグ
    const [loading, setLoading] = React.useState(true);

    // データコネクション
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    let peerConnection: DataConnection | null = null;

    // コンポーネントの初期化時にのみサービスを呼び出します
    React.useEffect(() => {
        // すでに初期化されていた場合は処理を抜けます
        if (!loading) {
            return;
        }

        // 初期化処理を実行します
        const mainPeer = new Peer("a503a41e-20f4-4a15-9b74-863402129399");

        mainPeer.on('connection', function (conn) {
            conn.on('open', function () {
                // here you have conn.id
                conn.send('hi!');

                // コネクションを保持
                // eslint-disable-next-line react-hooks/exhaustive-deps
                peerConnection = conn;
            });

            conn.on("close", function () {
                // コネクションを破棄
                peerConnection = null;
            })
        });

        // 初期化済みのフラグを立てます
        setLoading(false);
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
                // 絶対配置で全画面に広げ、オブジェクトフィットでカバー
                className="absolute inset-0 w-full h-full object-cover"
                // TODO: 実際の動画URLに置き換えてください
                src="https://www.w3schools.com/tags/movie.mp4"
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