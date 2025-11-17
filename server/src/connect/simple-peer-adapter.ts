/**
 * ファイル名: simple-peer-adapter.ts
 * 説明: simple-peerの具体的なアダプター実装
 */

import SimplePeer from "simple-peer";
import {
    P2PAdapterBase,
    type IP2PDataConnection,
    type IP2PMediaConnection
} from "./p2p-adapter-interface";

/**
 * SimplePeerのインスタンスをラップしたデータコネクション
 */
class SimplePeerDataConnection implements IP2PDataConnection {
    private peer: SimplePeer.Instance;
    private _remotePeerId: string;

    constructor(peer: SimplePeer.Instance, remotePeerId: string) {
        this.peer = peer;
        this._remotePeerId = remotePeerId;
    }

    get remotePeerId(): string {
        return this._remotePeerId;
    }

    get isOpen(): boolean {
        return this.peer.connected;
    }

    send(data: any): void {
        if (this.peer.connected) {
            this.peer.send(JSON.stringify(data));
        } else {
            throw new Error('Connection is not open');
        }
    }

    close(): void {
        this.peer.destroy();
    }

    // 内部的にSimplePeerインスタンスを取得するためのメソッド
    getRawPeer(): SimplePeer.Instance {
        return this.peer;
    }
}

/**
 * SimplePeerのメディアコネクション（ストリーム用）
 */
class SimplePeerMediaConnection implements IP2PMediaConnection {
    private peer: SimplePeer.Instance;
    private _remotePeerId: string;

    constructor(peer: SimplePeer.Instance, remotePeerId: string) {
        this.peer = peer;
        this._remotePeerId = remotePeerId;
    }

    get remotePeerId(): string {
        return this._remotePeerId;
    }

    close(): void {
        this.peer.destroy();
    }
}

/**
 * シグナリングデータの型定義
 */
interface SignalData {
    type: string;
    from: string;
    to: string;
    signal: any;
}

/**
 * SimplePeerアダプター実装
 * 
 * 注意: simple-peerは直接的なシグナリングサーバーを持たないため、
 * シグナリングデータの交換は外部のメカニズム（WebSocket、HTTP等）が必要です。
 * このアダプターではシグナリングコールバックを公開しています。
 */
export class SimplePeerAdapter extends P2PAdapterBase {
    private myId: string | null = null;
    private peers: Map<string, SimplePeer.Instance> = new Map();
    private pendingSignals: Map<string, SignalData[]> = new Map();

    // シグナリングデータを送信するためのコールバック
    private onSignalCallback: ((data: SignalData) => void) | null = null;

    /**
     * 1. 初期化完了（接続識別子返却）
     */
    async initialize(peerId?: string): Promise<string> {
        this.myId = peerId || this.generateId();
        console.log('SimplePeer adapter initialized:', this.myId);
        return this.myId;
    }

    /**
     * 2. データコネクション接続
     */
    async connectData(remotePeerId: string): Promise<IP2PDataConnection> {
        if (!this.myId) {
            throw new Error('Adapter not initialized');
        }

        return new Promise((resolve, reject) => {
            // イニシエーターとして接続を開始
            const peer = new SimplePeer({
                initiator: true,
                trickle: true, // ICE candidatesを段階的に送信
            });

            this.peers.set(remotePeerId, peer);

            // シグナリングデータの送信
            peer.on('signal', (signal: any) => {
                if (this.onSignalCallback) {
                    this.onSignalCallback({
                        type: 'signal',
                        from: this.myId!,
                        to: remotePeerId,
                        signal
                    });
                }
            });

            // 接続確立
            peer.on('connect', () => {
                console.log('Connected to:', remotePeerId);
                this.setupPeerEvents(peer, remotePeerId);
                resolve(new SimplePeerDataConnection(peer, remotePeerId));
            });

            // エラーハンドリング
            peer.on('error', (error: Error) => {
                console.error('Connection error:', error);
                this.peers.delete(remotePeerId);
                reject(error);
            });

            // 保留中のシグナルがあれば処理
            const pending = this.pendingSignals.get(remotePeerId);
            if (pending) {
                pending.forEach(signalData => {
                    peer.signal(signalData.signal);
                });
                this.pendingSignals.delete(remotePeerId);
            }
        });
    }

