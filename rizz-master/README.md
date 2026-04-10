# Rizz Master

Your AI-powered dating wingman! 💬✨

## Features

- 🔥 AI-powered rizz generation (Tease, Smooth, Chaotic styles)
- 📸 Image analysis for context-aware responses
- ✨ Perfect bio generator
- ♥ Save your favorite responses
- 👑 Premium subscriptions with unlimited generations
- 📱 Mobile-first design with Capacitor support

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure Supabase:**
   - Copy `.env.example` to `.env`
   - Add your Supabase project URL and anon key
   - Set up the following tables in Supabase:
     - `profiles` (id, email, credits, is_premium, last_daily_reset, created_at)
     - `saved_items` (id, user_id, content, type, created_at)

3. **Run development server:**
   ```bash
   npm run dev
   ```

4. **Build for production:**
   ```bash
   npm run build
   ```

## Supabase Database Schema

```sql
-- Profiles table
create table profiles (
  id uuid references auth.users primary key,
  email text,
  credits int default 5,
  is_premium boolean default false,
  last_daily_reset date,
  created_at timestamp with time zone default now()
);

-- Saved items table
create table saved_items (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references profiles(id) on delete cascade,
  content text not null,
  type text check (type in ('tease', 'smooth', 'chaotic', 'bio')),
  created_at timestamp with time zone default now()
);

-- Enable Row Level Security
alter table profiles enable row level security;
alter table saved_items enable row level security;

-- Profiles policies
create policy "Users can view own profile"
  on profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on profiles for update
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on profiles for insert
  with check (auth.uid() = id);

-- Saved items policies
create policy "Users can view own saved items"
  on saved_items for select
  using (auth.uid() = user_id);

create policy "Users can insert own saved items"
  on saved_items for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own saved items"
  on saved_items for delete
  using (auth.uid() = user_id);
```

## Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project
3. Enable Google+ API
4. Configure OAuth consent screen
5. Create OAuth 2.0 credentials
6. Add authorized redirect URIs in Supabase Dashboard

## Tech Stack

- React 18 + TypeScript
- Vite
- Supabase (Auth + Database)
- Capacitor (Mobile support)
- TailwindCSS (via utility classes)

## License

MIT
