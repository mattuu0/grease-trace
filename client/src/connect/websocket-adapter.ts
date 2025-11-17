/**
 * ファイル名: websocket-adapter.ts
 * 説明: WebSocketベースのカスタムアダプター実装例
 */

import {
    P2PAdapterBase,
    type IP2PDataConnection,
    type IP2PMediaConnection
} from "./p2p-adapter-interface";

/**
 * WebSocket用のデータコネクション実装例
 */
class WebSocketDataConnection implements IP2PDataConnection {
    private ws: WebSocket;
    private _remotePeerId: string;
    private _isOpen: boolean = false;

    constructor(ws: WebSocket, remotePeerId: string) {
        this.ws = ws;
        this._remotePeerId = remotePeerId;

        this.ws.addEventListener('open', () => {
            this._isOpen = true;
        });

        this.ws.addEventListener('close', () => {
            this._isOpen = false;
        });
    }

    get remotePeerId(): string {
        return this._remotePeerId;
    }

    get isOpen(): boolean {
        return this._isOpen;
    }

    send(data: any): void {
        if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        } else {
            throw new Error('WebSocket is not open');
        }
    }

    close(): void {
        this.ws.close();
    }
}

/**
 * WebSocket用のメディアコネクション実装例
 * 注: 実際のMediaStream送信にはWebRTCが必要です
 */
class WebSocketMediaConnection implements IP2PMediaConnection {
    private _remotePeerId: string;

    constructor(remotePeerId: string) {
        this._remotePeerId = remotePeerId;
    }

    get remotePeerId(): string {
        return this._remotePeerId;
    }

    close(): void {
        // 実装に応じて処理
    }
}

/**
 * WebSocketベースのカスタムアダプター実装例
 * 
 * 実装するメソッド:
 * 1. initialize() - 初期化完了（接続識別子返却）
 * 2. connectData() - データコネクション接続
 * 3. sendMediaStream() - MediaStream送信
 * 4. destroy() - 破棄
 * 
 * 呼び出すイベント:
 * - this.emitDataReceived() - 受信イベント呼び出し
 * - this.emitDataConnectionIncoming() - データコネクション接続イベント
 * - this.emitMediaStreamReceived() - MediaStream受信イベント
 * - this.emitDisconnected() - 切断イベント
 */
export class WebSocketAdapter extends P2PAdapterBase {
    private ws: WebSocket | null = null;
    private _myPeerId: string | null = null;
    private serverUrl: string;

    constructor(serverUrl: string = 'ws://localhost:8080') {
        super();
        this.serverUrl = serverUrl;
    }

    /**
     * 1. 初期化完了（接続識別子返却）
     */
    async initialize(peerId?: string): Promise<string> {
        return new Promise((resolve, reject) => {
            // WebSocketサーバーに接続
            this.ws = new WebSocket(this.serverUrl);

            this.ws.addEventListener('open', () => {
                // ピアIDを生成または使用
                this._myPeerId = peerId || this.generateId();

                // サーバーに登録
                this.ws!.send(JSON.stringify({
                    type: 'register',
                    peerId: this._myPeerId
                }));

                console.log('WebSocket adapter initialized:', this._myPeerId);
                resolve(this._myPeerId);
            });

            this.ws.addEventListener('message', (event) => {
                this.handleMessage(event.data);
            });

            this.ws.addEventListener('close', () => {
                console.log('WebSocket closed');
                // 切断イベントを発行
                if (this._myPeerId) {
                    this.emitDisconnected(this._myPeerId);
                }
            });

            this.ws.addEventListener('error', (error) => {
                console.error('WebSocket error:', error);
                reject(error);
            });
        });
    }

    /**
     * 2. データコネクション接続
     */
    async connectData(remotePeerId: string): Promise<IP2PDataConnection> {
        if (!this.ws || !this._myPeerId) {
            throw new Error('Adapter not initialized');
        }

        // サーバー経由で接続要求を送信
        this.ws.send(JSON.stringify({
            type: 'connect',
            from: this._myPeerId,
            to: remotePeerId
        }));

        // WebSocketを使ってデータコネクションを作成
        const connection = new WebSocketDataConnection(this.ws, remotePeerId);
        return connection;
    }

    /**
     * 3. MediaStream送信
     * 注: WebSocketではMediaStreamを直接送信できないため、
     * 実際にはWebRTCなどを組み合わせる必要があります
     */
    async sendMediaStream(remotePeerId: string, stream: MediaStream): Promise<IP2PMediaConnection> {
        console.warn('MediaStream送信はWebSocketアダプターではサポートされていません');

        // ダミーの実装
        const connection = new WebSocketMediaConnection(remotePeerId);
        return connection;
    }

    /**
     * 4. 破棄
     */
    destroy(): void {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this._myPeerId = null;
    }

    get myPeerId(): string | null {
        return this._myPeerId;
    }

    /**
     * サーバーからのメッセージを処理
     */
    private handleMessage(data: string): void {
        try {
            const message = JSON.parse(data);

            switch (message.type) {
                case 'connection_incoming':
                    // データコネクション接続イベント呼び出し
                    const connection = new WebSocketDataConnection(this.ws!, message.from);
                    this.emitDataConnectionIncoming(connection);
                    break;

                case 'data':
                    // 受信イベント呼び出し
                    this.emitDataReceived(message.from, message.data);
                    break;

                case 'disconnected':
                    // 切断イベント
                    this.emitDisconnected(message.peerId);
                    break;

                case 'media_stream':
                    // MediaStream受信イベント（実際にはWebRTCが必要）
                    console.warn('MediaStream受信はWebSocketアダプターではサポートされていません');
                    break;

                default:
                    console.warn('Unknown message type:', message.type);
            }
        } catch (error) {
            console.error('Message handling error:', error);
        }
    }

    /**
     * ランダムなIDを生成
     */
    private generateId(): string {
        return 'ws-' + Math.random().toString(36).substring(2, 15);
    }
}

/**
 * 使用例:
 * 
 * const adapter = new WebSocketAdapter('ws://your-server.com');
 * await adapter.initialize();
 * 
 * adapter.onDataReceived((remotePeerId, data) => {
 *   console.log('Received:', data);
 * });
 * 
 * const connection = await adapter.connectData('remote-peer-id');
 * connection.send({ message: 'Hello!' });
 */
