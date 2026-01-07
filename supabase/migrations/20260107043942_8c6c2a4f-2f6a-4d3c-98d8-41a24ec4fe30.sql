-- Tabela para configurações do site (global para todos os visitantes)
CREATE TABLE public.site_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  config_key TEXT NOT NULL UNIQUE,
  config_value TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Permitir leitura pública (todos podem ver as configurações)
ALTER TABLE public.site_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read site config" 
ON public.site_config 
FOR SELECT 
USING (true);

-- Permitir escrita pública (admin não tem autenticação, só senha local)
CREATE POLICY "Anyone can insert site config" 
ON public.site_config 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Anyone can update site config" 
ON public.site_config 
FOR UPDATE 
USING (true);

CREATE POLICY "Anyone can delete site config" 
ON public.site_config 
FOR DELETE 
USING (true);

-- Trigger para atualizar updated_at
CREATE TRIGGER update_site_config_updated_at
BEFORE UPDATE ON public.site_config
FOR EACH ROW
EXECUTE FUNCTION public.set_current_timestamp_updated_at();