# LEECH ANALYZER 開発メモ

最終更新: 2026-04-17

---

## 更新履歴

| 日付 | 内容 |
|------|------|
| 2026-04-17 | Supabase連携追加・クラウド保存対応（v1.0） |
| 2026-04-17 | 初版作成（v0.9・localStorage版） |

---

## プロジェクト概要

セーリングのリーチ形状（ドラフト位置・最大ドラフト・ツイスト）を写真から数値化するWebアプリ。  
コンディション（風・波・セッティング）と紐付けてデータを蓄積し、再現性の高いセーリングに活用する。

---

## 現在の状態

### デプロイ済み
- **Vercel URL**: `https://leech-analyzer-xxx.vercel.app`（ダッシュボードで確認）
- **GitHub**: `https://github.com/takuji4881/leech-analyzer`

### 実装済み機能 (v1.0)
- 写真アップロード・canvasレンダリング
- マスト分割ガイドライン（0% / 25% / 50% / 75% / 100%）+ スナップ機能
- リーチトレースによる数値化（Draft Position・Max Draft・Twist）
- コンディション入力フォーム（風・波・セッティング・コメント）
- ユーザー名入力・次回自動入力
- **Supabase連携 — クラウド保存・全デバイス共有（v1.0で追加）**
- サムネイル付きLOGモーダル
- テキスト検索・フィルター（ユーザー・風速・波）
- CSVエクスポート

### 既知の制限
- 画像はbase64でDBに保存 → 容量が多いとレスポンス遅延の可能性 → Supabase Storageへ移行予定
- 認証なし（誰でも全データ閲覧・投稿可能）→ Supabase Auth導入予定

---

## 技術スタック

```
フロントエンド: React + Vite
デプロイ: Vercel
DB: Supabase (PostgreSQL)
画像ストレージ（予定）: Supabase Storage
```

---

## Supabase 設定情報

- **Project URL**: `https://zvhsmlchqlujjnbcuvbs.supabase.co`
- **Publishable key**: `sb_publishable_VxvBDlrdOwGMP3IxR_B0oQ_gLhbpKBg`
- **パッケージ**: `@supabase/supabase-js` インストール済み

### テーブル: sessions（作成済み）

```sql
create table sessions (
  id bigint generated always as identity primary key,
  created_at timestamp with time zone default now(),
  user_name text,
  boat_class text,
  sail_number text,
  date text,
  location text,
  draft_position int,
  max_draft int,
  twist int,
  wind_knots text,
  wind_dir text,
  wind_stability text,
  wave_height text,
  wave_type text,
  outhaul text,
  cunningham text,
  vang text,
  comment text,
  snapshot text  -- base64画像（後でStorageに移行してもOK）
);

alter table sessions enable row level security;
create policy "anyone can insert" on sessions for insert with check (true);
create policy "anyone can select" on sessions for select using (true);
```

---

## ファイル構成

```
leech-analyzer/
├── src/
│   ├── App.jsx        ← メインコード（ほぼ全部ここ）
│   ├── supabase.js    ← Supabaseクライアント設定（v1.0で追加）
│   ├── App.css        ← 空でOK
│   ├── index.css      ← 空でOK
│   └── main.jsx       ← エントリーポイント（触らない）
├── index.html
├── package.json
└── vite.config.js
```

---

## 次のステップ（ロードマップ）

### 近い将来
- [ ] Supabase Auth でログイン機能（自分のデータだけ見られるように）
- [ ] 画像をSupabase Storageに移行（base64からURLへ）
- [ ] データ比較画面（複数セッションのグラフ表示）

### 将来的に
- [ ] コンディション別のベストセッティング表示
- [ ] チーム機能（部のデータを共有）
- [ ] 独自ドメイン取得

---

## 更新方法

```powershell
cd C:\Users\nasax\leech-analyzer
git add .
git commit -m "変更内容を書く"
git push
# → Vercelが自動でデプロイ（1〜2分）
```

---

## トラブルシューティング

| 症状 | 原因 | 対処 |
|------|------|------|
| npm が動かない | ExecutionPolicy | `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned` |
| push できない | git config未設定 | `git config --global user.email "..."` |
| Vercelにデプロイされない | pushできてない | `git log` でcommit確認 |
| 画像が縦長になる | canvasリサイズ問題 | wrapperのoffsetWidth/Heightを毎回読む実装済み |
| 保存エラー | Supabase RLS or ネットワーク | ブラウザのコンソールでエラー内容確認 |
