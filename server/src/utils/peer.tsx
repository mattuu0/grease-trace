import { DataConnection, MediaConnection, Peer } from "peerjs";

// Peerインスタンス
let peer: Peer | null = null;
// connectionの管理
let connectionMap: Map<string, DataConnection> = new Map<string, DataConnection>();
// callの管理
let callMap: Map<string, MediaConnection> = new Map<string, MediaConnection>();

// Peerインスタンスを取得
export function getPeer() {
    // Peerインスタンスを返却
    if (!peer) {
        // Peerインスタンスを初期化
        // peer = new Peer(crypto.randomUUID(),{
        //     host: "peerjs.mattuu.com",
        //     path: "/",
        //     port: 443,
        //     secure: true
        // });
        peer = new Peer(crypto.randomUUID());
    }

    // Peerインスタンスを返却
    return peer;
}

// peerを破棄
export function destroyPeer() {
    // Peerインスタンスを破棄
    if (peer) {
        peer.destroy();
        peer = null;
    }
}

// peerに接続
export function connectRemote(remotePeerId: string) : DataConnection {
    // Peerインスタンスを取得
    const peer = getPeer();

    // 接続を確立
    const connection = peer.connect(remotePeerId);

    // 接続を管理
    connectionMap.set(remotePeerId, connection);

    // イベントを設定
    connection.on("close", () => {
        // 接続を破棄
        connectionMap.delete(remotePeerId);
    });

    // 接続を返却
    return connection;
}

// ストリームで接続する関数
export function connectStream(remotePeerId: string, stream: MediaStream) : MediaConnection {
    // Peerインスタンスを取得
    const peer = getPeer();

    // 接続を確立
    const connection = peer.call(remotePeerId, stream);

    // 接続を管理
    callMap.set(remotePeerId, connection);

    // イベントを設定
    connection.on("close", () => {
        // 接続を破棄
        connectionMap.delete(remotePeerId);
    });

    // 接続を返却
    return connection;
}
