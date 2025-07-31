-- Create words table
CREATE TABLE IF NOT EXISTS public.words (
  id SERIAL PRIMARY KEY,
  word VARCHAR(50) NOT NULL UNIQUE,
  points INTEGER NOT NULL DEFAULT 10,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create teams table
CREATE TABLE IF NOT EXISTS public.teams (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  color VARCHAR(50) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create games table
CREATE TABLE IF NOT EXISTS public.games (
  id SERIAL PRIMARY KEY,
  status VARCHAR(20) DEFAULT 'active',
  current_word_id INTEGER REFERENCES public.words(id),
  current_team_id INTEGER REFERENCES public.teams(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create game_scores table
CREATE TABLE IF NOT EXISTS public.game_scores (
  id SERIAL PRIMARY KEY,
  game_id INTEGER REFERENCES public.games(id),
  team_id INTEGER REFERENCES public.teams(id),
  points INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(game_id, team_id)
);

-- Insert default teams
INSERT INTO public.teams (name, color) VALUES 
  ('Thunder Bolts', 'bg-blue-500'),
  ('Fire Dragons', 'bg-red-500'),
  ('Green Eagles', 'bg-green-500'),
  ('Golden Lions', 'bg-yellow-500')
ON CONFLICT DO NOTHING;

-- Enable RLS on all tables
ALTER TABLE public.words ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_scores ENABLE ROW LEVEL SECURITY;

-- Create policies to allow all operations (you can restrict these later)
CREATE POLICY "Allow all operations on words" ON public.words FOR ALL USING (true);
CREATE POLICY "Allow all operations on teams" ON public.teams FOR ALL USING (true);
CREATE POLICY "Allow all operations on games" ON public.games FOR ALL USING (true);
CREATE POLICY "Allow all operations on game_scores" ON public.game_scores FOR ALL USING (true);
