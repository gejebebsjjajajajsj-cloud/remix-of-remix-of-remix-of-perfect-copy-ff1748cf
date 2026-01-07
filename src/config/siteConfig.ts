import banner from "@/assets/banner-user-2.jpg";
import profilePhoto from "@/assets/profile-photo.png";
import teaserMain from "@/assets/teaser-bolzani-1.mp4";
import teaserAlt1 from "@/assets/kamy02.mp4";
import bolzaniGrid from "@/assets/bolzani-instagram-grid.jpg";
import { supabase } from "@/integrations/supabase/client";

export const SITE_CONFIG_STORAGE_KEY = "site_admin_config_v1";

// Detecta automaticamente o site pelo domínio
const getSiteId = (): string => {
  if (typeof window === "undefined") return "development";
  const hostname = window.location.hostname;
  
  // Se for domínio da Vercel ou domínio próprio, é produção
  if (hostname.includes(".vercel.app") || (!hostname.includes("lovable.app") && !hostname.includes("localhost"))) {
    return "production";
  }
  
  // Lovable ou localhost = desenvolvimento
  return "development";
};

export const SITE_ID = getSiteId();

export type SiteConfig = {
  pageBackgroundColor: string;
  heroBannerUrl: string;
  heroPostsCount: string;
  heroLikesCount: string;
  profileName: string;
  profileSubtitle: string;
  profileImageUrl: string;
  primaryPlanLabel: string;
  primaryPlanPriceText: string;
  primaryPlanHref: string;
  whatsappButtonLabel: string;
  whatsappButtonPriceText: string;
  mainTeaserVideoUrl: string;
  secondaryTeaserVideoUrl: string;
  gridImageUrl: string;
  primaryButtonBgColor: string;
  whatsappButtonBgColor: string;
};

export const defaultSiteConfig: SiteConfig = {
  pageBackgroundColor: "",
  heroBannerUrl: banner,
  heroPostsCount: "744",
  heroLikesCount: "370k",
  profileName: "Tainá Costa",
  profileSubtitle: "Conteúdo adulto exclusivo",
  profileImageUrl: profilePhoto,
  primaryPlanLabel: "Assinar (30 dias)",
  primaryPlanPriceText: "R$ 29,90",
  primaryPlanHref: "https://pay.privecy.com.br/checkout/2985a976-e091-4962-a8ca-c61e446f8387",
  whatsappButtonLabel: "Chamar no WhatsApp",
  whatsappButtonPriceText: "R$ 150,00",
  mainTeaserVideoUrl: teaserMain,
  secondaryTeaserVideoUrl: teaserAlt1,
  gridImageUrl: bolzaniGrid,
  primaryButtonBgColor: "",
  whatsappButtonBgColor: "",
};

// Campos que não devem ser salvos no banco (são muito grandes ou são assets locais)
const LOCAL_ONLY_FIELDS: (keyof SiteConfig)[] = [
  "heroBannerUrl",
  "profileImageUrl", 
  "mainTeaserVideoUrl",
  "secondaryTeaserVideoUrl",
  "gridImageUrl",
];

// Carrega configurações do banco de dados
export const loadSiteConfigFromDB = async (siteId: string = SITE_ID): Promise<SiteConfig> => {
  try {
    const { data, error } = await supabase
      .from("site_config")
      .select("config_key, config_value")
      .eq("site_id", siteId);

    if (error) {
      console.error("Erro ao carregar configurações do banco:", error);
      return defaultSiteConfig;
    }

    if (!data || data.length === 0) {
      return defaultSiteConfig;
    }

    const configFromDB: Partial<SiteConfig> = {};
    for (const row of data) {
      (configFromDB as any)[row.config_key] = row.config_value;
    }

    return { ...defaultSiteConfig, ...configFromDB };
  } catch (error) {
    console.error("Erro ao carregar configurações:", error);
    return defaultSiteConfig;
  }
};

// Salva configurações no banco de dados
export const saveSiteConfigToDB = async (config: SiteConfig, siteId: string = SITE_ID): Promise<boolean> => {
  try {
    const entries = Object.entries(config).filter(
      ([key, value]) => 
        !LOCAL_ONLY_FIELDS.includes(key as keyof SiteConfig) && 
        value !== defaultSiteConfig[key as keyof SiteConfig]
    );

    // Upsert cada configuração
    for (const [key, value] of entries) {
      const { error } = await supabase
        .from("site_config")
        .upsert(
          { config_key: key, config_value: String(value), site_id: siteId },
          { onConflict: "config_key,site_id" }
        );

      if (error) {
        console.error(`Erro ao salvar ${key}:`, error);
      }
    }

    // Remove configurações que voltaram ao padrão
    const keysToRemove = Object.entries(config)
      .filter(
        ([key, value]) => 
          !LOCAL_ONLY_FIELDS.includes(key as keyof SiteConfig) && 
          value === defaultSiteConfig[key as keyof SiteConfig]
      )
      .map(([key]) => key);

    if (keysToRemove.length > 0) {
      await supabase
        .from("site_config")
        .delete()
        .eq("site_id", siteId)
        .in("config_key", keysToRemove);
    }

    return true;
  } catch (error) {
    console.error("Erro ao salvar configurações:", error);
    return false;
  }
};

// Funções legadas mantidas para compatibilidade (agora usam apenas localStorage para assets locais)
export const loadSiteConfig = (): SiteConfig => {
  if (typeof window === "undefined") return defaultSiteConfig;

  try {
    const stored = window.localStorage.getItem(SITE_CONFIG_STORAGE_KEY);
    if (!stored) return defaultSiteConfig;

    const parsed = JSON.parse(stored) as Partial<SiteConfig>;
    return { ...defaultSiteConfig, ...parsed };
  } catch {
    return defaultSiteConfig;
  }
};

export const saveSiteConfig = (config: SiteConfig) => {
  if (typeof window === "undefined") return;

  // Salva apenas os campos de mídia local no localStorage
  const localConfig: Partial<SiteConfig> = {};
  for (const field of LOCAL_ONLY_FIELDS) {
    if (config[field] !== defaultSiteConfig[field]) {
      localConfig[field] = config[field];
    }
  }

  window.localStorage.setItem(SITE_CONFIG_STORAGE_KEY, JSON.stringify(localConfig));
};

// Remove um campo de mídia específico (volta ao padrão)
export const resetMediaField = (field: keyof SiteConfig): SiteConfig => {
  const current = loadSiteConfig();
  const updated = { ...current, [field]: defaultSiteConfig[field] };
  saveSiteConfig(updated);
  return updated;
};
