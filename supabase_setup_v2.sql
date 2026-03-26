-- 1. Reiniciar tabla (¡CUIDADO! Esto borra datos actuales si los hay)
DROP TABLE IF EXISTS cabling_data CASCADE;

CREATE TABLE cabling_data (
  id text PRIMARY KEY,
  user_id uuid DEFAULT auth.uid() REFERENCES auth.users NOT NULL,
  fecha date,
  cdno text,
  patchpanel text,
  puerto int,
  cliente text,
  origen text,
  destino text,
  observaciones text,
  ruta text,
  created_at timestamp with time zone DEFAULT now()
);

-- 2. Habilitar Seguridad (RLS)
ALTER TABLE cabling_data ENABLE ROW LEVEL SECURITY;

-- 3. Crear Política de Privacidad (Cada usuario ve solo sus datos)
CREATE POLICY "Users can only access their own data" 
  ON cabling_data FOR ALL 
  USING (auth.uid() = user_id);
