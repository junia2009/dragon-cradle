# 🐉 Dragon Cradle

ドラゴンを育てて戦わせる育成バトルゲーム

> A dragon breeding and battle game built with Three.js and Web Audio API

![Version](https://img.shields.io/badge/version-v2.0.3-7B2FFF)

## 🎮 遊び方

### 1. 属性を選ぶ

4種類の属性からドラゴンを選択します。

| 属性 | タイプ | 特徴 | 必殺技 |
| ---- | ------ | ---- | ------ |
| 🔥 火 | アタッカー | 高攻撃力 | バーサークブロー |
| ❄️ 氷 | タンク | 高HP・高防御 | アイアンウォール |
| ⚡ 雷 | スピード | 高速度 | サンダーラッシュ |
| 🌑 闇 | バランス | 万能型 | ドラゴンブレス |

### 2. 卵を孵す

タイミングバーに合わせてタップ！パーフェクト判定でゲージが大きく溜まります。

### 3. ドラゴンを育てる

- **食べ物** / **攻撃鍛錬** / **守り鍛錬** / **速さ鍛錬** でステータスを上げる
- スタミナ制（最大5、60秒で1回復）
- 成長ゲージが50に達すると大人に進化
- 3Dモデルを360度回転・ズームして観察可能

### 4. バトル

- ターン制コマンドバトル（攻撃 / 必殺技 / 守り）
- MP制（最大5、必殺技コスト3）
- 連勝してスコアを伸ばそう

## ✨ 特徴

- **フル3Dグラフィック** — Three.js による卵・幼体・成体のプロシージャルモデル
- **プロシージャルBGM** — Web Audio API でリアルタイム生成（音声ファイル不要）
- **PWA対応** — スマホにインストールしてオフラインでも遊べる
- **オートセーブ** — LocalStorage に自動保存

## 🛠 技術スタック

| 技術 | 詳細 |
| ---- | ---- |
| 3D描画 | Three.js r128 + OrbitControls |
| 音声 | Web Audio API（オシレータ合成 + リバーブ） |
| PWA | Service Worker + manifest.json |
| フォント | Orbitron / Noto Sans JP |
| 保存 | LocalStorage |

## 🚀 ローカルで動かす

```bash
git clone https://github.com/junia2009/dragon-cradle.git
cd dragon-cradle
npx http-server -p 8080 -c-1
```

ブラウザで `http://localhost:8080` を開く。

## � 開発ツール — preview.html

`preview.html` はドラゴンモデルの確認・調整に使う開発用ビューアです。

- **属性切替** — 火・氷・雷・闇の4属性をワンクリックで切替
- **成長段階切替** — 幼体 / 成体を即座に切替
- **ドラゴンタイプ切替** — バランス型・アタッカー型・タンク型・スピード型
- **ワイヤーフレーム表示** — メッシュ構造を確認
- **背景切替** — プレビュー（グリッド） / 育成 / 戦闘 の3種類で実際の画面に近い見た目を確認
- **BGM確認** — タイトル / 育成 / 戦闘 のBGMをその場で再生
- **OrbitControls** — マウスドラッグで360度回転、ホイールでズーム

体・翼・頭・目・脚・爪などの各パーツのサイズ・位置・角度を、このプレビューで即座にフィードバックを得ながら調整しました。

```bash
# プレビューツールを開く
http://localhost:8080/preview.html
```

## �📁 ファイル構成

```text
├── index.html          # メインHTML
├── game.js             # ゲームロジック・3D・BGM
├── styles.css          # スタイルシート
├── sw.js               # Service Worker
├── manifest.json       # PWAマニフェスト
├── preview.html        # 3Dモデル プレビューツール
├── generate-icons.js   # アイコン生成スクリプト
└── icons/              # PWA用アイコン
```

## 📜 ライセンス

MIT
