import { type DataConnection, Peer } from "peerjs";

// Peerインスタンス
let peer: Peer | null = null;
// connectionの管理
const connectionMap: Map<string, DataConnection> = new Map<string, DataConnection>();

// Peerインスタンスを取得
export function getPeer() {
    // Peerインスタンスを返却
    if (!peer) {
        peer = new Peer(crypto.randomUUID(), {
            "host": "0.peerjs.com",
            "port": 443,
            "path": "/",
            "secure": true,
            "config": {
                "iceServers": [
                    {
                        "url": "stun:stun.l.google.com:19302"
                    },
                    {
                        "url": "turns:turn.mattuu.com:5349",
                        "username": "mattuu",
                        "credential": "HN9yFGSXQUdzdOHjmKInDSnAMxw3Kv7jDjQopywdYcppRzsxiO3ffQn3dCq5XFtW"
                    }
                ]
            },
            debug: 3
        });
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
export function connectRemote(remotePeerId: string): DataConnection {
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

// 相手の接続情報を取得
export function getPeerConnection(remotePeerId: string): DataConnection | undefined {
    return connectionMap.get(remotePeerId);
}

// 接続情報を保存する
export function setPeerConnection(remotePeerId: string, connection: DataConnection) {
    connectionMap.set(remotePeerId, connection);
}
