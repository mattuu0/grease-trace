# P2Pアダプター 簡単実装ガイド 🚀

このガイドでは、新しいP2Pライブラリをアダプターとして実装する方法を、初心者でもわかるように解説します。

---

## 📖 目次

1. [アダプターとは？](#アダプターとは)
2. [実装する7つのこと](#実装する7つのこと)
3. [ステップバイステップ実装](#ステップバイステップ実装)
4. [実装例: PeerJS](#実装例-peerjs)
5. [よくある質問](#よくある質問)

---

## アダプターとは？

**アダプター = 翻訳機**

異なるP2Pライブラリ（PeerJS、WebSocket、WebRTCなど）を、同じインターフェースで使えるようにする「翻訳機」です。

```
あなたのアプリ
     ↓
  アダプター（翻訳機）
     ↓
PeerJS / WebSocket / その他のライブラリ
```

---

## 実装する7つのこと

アダプターを作るには、たった**7つの機能**を実装するだけです！

### ✅ 必須メソッド（4つ）

| No | メソッド | 説明 | やること |
|----|---------|------|---------|
| 1 | `initialize()` | 初期化 | ライブラリを起動して、自分のIDを返す |
| 2 | `connectData()` | データ接続 | 相手のIDに接続して、接続オブジェクトを返す |
| 3 | `sendMediaStream()` | メディア送信 | 映像や音声を相手に送る |
| 4 | `destroy()` | 破棄 | 接続を全部切って、後片付けをする |

### 📣 イベント呼び出し（4つ）

| No | イベント | タイミング | やること |
|----|---------|----------|---------|
| 5 | `emitDataReceived()` | データが届いた時 | 受信したデータを通知する |
| 6 | `emitDataConnectionIncoming()` | 相手から接続された時 | 新しい接続を通知する |
| 7 | `emitMediaStreamReceived()` | 映像/音声が届いた時 | メディアストリームを通知する |
| 8 | `emitDisconnected()` | 接続が切れた時 | 切断を通知する |

---

## ステップバイステップ実装

### ステップ1: ファイルを作成

```typescript
// my-adapter.ts
import {
  P2PAdapterBase,
  type IP2PDataConnection,
  type IP2PMediaConnection
} from "./p2p-adapter-interface";
```

### ステップ2: クラスを作成

```typescript
export class MyAdapter extends P2PAdapterBase {
  // ここに実装を書く
}
```

### ステップ3: 必須メソッドを実装

#### 1️⃣ initialize() - 初期化

```typescript
async initialize(peerId?: string): Promise<string> {
  // TODO: ライブラリを初期化
  // TODO: PeerIDを生成または受け取る
  // TODO: イベントリスナーを設定
  
  // 例:
  this.myLibrary = new SomeLibrary(peerId);
  
  return new Promise((resolve) => {
    this.myLibrary.on('ready', (id) => {
      resolve(id); // 自分のIDを返す
    });
  });
}
```

**ポイント:**
- 非同期処理なので`Promise`を返す
- 初期化が完了したら自分のPeerIDを返す
- ここで後続のイベントリスナーも設定する

---

#### 2️⃣ connectData() - データ接続

```typescript
async connectData(remotePeerId: string): Promise<IP2PDataConnection> {
  // TODO: 相手に接続
  // TODO: 接続オブジェクトをラップ
  
  // 例:
  const connection = this.myLibrary.connect(remotePeerId);
  
  return new Promise((resolve) => {
    connection.on('open', () => {
      // ラッパークラスを作成
      const wrapped = new MyDataConnection(connection);
      resolve(wrapped);
    });
  });
}
```

**ポイント:**
- 相手のIDに接続する
- 接続が確立したら`IP2PDataConnection`を実装したオブジェクトを返す

**データコネクションのラッパー例:**

```typescript
class MyDataConnection implements IP2PDataConnection {
  constructor(private connection: any) {}
  
  get remotePeerId(): string {
    return this.connection.peerId;
  }
  
  get isOpen(): boolean {
    return this.connection.isOpen;
  }
  
  send(data: any): void {
    this.connection.send(data);
  }
  
  close(): void {
    this.connection.close();
  }
}
```

---

#### 3️⃣ sendMediaStream() - メディア送信

```typescript
async sendMediaStream(
  remotePeerId: string, 
  stream: MediaStream
): Promise<IP2PMediaConnection> {
  // TODO: 映像/音声を送信
  
  // 例:
  const call = this.myLibrary.call(remotePeerId, stream);
  const wrapped = new MyMediaConnection(call);
  return wrapped;
}
```

**ポイント:**
- MediaStreamを相手に送る
- 送信が始まったら`IP2PMediaConnection`を実装したオブジェクトを返す

**メディアコネクションのラッパー例:**

```typescript
class MyMediaConnection implements IP2PMediaConnection {
  constructor(private call: any) {}
  
  get remotePeerId(): string {
    return this.call.peerId;
  }
  
  close(): void {
    this.call.close();
  }
}
```

---

#### 4️⃣ destroy() - 破棄

```typescript
destroy(): void {
  // TODO: 全ての接続を切断
  // TODO: リソースを解放
  
  // 例:
  if (this.myLibrary) {
    this.myLibrary.destroy();
    this.myLibrary = null;
  }
}
```

**ポイント:**
- すべての接続を切る
- メモリリークを防ぐため、参照を削除

---

### ステップ4: イベントを呼び出す

ライブラリのイベントを受け取ったら、対応する`emit`メソッドを呼び出します。

#### 5️⃣ データ受信イベント

```typescript
// ライブラリのイベントリスナー内で
this.myLibrary.on('data', (fromId, data) => {
  // アダプターのイベントを発火
  this.emitDataReceived(fromId, data);
});
```

#### 6️⃣ 接続着信イベント

```typescript
this.myLibrary.on('connection', (connection) => {
  const wrapped = new MyDataConnection(connection);
  
  // アダプターのイベントを発火
  this.emitDataConnectionIncoming(wrapped);
});
```

#### 7️⃣ メディア受信イベント

```typescript
this.myLibrary.on('call', (call) => {
  call.on('stream', (stream) => {
    // アダプターのイベントを発火
    this.emitMediaStreamReceived(call.peerId, stream);
  });
  
  // 着信に応答
  call.answer();
});
```

#### 8️⃣ 切断イベント

```typescript
connection.on('close', () => {
  // アダプターのイベントを発火
  this.emitDisconnected(connection.peerId);
});
```

---

## 実装例: PeerJS

### 完全な実装例

```typescript
// peerjs-adapter.ts
import { Peer, DataConnection, MediaConnection } from "peerjs";
import { P2PAdapterBase, IP2PDataConnection, IP2PMediaConnection } from "./p2p-adapter-interface";

// データコネクションラッパー
class PeerJSDataConnection implements IP2PDataConnection {
  constructor(private connection: DataConnection) {}
  
  get remotePeerId(): string { return this.connection.peer; }
  get isOpen(): boolean { return this.connection.open; }
  
  send(data: any): void {
    if (this.isOpen) {
      this.connection.send(data);
    }
  }
  
  close(): void {
    this.connection.close();
  }
}

// メディアコネクションラッパー
class PeerJSMediaConnection implements IP2PMediaConnection {
  constructor(private call: MediaConnection) {}
  
  get remotePeerId(): string { return this.call.peer; }
  
  close(): void {
    this.call.close();
  }
}

// アダプター本体
export class PeerJSAdapter extends P2PAdapterBase {
  private peer: Peer | null = null;

  // 1. 初期化
  async initialize(peerId?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.peer = new Peer(peerId || crypto.randomUUID());
      
      this.peer.on('open', (id) => {
        this.setupEventListeners();
        resolve(id);
      });
      
      this.peer.on('error', reject);
    });
  }

  // 2. データ接続
  async connectData(remotePeerId: string): Promise<IP2PDataConnection> {
    return new Promise((resolve, reject) => {
      const conn = this.peer!.connect(remotePeerId);
      
      conn.on('open', () => {
        this.setupConnectionEvents(conn);
        resolve(new PeerJSDataConnection(conn));
      });
      
      conn.on('error', reject);
    });
  }

  // 3. メディア送信
  async sendMediaStream(remotePeerId: string, stream: MediaStream): Promise<IP2PMediaConnection> {
    const call = this.peer!.call(remotePeerId, stream);
    return new PeerJSMediaConnection(call);
  }

  // 4. 破棄
  destroy(): void {
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
  }

  get myPeerId(): string | null {
    return this.peer?.id ?? null;
  }

  // イベントリスナー設定
  private setupEventListeners(): void {
    // 6. 接続着信
    this.peer!.on('connection', (conn) => {
      this.setupConnectionEvents(conn);
      this.emitDataConnectionIncoming(new PeerJSDataConnection(conn));
    });

    // 7. メディア着信
    this.peer!.on('call', (call) => {
      call.on('stream', (stream) => {
        this.emitMediaStreamReceived(call.peer, stream);
      });
      call.answer();
    });
  }

  private setupConnectionEvents(conn: DataConnection): void {
    // 5. データ受信
    conn.on('data', (data) => {
      this.emitDataReceived(conn.peer, data);
    });

    // 8. 切断
    conn.on('close', () => {
      this.emitDisconnected(conn.peer);
    });
  }
}
```

---

## よくある質問

### Q1: `emitXXX`メソッドはいつ呼べばいい？

**A:** ライブラリのイベントを受け取った**直後**に呼びます。

```typescript
// ❌ 悪い例: 呼び忘れ
myLibrary.on('data', (data) => {
  console.log(data); // ログだけ出して終わり
});

// ✅ 良い例: イベントを伝える
myLibrary.on('data', (data) => {
  this.emitDataReceived(peerId, data); // アダプターのイベント発火
});
```

---

### Q2: Promiseはいつ`resolve`すればいい？

**A:** 処理が**完全に完了**したタイミングです。

```typescript
// ❌ 悪い例: すぐにresolve
async initialize() {
  this.peer = new Peer();
  return this.peer.id; // まだ初期化中！
}

// ✅ 良い例: 完了を待つ
async initialize() {
  return new Promise((resolve) => {
    this.peer = new Peer();
    this.peer.on('open', (id) => {
      resolve(id); // 初期化完了後にresolve
    });
  });
}
```

---

### Q3: エラーハンドリングは？

**A:** `try-catch`とPromiseの`reject`を使います。

```typescript
async connectData(remotePeerId: string): Promise<IP2PDataConnection> {
  return new Promise((resolve, reject) => {
    try {
      const conn = this.peer.connect(remotePeerId);
      
      conn.on('open', () => resolve(new MyConnection(conn)));
      conn.on('error', (error) => reject(error)); // エラーを伝える
    } catch (error) {
      reject(error);
    }
  });
}
```

---

### Q4: MediaStreamが必要ない場合は？

**A:** ダミーの実装でOKです。

```typescript
async sendMediaStream(remotePeerId: string, stream: MediaStream): Promise<IP2PMediaConnection> {
  console.warn('MediaStream is not supported');
  
  // ダミーオブジェクトを返す
  return {
    remotePeerId,
    close: () => {}
  };
}
```

---

### Q5: デバッグのコツは？

**A:** 各ステップでログを出しましょう。

```typescript
async initialize(peerId?: string): Promise<string> {
  console.log('[MyAdapter] Initializing...');
  
  return new Promise((resolve) => {
    this.peer = new Peer(peerId);
    
    this.peer.on('open', (id) => {
      console.log('[MyAdapter] Initialized with ID:', id);
      resolve(id);
    });
  });
}
```

---

## 📝 実装チェックリスト

実装が終わったら、このチェックリストで確認しましょう。

### 必須メソッド
- [ ] `initialize()` を実装した
- [ ] `initialize()` は自分のPeerIDを返す
- [ ] `connectData()` を実装した
- [ ] `connectData()` は接続オブジェクトを返す
- [ ] `sendMediaStream()` を実装した
- [ ] `destroy()` を実装した
- [ ] `myPeerId` プロパティを実装した

### イベント呼び出し
- [ ] データ受信時に `emitDataReceived()` を呼ぶ
- [ ] 接続着信時に `emitDataConnectionIncoming()` を呼ぶ
- [ ] メディア受信時に `emitMediaStreamReceived()` を呼ぶ
- [ ] 切断時に `emitDisconnected()` を呼ぶ

### エラーハンドリング
- [ ] Promiseのrejectを実装した
- [ ] エラーをconsole.errorで出力している

### テスト
- [ ] 初期化が成功する
- [ ] データ送信が成功する
- [ ] データ受信が成功する
- [ ] 接続が切れた時に通知される

---

## 🎉 完成！

これで新しいP2Pライブラリのアダプターが完成しました！

次のステップ:
1. `getP2PAdapter()`関数を作成してシングルトンにする
2. `App.tsx`で使ってみる
3. 動作確認をする

```typescript
// 使い方
const adapter = getP2PAdapter();
await adapter.initialize();

adapter.onDataReceived((peerId, data) => {
  console.log('受信:', data);
});

const conn = await adapter.connectData('相手のID');
conn.send('Hello!');
```

---

## 📚 参考資料

- [完全な実装例: peerjs-adapter.ts](./peerjs-adapter.ts)
- [インターフェース定義: p2p-adapter-interface.ts](./p2p-adapter-interface.ts)
- [使用例: App.tsx](./App.tsx)

困ったことがあれば、PeerJSの実装例を参考にしてください！
