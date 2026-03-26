# Configuración de Seguridad y Auth (Supabase)

Para habilitar el sistema de usuarios y la privacidad de datos, debes ejecutar este código SQL:

```sql
-- 1. Si ya tienes la tabla, agrega la columna de usuario
-- ALTER TABLE cabling_data ADD COLUMN user_id uuid DEFAULT auth.uid() REFERENCES auth.users NOT NULL;

-- 2. Si prefieres crearla de cero (RECOMENDADO si no tienes datos importantes aún)
DROP TABLE IF EXISTS cabling_data;

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

-- 3. Habilitar Seguridad (RLS)
ALTER TABLE cabling_data ENABLE ROW LEVEL SECURITY;

-- 4. Crear Política de Privacidad (Cada usuario ve solo lo suyo)
DROP POLICY IF EXISTS "Permitir todo a todos (Anon)" ON cabling_data;

CREATE POLICY "Users can only access their own data" 
  ON cabling_data FOR ALL 
  USING (auth.uid() = user_id);
```

### Instrucciones Finales:
1.  Ve al **SQL Editor** en Supabase.
2.  Pega el código anterior y haz clic en **Run**.
3.  Asegúrate de que en **Authentication -> Providers**, el proveedor de **Email** esté activado (activado por defecto).
