CREATE TABLE public.mp_servers (
  address text PRIMARY KEY,
  name text NOT NULL,
  motd text NOT NULL DEFAULT '',
  icon text NOT NULL DEFAULT 'diamond',
  seed bigint NOT NULL,
  owner_name text NOT NULL DEFAULT 'Steve',
  has_password boolean NOT NULL DEFAULT false,
  password_hash text,
  owner_token_hash text NOT NULL,
  banned text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT (address, name, motd, icon, seed, owner_name, has_password, created_at, last_seen) ON public.mp_servers TO anon, authenticated;
GRANT ALL ON public.mp_servers TO service_role;
ALTER TABLE public.mp_servers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public servers are visible to everyone" ON public.mp_servers FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.mp_blocks (
  address text NOT NULL REFERENCES public.mp_servers(address) ON DELETE CASCADE,
  x integer NOT NULL,
  y integer NOT NULL,
  z integer NOT NULL,
  block_id integer NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (address, x, y, z)
);
GRANT ALL ON public.mp_blocks TO service_role;
ALTER TABLE public.mp_blocks ENABLE ROW LEVEL SECURITY;