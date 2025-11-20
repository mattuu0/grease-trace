/**
 * ファイル名: peerjs-adapter.ts
 * 説明: PeerJSの具体的なアダプター実装
 */

import { Peer, type DataConnection, type MediaConnection } from "peerjs";
import {
    P2PAdapterBase,
    type IP2PDataConnection,
    type IP2PMediaConnection
} from "./p2p-adapter-interface";

/**
 * PeerJSのDataConnectionをラップ
 */
class PeerJSDataConnection implements IP2PDataConnection {
    private connection: DataConnection;

    constructor(connection: DataConnection) {
        this.connection = connection;
    }

    get remotePeerId(): string {
        return this.connection.peer;
    }

    get isOpen(): boolean {
        return this.connection.open;
    }

    send(data: any): void {
        if (this.connection.open) {
            this.connection.send(data);
        } else {
            throw new Error('Connection is not open');
        }
    }

    close(): void {
        this.connection.close();
    }

    // 内部的にDataConnectionを取得するためのメソッド
    getRawConnection(): DataConnection {
        return this.connection;
    }
}

/**
 * PeerJSのMediaConnectionをラップ
 */
class PeerJSMediaConnection implements IP2PMediaConnection {
    private connection: MediaConnection;

    constructor(connection: MediaConnection) {
        this.connection = connection;
    }

    get remotePeerId(): string {
        return this.connection.peer;
    }

    close(): void {
        this.connection.close();
    }
}

/**
 * PeerJSアダプター実装
 */
export class PeerJSAdapter extends P2PAdapterBase {
    private peer: Peer | null = null;
    private connectionMap: Map<string, PeerJSDataConnection> = new Map();

    /**
     * 初期化完了（接続識別子返却）
     */
    async initialize(peerId?: string): Promise<string> {
        if (this.peer) {
            return this.peer.id;
        }

        return new Promise((resolve, reject) => {
            // PeerIDを生成
            const id = peerId || crypto.randomUUID();
            this.peer = new Peer(id,{
                config: {
                    iceServers: [{ url: "sturn:mattuu@turn.mattuu.com:5349",credentials:"HN9yFGSXQUdzdOHjmKInDSnAMxw3Kv7jDjQopywdYcppRzsxiO3ffQn3dCq5XFtW"}],
                }
            });

            // 初期化完了
            this.peer.on('open', (id: string) => {
                console.log('PeerJS initialized:', id);
                resolve(id);
            });

            this.peer.on('error', (error) => {
                console.error('PeerJS error:', error);
                reject(error);
            });

            // データコネクション接続イベント
            this.peer.on('connection', (connection: DataConnection) => {
                this.handleIncomingDataConnection(connection);
            });

            // メディアコール着信イベント
            this.peer.on('call', (call: MediaConnection) => {
                this.handleIncomingMediaCall(call);
            });
        });
    }

    /**
     * データコネクション接続
     */
    async connectData(remotePeerId: string): Promise<IP2PDataConnection> {
        if (!this.peer) {
            throw new Error('Peer not initialized');
        }

        return new Promise((resolve, reject) => {
            const connection = this.peer!.connect(remotePeerId);
            const wrappedConnection = new PeerJSDataConnection(connection);

            connection.on('open', () => {
                this.connectionMap.set(remotePeerId, wrappedConnection);
                this.setupDataConnectionEvents(connection);
                resolve(wrappedConnection);
            });

            connection.on('error', (error) => {
                reject(error);
            });
        });
    }

    /**
     * MediaStream送信
     */
    async sendMediaStream(remotePeerId: string, stream: MediaStream): Promise<IP2PMediaConnection> {
        if (!this.peer) {
            throw new Error('Peer not initialized');
        }

        return new Promise((resolve, reject) => {
            try {
                const call = this.peer!.call(remotePeerId, stream);
                const wrappedCall = new PeerJSMediaConnection(call);

                call.on('stream', () => {
                    // 送信側では特に何もしない
                });

                call.on('error', (error) => {
                    reject(error);
                });

                // すぐに解決（送信開始）
                resolve(wrappedCall);
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * 破棄
     */
    destroy(): void {
        if (this.peer) {
            this.peer.destroy();
            this.peer = null;
        }
        this.connectionMap.clear();
    }

    get myPeerId(): string | null {
        return this.peer?.id ?? null;
    }

    /**
     * データコネクション着信の処理
     */
    private handleIncomingDataConnection(connection: DataConnection): void {
        const wrappedConnection = new PeerJSDataConnection(connection);
        this.connectionMap.set(connection.peer, wrappedConnection);

        this.setupDataConnectionEvents(connection);

        // データコネクション接続イベント呼び出し
        this.emitDataConnectionIncoming(wrappedConnection);
    }

    /**
     * データコネクションのイベント設定
     */
    private setupDataConnectionEvents(connection: DataConnection): void {
        // 受信イベント呼び出し
        connection.on('data', (data: any) => {
            this.emitDataReceived(connection.peer, data);
        });

        // 切断イベント
        connection.on('close', () => {
            this.connectionMap.delete(connection.peer);
            this.emitDisconnected(connection.peer);
        });

        connection.on('error', (error) => {
            console.error('Connection error:', error);
        });
    }

    /**
     * メディアコール着信の処理
     */
    private handleIncomingMediaCall(call: MediaConnection): void {
        // MediaStream受信イベント
        call.on('stream', (stream: MediaStream) => {
            this.emitMediaStreamReceived(call.peer, stream);
        });

        call.on('close', () => {
            console.log('Media call closed:', call.peer);
        });

        call.on('error', (error) => {
            console.error('Media call error:', error);
        });

        // 着信に応答
        call.answer();
    }
}

// シングルトンインスタンス
let adapterInstance: PeerJSAdapter | null = null;

/**
 * アダプターのシングルトンインスタンスを取得
 */
export function getP2PAdapter(): PeerJSAdapter {
    if (!adapterInstance) {
        adapterInstance = new PeerJSAdapter();
    }
    return adapterInstance;
}

/**
 * アダプターを破棄
 */
export function destroyP2PAdapter(): void {
    if (adapterInstance) {
        adapterInstance.destroy();
        adapterInstance = null;
    }
}
