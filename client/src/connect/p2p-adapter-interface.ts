/**
 * ファイル名: p2p-adapter-interface.ts
 * 説明: P2Pアダプターのインターフェース定義
 */

// ========================================
// アダプターインターフェース定義
// ========================================

/**
 * データコネクションのインターフェース
 */
export interface IP2PDataConnection {
    /** 相手のピアID */
    readonly remotePeerId: string;
    /** 接続が開いているか */
    readonly isOpen: boolean;
    /** データを送信 */
    send(data: any): void;
    /** 接続を閉じる */
    close(): void;
}

/**
 * メディアコネクションのインターフェース
 */
export interface IP2PMediaConnection {
    /** 相手のピアID */
    readonly remotePeerId: string;
    /** 接続を閉じる */
    close(): void;
}

/**
 * P2Pアダプターが実装すべきインターフェース
 */
export interface IP2PAdapter {
    /**
     * 初期化処理
     * @param peerId - 指定しない場合は自動生成
     * @returns 自分のピアID
     */
    initialize(peerId?: string): Promise<string>;

    /**
     * データコネクションを確立
     * @param remotePeerId - 接続先のピアID
     * @returns データコネクション
     */
    connectData(remotePeerId: string): Promise<IP2PDataConnection>;

    /**
     * メディアストリームを送信
     * @param remotePeerId - 送信先のピアID
     * @param stream - 送信するMediaStream
     * @returns メディアコネクション
     */
    sendMediaStream(remotePeerId: string, stream: MediaStream): Promise<IP2PMediaConnection>;

    /**
     * データ受信イベントのコールバックを登録
     * @param callback - データ受信時に呼ばれる関数
     */
    onDataReceived(callback: (remotePeerId: string, data: any) => void): void;

    /**
     * データコネクション着信イベントのコールバックを登録
     * @param callback - データコネクション着信時に呼ばれる関数
     */
    onDataConnectionIncoming(callback: (connection: IP2PDataConnection) => void): void;

    /**
     * メディアストリーム受信イベントのコールバックを登録
     * @param callback - メディアストリーム受信時に呼ばれる関数
     */
    onMediaStreamReceived(callback: (remotePeerId: string, stream: MediaStream) => void): void;

    /**
     * 切断イベントのコールバックを登録
     * @param callback - 切断時に呼ばれる関数
     */
    onDisconnected(callback: (remotePeerId: string) => void): void;

    /**
     * 破棄処理
     */
    destroy(): void;

    /**
     * 自分のピアIDを取得
     */
    readonly myPeerId: string | null;
}

/**
 * アダプターの抽象基底クラス（実装の補助用）
 */
export abstract class P2PAdapterBase implements IP2PAdapter {
    protected dataReceivedCallbacks: Array<(remotePeerId: string, data: any) => void> = [];
    protected dataConnectionIncomingCallbacks: Array<(connection: IP2PDataConnection) => void> = [];
    protected mediaStreamReceivedCallbacks: Array<(remotePeerId: string, stream: MediaStream) => void> = [];
    protected disconnectedCallbacks: Array<(remotePeerId: string) => void> = [];

    abstract initialize(peerId?: string): Promise<string>;
    abstract connectData(remotePeerId: string): Promise<IP2PDataConnection>;
    abstract sendMediaStream(remotePeerId: string, stream: MediaStream): Promise<IP2PMediaConnection>;
    abstract destroy(): void;
    abstract get myPeerId(): string | null;

    onDataReceived(callback: (remotePeerId: string, data: any) => void): void {
        this.dataReceivedCallbacks.push(callback);
    }

    onDataConnectionIncoming(callback: (connection: IP2PDataConnection) => void): void {
        this.dataConnectionIncomingCallbacks.push(callback);
    }

    onMediaStreamReceived(callback: (remotePeerId: string, stream: MediaStream) => void): void {
        this.mediaStreamReceivedCallbacks.push(callback);
    }

    onDisconnected(callback: (remotePeerId: string) => void): void {
        this.disconnectedCallbacks.push(callback);
    }

    // 実装側が呼び出すヘルパーメソッド
    protected emitDataReceived(remotePeerId: string, data: any): void {
        this.dataReceivedCallbacks.forEach(cb => cb(remotePeerId, data));
    }

    protected emitDataConnectionIncoming(connection: IP2PDataConnection): void {
        this.dataConnectionIncomingCallbacks.forEach(cb => cb(connection));
    }

    protected emitMediaStreamReceived(remotePeerId: string, stream: MediaStream): void {
        this.mediaStreamReceivedCallbacks.forEach(cb => cb(remotePeerId, stream));
    }

    protected emitDisconnected(remotePeerId: string): void {
        this.disconnectedCallbacks.forEach(cb => cb(remotePeerId));
    }
}