    /**
     * 3. MediaStream送信
     */
    async sendMediaStream(remotePeerId: string, stream: MediaStream): Promise<IP2PMediaConnection> {
        if (!this.myId) {
            throw new Error('Adapter not initialized');
        }

        return new Promise((resolve, reject) => {
            // イニシエーターとしてストリーム付きで接続
            const peer = new SimplePeer({
                initiator: true,
                trickle: true,
                stream: stream
            });

            this.peers.set(remotePeerId, peer);

            // シグナリングデータの送信
            peer.on('si1nal', (signal: any) => {
                if (this.onSignalCallback) {
                    this.onSignalCallback({
                        type: 'signal',
                        from: this.myId!,
                        to: remotePeerId,
                        signal
                    });
                }
            });

            // 接続確立
            peer.on('connect', () => {
                console.log('Media stream sent to:', remotePeerId);
                resolve(new SimplePeerMediaConnection(peer, remotePeerId));
            });

            // エラーハンドリング
            peer.on('error', (error: Error) => {
                console.error('Media stream error:', error);
                this.peers.delete(remotePeerId);
                reject(error);
            });
        });
    }

    /**
     * 4. 破棄
     */
    destroy(): void {
        this.peers.forEach(peer => {
            peer.destroy();
        });
        this.peers.clear();
        this.pendingSignals.clear();
        this.onSignalCallback = null;
        this.myId = null;
    }

    get myPeerId(): string | null {
        return this.myId;
    }

    /**
     * シグナリングデータ送信用のコールバックを設定
     */
    setSignalCallback(callback: (data: SignalData) => void): void {
        this.onSignalCallback = callback;
    }

    /**
     * 外部からシグナリングデータを受信した時に呼び出す
     */
    handleSignal(data: SignalData): void {
        const { from, signal } = data;

        let peer = this.peers.get(from);

        if (!peer) {
            // 着信接続の場合、新しいPeerインスタンスを作成
            peer = new SimplePeer({
                initiator: false,
                trickle: true
            });

            this.peers.set(from, peer);

            // シグナリングデータの送信
            peer.on('signal', (responseSignal: any) => {
                if (this.onSignalCallback) {
                    this.onSignalCallback({
                        type: 'signal',
                        from: this.myId!,
                        to: from,
                        signal: responseSignal
                    });
                }
            });

            // 接続確立時にイベントを発火
            peer.on('connect', () => {
                console.log('Incoming connection from:', from);
                this.setupPeerEvents(peer!, from);
                const connection = new SimplePeerDataConnection(peer!, from);
                this.emitDataConnectionIncoming(connection);
            });

            // エラーハンドリング
            peer.on('error', (error: Error) => {
                console.error('Peer error:', error);
                this.peers.delete(from);
            });
        }

        try {
            peer.signal(signal);
        } catch (error) {
            console.error('Signal error:', error);
            // シグナルが早すぎる場合は保留
            if (!this.pendingSignals.has(from)) {
                this.pendingSignals.set(from, []);
            }
            this.pendingSignals.get(from)!.push(data);
        }
    }

    /**
     * Peerのイベントを設定
     */
    private setupPeerEvents(peer: SimplePeer.Instance, remotePeerId: string): void {
        // 5. データ受信イベント
        peer.on('data', (data: Uint8Array | string) => {
            try {
                const parsed = typeof data === 'string' ? JSON.parse(data) : JSON.parse(data.toString());
                this.emitDataReceived(remotePeerId, parsed);
            } catch (error) {
                console.error('Data parse error:', error);
                this.emitDataReceived(remotePeerId, data);
            }
        });

        // 7. MediaStream受信イベント
        peer.on('stream', (stream: MediaStream) => {
            console.log('Stream received from:', remotePeerId);
            this.emitMediaStreamReceived(remotePeerId, stream);
        });

        // 8. 切断イベント
        peer.on('close', () => {
            console.log('Peer closed:', remotePeerId);
            this.peers.delete(remotePeerId);
            this.emitDisconnected(remotePeerId);
        });
    }

    /**
     * ランダムなIDを生成
     */
    private generateId(): string {
        return 'sp-' + Math.random().toString(36).substring(2, 15);
    }
}

/**
 * シングルトンインスタンス
 */
let adapterInstance: SimplePeerAdapter | null = null;

/**
 * アダプターのシングルトンインスタンスを取得
 */
export function getSimplePeerAdapter(): SimplePeerAdapter {
    if (!adapterInstance) {
        adapterInstance = new SimplePeerAdapter();
    }
    return adapterInstance;
}

/**
 * アダプターを破棄
 */
export function destroySimplePeerAdapter(): void {
    if (adapterInstance) {
        adapterInstance.destroy();
        adapterInstance = null;
    }
}
