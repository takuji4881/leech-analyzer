# LEECH ANALYZER 開発メモ

最終更新: 2026-04-29

---

## 更新履歴

| 日付 | 内容 |
|------|------|
| 2026-04-29 | 初回オンボーディング画面追加・絵文字→lucide-react SVGアイコン置き換え（v1.8） |
| 2026-04-29 | アカウント削除機能・設定をボトムシートメニューに統合（v1.7） |
| 2026-04-28 | シェア機能・いいね・コメント・返信機能を追加（v1.6） |
| 2026-04-28 | プロフィールアイコン追加・投稿編集・削除機能（v1.5） |
| 2026-04-28 | フィード・マイページ・初回ユーザー名設定・ライト/ダークモード（v1.3〜1.4） |
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

### 実装済み機能 (v1.8)
- 写真アップロード・canvasレンダリング
- マスト分割ガイドライン（0% / 25% / 50% / 75% / 100%）+ スナップ機能
- リーチトレースによる数値化（Draft Position・Max Draft・Twist）
- コンディション入力フォーム（風・波・セッティング・コメント）
- Supabase連携 — クラウド保存・全デバイス共有
- テキスト検索・フィルター（風速・波）
- CSVエクスポート
- Supabase Auth — ログイン・新規登録
- Supabase Storage — 元画像＋アノテーション画像の2枚をクラウド保存（ML用）
- ライト/ダークモード切り替え（v1.3で追加）
- 3ページ構成: フィード（全員の投稿）・投稿・マイページ（v1.3で追加）
- 初回ログイン時のユーザー名セットアップ画面（v1.3で追加）
- ボトムナビゲーション（v1.3で追加）
- コメントの「続きを読む」展開（v1.4で追加）
- 投稿の編集機能・削除機能（v1.4で追加）
- プロフィールアイコン登録・投稿への表示・更新時の古いファイル自動削除（v1.5で追加）
- **いいね・コメント・返信機能（v1.6で追加）**
- **シェア機能（Web Share API / クリップボードコピー）（v1.6で追加）**
- **アカウント削除機能（DB・Storage・auth.users を一括削除）（v1.7で追加）**
- **設定をボトムシートメニューに統合（v1.7で追加）**
- **絵文字UIアイコンを lucide-react SVGアイコンに統一（v1.8で追加）**
- **初回オンボーディング画面（各指標の説明・使い方）・ヘッダーから再表示可能（v1.8で追加）**

---

## 技術スタック

```
フロントエンド: React + Vite
デプロイ: Vercel
DB: Supabase (PostgreSQL)
認証: Supabase Auth（メール＋パスワード）
画像ストレージ: Supabase Storage（バケット: sail-images）
UIアイコン: lucide-react
```

---

## Supabase 設定情報

- **Project URL**: `https://zvhsmlchqlujjnbcuvbs.supabase.co`
- **Publishable key**: `sb_publishable_VxvBDlrdOwGMP3IxR_B0oQ_gLhbpKBg`
- **パッケージ**: `@supabase/supabase-js` インストール済み

### テーブル: sessions

```sql
create table sessions (
  id bigint generated always as identity primary key,
  created_at timestamp with time zone default now(),
  user_id uuid references auth.users(id),
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
  original_image_url text,     -- 元画像のStorage URL
  annotated_image_url text     -- アノテーション画像のStorage URL
);

-- RLSポリシー
alter table sessions enable row level security;
create policy "users can insert own" on sessions
  for insert with check (auth.uid() = user_id);
create policy "all auth can select" on sessions
  for select using (auth.uid() is not null);   -- 全員のフィードを見るため全ユーザー読み取り可
create policy "own update" on sessions
  for update using (auth.uid() = user_id);
create policy "own delete" on sessions
  for delete using (auth.uid() = user_id);
```

### テーブル: profiles（v1.3で追加）

```sql
create table profiles (
  id uuid references auth.users(id) primary key,
  username text unique not null,
  avatar_url text,             -- v1.5で追加
  created_at timestamp with time zone default now()
);

alter table profiles enable row level security;
create policy "public read" on profiles
  for select using (auth.uid() is not null);
create policy "own insert" on profiles
  for insert with check (auth.uid() = id);
create policy "own update" on profiles
  for update using (auth.uid() = id);
```

### テーブル: likes（v1.6で追加）

```sql
create table likes (
  id bigint generated always as identity primary key,
  session_id bigint references sessions(id) on delete cascade,
  user_id uuid references auth.users(id),
  created_at timestamp with time zone default now(),
  unique(session_id, user_id)
);

alter table likes enable row level security;
create policy "auth read likes" on likes for select using (auth.uid() is not null);
create policy "own insert like" on likes for insert with check (auth.uid() = user_id);
create policy "own delete like" on likes for delete using (auth.uid() = user_id);
```

### テーブル: comments（v1.6で追加）

```sql
create table comments (
  id bigint generated always as identity primary key,
  session_id bigint references sessions(id) on delete cascade,
  user_id uuid references auth.users(id),
  user_name text,
  avatar_url text,
  body text not null,
  parent_id bigint references comments(id) on delete cascade,  -- nullなら最上位、非nullなら返信
  created_at timestamp with time zone default now()
);

alter table comments enable row level security;
create policy "auth read comments" on comments for select using (auth.uid() is not null);
create policy "own insert comment" on comments for insert with check (auth.uid() = user_id);
create policy "own delete comment" on comments for delete using (auth.uid() = user_id);
```

### RPC: delete_user（v1.7で追加）

アカウント削除時にDBデータとauth.usersを一括削除するサーバー関数。

```sql
create or replace function public.delete_user()
returns void
language plpgsql
security definer
as $$
begin
  delete from public.likes
    where session_id in (select id from public.sessions where user_id = auth.uid());
  delete from public.comments
    where session_id in (select id from public.sessions where user_id = auth.uid());
  delete from public.likes where user_id = auth.uid();
  delete from public.comments where user_id = auth.uid();
  delete from public.sessions where user_id = auth.uid();
  delete from public.profiles where id = auth.uid();
  delete from auth.users where id = auth.uid();
end;
$$;
```

### Storage: sail-images

- **バケット**: `sail-images`（Public）
- **保存パス（セッション画像）**: `{user_id}/{timestamp}_original.jpg` / `{user_id}/{timestamp}_annotated.jpg`
- **保存パス（アバター）**: `avatars/{user_id}_{timestamp}.jpg`

```sql
-- 全ストレージポリシー
create policy "auth users can upload" on storage.objects
  for insert to authenticated with check (bucket_id = 'sail-images');
create policy "auth users can update" on storage.objects
  for update to authenticated using (bucket_id = 'sail-images');
create policy "auth users can delete" on storage.objects
  for delete to authenticated using (bucket_id = 'sail-images');
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
| Storageアップロード400エラー | upsertにUPDATEポリシーが必要 | `auth users can update` ポリシーを追加済み |
