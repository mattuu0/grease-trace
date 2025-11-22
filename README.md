# GreaseTrace

リアルタイム画面共有＆ホワイトボードアプリケーション。
共有された画面の上に、まるで直接書き込んでいるかのようにリアルタイムで描画や指示を行うことができます。

---

## ✨ 主な機能

-   **P2P画面共有:** 低遅延なWebRTC (PeerJS) を利用したピアツーピアでの画面共有。
-   **リアルタイム描画:** 共有されたスクリーン上に、ペン、図形、テキストなどをリアルタイムで描画。
-   **レーザーポインター:** 相手に注目してほしい箇所を指し示すためのレーザーポインター機能。
-   **オーバーレイ表示:** Tauriの透明ウィンドウ機能を利用し、OSの他のウィンドウの上に描画内容を重ねて表示。
-   **ディープリンク:** カスタムURLスキーマ (`greasetrace://`) を使って、クリック一つで簡単に接続を開始。

## 💡 仕組み

このアプリケーションは、画面を **共有される側 (Client/Web)** と、画面を **共有する側 (Server/Tauri App)** の2つのコンポーネントで構成されています。

1.  **Client (Web):**
    -   Webブラウザで動作します。
    -   自身のPeer IDを生成し、`greasetrace://connect/{peerId}` という形式の招待リンクを作成します。
    -   共有された画面の映像ストリームを受信し、その上に描画データをP2PでServerに送信します。

2.  **Server (Tauri App):**
    -   macOS/Windows/Linuxで動作するデスクトップアプリケーションです。
    -   招待リンクをクリックすると、OSのディープリンク機能によってアプリが起動し、Clientに接続します。
    -   自身の画面共有を開始し、その映像ストリームをClientに送信します。また、Clientから受信した描画データをオーバーレイ表示します。
    -   ウィンドウは透明で枠なし、かつ常に最前面に表示されるため、まるで画面に直接描画されているかのような体験を提供します。

## 🛠️ 技術スタック

-   **デスクトップアプリ:** [Tauri](https://tauri.app/) (Rust)
-   **フロントエンド:** [React](https://reactjs.org/), [TypeScript](https://www.typescriptlang.org/), [Vite](https://vitejs.dev/)
-   **リアルタイム通信 (P2P):** [PeerJS](https://peerjs.com/) (WebRTC)
-   **スタイリング:** [Tailwind CSS](https://tailwindcss.com/)

## 📂 ディレクトリ構造

```
.
├── client/         # 画面共有を受信する（操作する）側のWebアプリケーション
│   ├── src/
│   │   ├── App.tsx             # メインロジック、PeerJS接続、描画データの送信
│   │   └── GreaseTraceSender.tsx # ホワイトボード描画UIコンポーネント
│   └── ...
└── server/         # 画面共有を行う（操作される）側のTauriアプリケーション
    ├── src/
    │   ├── App.tsx                 # Tauri側のメインロジック
    │   └── whiteboardRecviver.tsx  # 受信した描画データをSVGで表示するコンポーネント
    ├── src-tauri/              # TauriのRustコア部分
    │   ├── Cargo.toml
    │   └── tauri.conf.json
    └── ...
```

## 🚀 セットアップと実行

### 前提条件

-   [Node.js](https://nodejs.org/ja/) (v18以降推奨)
-   [Rust](https://www.rust-lang.org/tools/install) と Cargo

### 1. Client (操作する側 / Web)

```bash
# clientディレクトリに移動
cd client

# 依存関係をインストール
npm install

# 開発サーバーを起動
npm run dev
```
開発サーバーが起動したら、表示されたURLをWebブラウザで開きます。接続用のIDまたは招待リンクが表示されます。

### 2. Server (操作される側 / Tauri App)

```bash
# serverディレクトリに移動
cd server

# 依存関係をインストール
npm install

# Tauriアプリケーションを開発モードで起動
npm run tauri dev
```

アプリが起動したら待機状態になります。Client側で生成された招待リンク (`greasetrace://...`) をクリックすると、自動的にServerアプリと接続され、画面共有が開始されます。

### ビルド

各アプリケーションは以下のコマンドでビルドできます。

**Client:**
```bash
cd client
npm run build
```
`client/dist` ディレクトリに静的ファイルが生成されます。

**Server:**
```bash
cd server
npm run tauri build
```
`server/src-tauri/target/release/bundle` ディレクトリに、各OS向けのインストーラーまたは実行ファイルが生成されます。

---

## 🔄 CI/CD (GitHub Actions)

このプロジェクトでは、GitHub Actionsを利用してビルドとリリース作成の自動化を行っています。

### ワークフローの概要

-   **トリガー:** `develop` または `main` ブランチへのプッシュ。
-   **ジョブ:**
    1.  **`build-client`**:
        -   `client` (Webアプリ) をビルドし、GitHub Pages用のアーティファクトを作成します。
    2.  **`build-server`**:
        -   `server` (Tauriアプリ) を **Windows向け** にビルドします。
        -   ビルドされたインストーラー (`.msi`) と実行ファイル (`.exe`) をアーティファクトとして保存します。
    3.  **`create-release`**:
        -   `tauri.conf.json` のバージョンに基づき、新しいバージョンの場合にのみ実行されます。
        -   新しいGitHub Releaseを自動で作成し、`build-server`で生成されたWindows向けのファイルをアセットとして添付します。
