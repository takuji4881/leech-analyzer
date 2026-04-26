# LEECH ANALYZER 開発メモ

最終更新: 2026-04-27

---

## 更新履歴

| 日付 | 内容 |
|------|------|
| 2026-04-27 | Supabase Storage対応・元画像＋アノテーション画像の2枚保存（v1.2） |
| 2026-04-27 | Supabase Auth ログイン機能追加・自分のデータのみ表示（v1.1） |
| 2026-04-17 | Supabase連携追加・クラウド保存対応（v1.0） |
| 2026-04-17 | 初版作成（v0.9・localStorage版） |

---

## プロジェクト概要

セーリングのリーチ形状（ドラフト位置・最大ドラフト・ツイスト）を写真から数値化するWebアプリ。  
コンディション（風・波・セッティング）と紐付けてデータを蓄積し、再現性の高いセーリングに活用する。  
将来的には蓄積データで機械学習し、リーチ形状を自動検出するAI機能の搭載を目指す。

---

## 現在の状態

### デプロイ済み
- **Vercel URL**: `https://leech-analyzer.vercel.app`
- **GitHub**: `https://github.com/takuji4881/leech-analyzer`

### 実装済み機能 (v1.2)
- 写真アップロード・canvasレンダリング
- マスト分割ガイドライン（0% / 25% / 50% / 75% / 100%）+ スナップ機能
- リーチトレースによる数値化（Draft Position・Max Draft・Twist）
- コンディション入力フォーム（風・波・セッティング・コメント）
- ユーザー名入力・次回自動入力
- Supabase連携 — クラウド保存・全デバイス共有
- サムネイル付きLOGモーダル
- テキスト検索・フィルター（ユーザー・風速・波）
- CSVエクスポート
- **Supabase Auth — ログイン・新規登録・自分のデータのみ表示（v1.1で追加）**
- **Supabase Storage — 元画像＋アノテーション画像の2枚をクラウド保存（v1.2で追加）**

---

## 技術スタック

```
フロントエンド: React + Vite
デプロイ: Vercel
DB: Supabase (PostgreSQL)
認証: Supabase Auth（メール＋パスワード）
画像ストレージ: Supabase Storage（バケット: sail-images）
```

---

## Supabase 設定情報

- **Project URL**: `https://zvhsmlchqlujjnbcuvbs.supabase.co`
- **Publishable key**: `sb_publishable_VxvBDlrdOwGMP3IxR_B0oQ_gLhbpKBg`
- **パッケージ**: `@supabase/supabase-js` インストール済み

### テーブル: sessions（現在の構成）

```sql
create table sessions (
  id bigint generated always as identity primary key,
  created_at timestamp with time zone default now(),
  user_id uuid references auth.users(id),   -- v1.1で追加
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
  snapshot text,               -- 旧base64（廃止予定）
  original_image_url text,     -- v1.2で追加：元画像のStorage URL
  annotated_image_url text     -- v1.2で追加：アノテーション画像のStorage URL
);

-- RLSポリシー（v1.1で変更）
alter table sessions enable row level security;
create policy "users can insert own" on sessions
  for insert with check (auth.uid() = user_id);
create policy "users can select own" on sessions
  for select using (auth.uid() = user_id);
```

### Storage: sail-images（v1.2で追加）

- **バケット**: `sail-images`（Public）
- **保存パス**: `{user_id}/{timestamp}_original.jpg` / `{user_id}/{timestamp}_annotated.jpg`
- **ポリシー**: 認証済みユーザーのみアップロード可

```sql
create policy "auth users can upload" on storage.objects
  for insert to authenticated with check (bucket_id = 'sail-images');
```

### 画像の用途（ML用）
- `original` → モデルへの入力データ（クリーンな帆の写真）
- `annotated` → 正解ラベル（ユーザーがプロットしたリーチトレース付き）

---

## ファイル構成

```
leech-analyzer/
├── src/
│   ├── App.jsx        ← メインコード（ほぼ全部ここ）
│   ├── supabase.js    ← Supabaseクライアント設定
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
- [ ] データ比較画面（複数セッションのグラフ表示）
- [ ] コンディション別のベストセッティング表示

### 将来的に
- [ ] リーチ形状自動検出AI（蓄積した元画像＋アノテーション画像で学習）
- [ ] チーム機能（部のデータを共有）
- [ ] 独自ドメイン取得

---

## 更新方法

```powershell
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
| Supabaseが停止している | 無料プランの非アクティブ停止 | ダッシュボードから「復元」ボタンで再開（無料） |
