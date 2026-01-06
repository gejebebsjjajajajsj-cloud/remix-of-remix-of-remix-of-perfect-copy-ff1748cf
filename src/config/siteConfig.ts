import banner from "@/assets/banner-user-2.jpg";
import profileBolzani from "@/assets/profile-bolzani.jpg";
import teaserMain from "@/assets/teaser-bolzani-1.mp4";
import teaserAlt1 from "@/assets/kamy02.mp4";
import teaserAlt2 from "@/assets/kamy03.mp4";
import bolzaniGrid from "@/assets/bolzani-instagram-grid.jpg";

export const SITE_CONFIG_STORAGE_KEY = "site_admin_config_v1";

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
  profileName: "Bolzani",
  profileSubtitle: "Conteúdo adulto exclusivo",
  profileImageUrl: profileBolzani,
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

  window.localStorage.setItem(SITE_CONFIG_STORAGE_KEY, JSON.stringify(config));
};
