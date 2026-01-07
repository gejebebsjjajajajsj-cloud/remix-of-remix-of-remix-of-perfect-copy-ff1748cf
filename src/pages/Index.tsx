import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import logo from "@/assets/logo.svg";
import logoMobile from "@/assets/logo_mobile.svg";
import chatIcon from "@/assets/chat.svg";
import { Lock } from "lucide-react";

import { loadSiteConfigFromDB, loadSiteConfig, defaultSiteConfig, SiteConfig } from "@/config/siteConfig";

const subscriptionPlansFromConfig = (config: SiteConfig) => [
  {
    label: config.primaryPlanLabel,
    price: config.primaryPlanPriceText,
    href: config.primaryPlanHref,
  },
];

const Index = () => {
  const [pixModalOpen, setPixModalOpen] = useState(false);
  const [isLoadingPix, setIsLoadingPix] = useState(false);
  const [pixQrBase64, setPixQrBase64] = useState<string | null>(null);
  const [pixCode, setPixCode] = useState<string | null>(null);
  const [pixError, setPixError] = useState<string | null>(null);
  const [currentOrderId, setCurrentOrderId] = useState<string | null>(null);
  const [currentOrderType, setCurrentOrderType] = useState<"subscription" | "whatsapp" | null>(null);
  
  // CPF input state
  const [showCpfModal, setShowCpfModal] = useState(false);
  const [cpfInput, setCpfInput] = useState("");
  const [pendingProduct, setPendingProduct] = useState<"mensalidade" | "whatsapp" | null>(null);
  const [siteConfig, setSiteConfig] = useState<SiteConfig>(defaultSiteConfig);
  const [isLoading, setIsLoading] = useState(true);

  // Carrega configurações do banco de dados + localStorage
  useEffect(() => {
    const loadConfig = async () => {
      setIsLoading(true);
      try {
        // Carrega do banco de dados (textos, cores, etc)
        const dbConfig = await loadSiteConfigFromDB();
        // Carrega do localStorage (mídias locais - apenas para o admin)
        const localConfig = loadSiteConfig();
        // Combina: banco tem prioridade para textos, local para mídias apenas se diferente do padrão
        const mergedConfig = { ...dbConfig };
        
        // Usa mídias do localStorage apenas se foram alteradas
        if (localConfig.heroBannerUrl !== defaultSiteConfig.heroBannerUrl) {
          mergedConfig.heroBannerUrl = localConfig.heroBannerUrl;
        }
        if (localConfig.profileImageUrl !== defaultSiteConfig.profileImageUrl) {
          mergedConfig.profileImageUrl = localConfig.profileImageUrl;
        }
        if (localConfig.mainTeaserVideoUrl !== defaultSiteConfig.mainTeaserVideoUrl) {
          mergedConfig.mainTeaserVideoUrl = localConfig.mainTeaserVideoUrl;
        }
        if (localConfig.secondaryTeaserVideoUrl !== defaultSiteConfig.secondaryTeaserVideoUrl) {
          mergedConfig.secondaryTeaserVideoUrl = localConfig.secondaryTeaserVideoUrl;
        }
        if (localConfig.gridImageUrl !== defaultSiteConfig.gridImageUrl) {
          mergedConfig.gridImageUrl = localConfig.gridImageUrl;
        }
        
        setSiteConfig(mergedConfig);
      } catch (error) {
        console.error("Erro ao carregar configurações:", error);
        setSiteConfig(defaultSiteConfig);
      } finally {
        setIsLoading(false);
      }
    };
    loadConfig();
  }, []);

  useEffect(() => {
    // Track page visit
    supabase.from("analytics_events").insert({ event_type: "visit" });
  }, []);

  useEffect(() => {
    if (!currentOrderId) return;

    const channel = supabase
      .channel("orders-status")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "orders",
          filter: `id=eq.${currentOrderId}`,
        },
        (payload) => {
          const newStatus = (payload.new as any).status;
          if (newStatus === "paid") {
            if (currentOrderType === "whatsapp") {
              window.open(
                "https://chat.whatsapp.com/LgkcC3dkAt908VyoilclWv",
                "_blank",
                "noopener,noreferrer",
              );
            } else if (currentOrderType === "subscription") {
              window.open(
                "https://chat.whatsapp.com/ED0zKAGCwMGCydFzuJpYa9",
                "_blank",
                "noopener,noreferrer",
              );
            }
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentOrderId, currentOrderType]);

  const trackEvent = (eventType: string) => {
    supabase.from("analytics_events").insert({ event_type: eventType });
  };

  const handleOpenCpfModal = (product: "mensalidade" | "whatsapp") => {
    setPendingProduct(product);
    setCpfInput("");
    setShowCpfModal(true);
  };

  const handleCpfSubmit = async () => {
    if (!pendingProduct) return;
    
    const cleanCpf = cpfInput.replace(/\D/g, "");
    if (cleanCpf.length !== 11) {
      alert("CPF deve conter 11 números.");
      return;
    }
    
    setShowCpfModal(false);
    await handlePixCheckout(pendingProduct, cleanCpf);
  };

  const handlePixCheckout = async (product: "mensalidade" | "whatsapp", cpf: string) => {
    try {
      setPixError(null);
      setPixQrBase64(null);
      setPixCode(null);
      setIsLoadingPix(true);
      setPixModalOpen(true);

      const amount = product === "whatsapp" ? 15000 : 2990;

      const { data, error } = await supabase.functions.invoke("tribopay-create-pix", {
        body: {
          name: "Cliente",
          email: "cliente@pagamento.com",
          document: cpf,
          amount,
          type: product === "whatsapp" ? "whatsapp" : "subscription",
        },
      });

      if (error || !data || typeof data !== "object") {
        console.error("Erro ao gerar PIX TriboPay:", error || data);
        setPixError(
          (data as any)?.error ||
            "Não foi possível gerar o pagamento PIX. Tente novamente em alguns minutos.",
        );
        return;
      }

      const anyData = data as any;
      const pixCodeValue = anyData.pix?.code || null;
      const pixImageBase64 = anyData.pix?.imageBase64 || null;

      if (!pixCodeValue) {
        console.error("Resposta inesperada da TriboPay:", anyData);
        setPixError("Resposta inválida do provedor de pagamento.");
        return;
      }

      setPixQrBase64(pixImageBase64);
      setPixCode(pixCodeValue);
      setCurrentOrderId(anyData.orderId || null);
      setCurrentOrderType(product === "whatsapp" ? "whatsapp" : "subscription");
      trackEvent(product === "whatsapp" ? "click_whatsapp_pix" : "click_plan_pix");
    } catch (error) {
      console.error("Erro inesperado ao criar pagamento PIX:", error);
      setPixError("Erro inesperado ao gerar o pagamento PIX.");
    } finally {
      setIsLoadingPix(false);
    }
  };

  const handleCopyPixCode = async () => {
    if (!pixCode) return;
    try {
      await navigator.clipboard.writeText(pixCode);
      alert("Código PIX copiado para a área de transferência.");
    } catch (error) {
      console.error("Erro ao copiar código PIX:", error);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-background text-foreground"
      style={siteConfig.pageBackgroundColor ? { backgroundColor: siteConfig.pageBackgroundColor } : undefined}
    >
      <main className="relative overflow-hidden">
        <header className="container flex items-center justify-between py-6">
          <div className="flex items-center gap-3">
            <img
              src={logo}
              alt="Privacy Kamylinha logo"
              className="hidden h-8 w-auto md:inline-block"
              loading="lazy"
            />
            <img
              src={logoMobile}
              alt="Privacy Kamylinha logo mobile"
              className="inline-block h-9 w-9 md:hidden"
              loading="lazy"
            />
            <div className="leading-tight">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Privacy</p>
              <p className="text-sm font-medium">Perfil exclusivo</p>
            </div>
          </div>
          <Button variant="outline" size="icon" aria-label="Abrir chat com suporte">
            <img src={chatIcon} alt="Abrir chat com suporte" className="h-5 w-5" loading="lazy" />
          </Button>
        </header>

        <section className="container space-y-4 pb-16 pt-4">
          {/* Faixa de capa com contadores */}
          <div
            className="relative flex h-40 items-end justify-end overflow-hidden rounded-3xl bg-cover bg-center bg-no-repeat md:h-48"
            style={{
              backgroundImage: `linear-gradient(0deg, rgba(0,0,0,0.9), transparent), url(${siteConfig.heroBannerUrl})`,
            }}
            aria-label="Capa do perfil com estatísticas"
          >
            <dl className="mr-4 mb-2 flex gap-3 text-xs text-foreground md:mb-3">
              <div className="flex items-baseline gap-1">
                <dt className="sr-only">Posts</dt>
                <dd className="text-sm font-semibold text-foreground">{siteConfig.heroPostsCount}</dd>
                <span className="text-[0.7rem] tracking-wide text-foreground/90">posts</span>
              </div>
              <span className="text-foreground/80">•</span>
              <div className="flex items-baseline gap-1">
                <dt className="sr-only">Curtidas</dt>
                <dd className="text-sm font-semibold text-foreground">{siteConfig.heroLikesCount}</dd>
                <span className="text-[0.7rem] tracking-wide text-foreground/90">likes</span>
              </div>
            </dl>
          </div>

          <div className="flex flex-col gap-6 md:grid md:grid-cols-[auto,minmax(0,1fr)] md:items-start">
            {/* Avatar + nome */}
            <section
              aria-labelledby="perfil-heading"
              className="flex flex-col items-start gap-4 md:flex-row md:items-center"
            >
              <div className="relative -mt-12 md:-mt-16">
                <div className="relative inline-flex items-center justify-center rounded-full border-4 border-destructive shadow-[0_0_20px_rgba(248,113,113,0.8)]">
                  <img
                    src={siteConfig.profileImageUrl}
                    alt="Foto de perfil"
                    className="h-24 w-24 rounded-full object-cover md:h-28 md:w-28"
                    loading="lazy"
                  />
                  <span className="badge-pill absolute -bottom-2 right-0 bg-destructive text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-destructive-foreground shadow-md shadow-destructive/40">
                    AO VIVO
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h1
                    id="perfil-heading"
                    className="font-display text-2xl font-semibold tracking-tight md:text-3xl"
                  >
                    {siteConfig.profileName}
                  </h1>
                  <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-primary">
                    verificado
                  </span>
                </div>
                <p className="mt-1 text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground/80">
                  {siteConfig.profileSubtitle}
                </p>
              </div>
            </section>

            {/* Cartão de planos */}
            <section aria-labelledby="planos-heading" className="space-y-4">
              <header className="space-y-1 text-left">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary">
                  assine agora
                </p>
              </header>

              <div className="mt-2 space-y-3">
                {subscriptionPlansFromConfig(siteConfig).map((plan) => (
                  <Button
                    key={plan.label}
                    variant="cta"
                    className="flex w-full items-center justify-between rounded-2xl px-5 py-4 text-base font-semibold shadow-lg shadow-primary/40 md:text-lg"
                    style={siteConfig.primaryButtonBgColor ? { backgroundColor: siteConfig.primaryButtonBgColor } : undefined}
                    onClick={() => handleOpenCpfModal("mensalidade")}
                  >
                    <span>{plan.label}</span>
                    <span className="flex items-center gap-2 text-sm font-semibold">{plan.price}</span>
                  </Button>
                ))}

                <Button
                  variant="whatsapp"
                  className="flex w-full items-center justify-between rounded-2xl px-5 py-4 text-base font-semibold shadow-lg shadow-emerald-500/40 md:text-lg"
                  style={siteConfig.whatsappButtonBgColor ? { backgroundColor: siteConfig.whatsappButtonBgColor } : undefined}
                  onClick={() => {
                    trackEvent("click_whatsapp");
                    handleOpenCpfModal("whatsapp");
                  }}
                >
                  <span>{siteConfig.whatsappButtonLabel}</span>
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    {siteConfig.whatsappButtonPriceText}
                  </span>
                </Button>
              </div>

              <p className="flex items-center gap-2 text-[0.7rem] text-muted-foreground">
                <Lock className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                <span>
                  Pagamento 100% seguro, cobrança discreta no seu cartão e cancelamento simples a qualquer
                  momento.
                </span>
              </p>
            </section>
          </div>
        </section>
      </main>

      <section
        aria-label="Prévia do conteúdo"
        className="border-t border-border/60 bg-gradient-to-b from-background to-background/40"
      >
        <div className="container space-y-8 py-10">
          <div className="grid gap-4" aria-label="Prévia em vídeo do conteúdo">
            <figure className="card-elevated overflow-hidden rounded-3xl">
              <video
                src={siteConfig.mainTeaserVideoUrl}
                className="h-full w-full object-cover"
                controls
                playsInline
                muted
              />
            </figure>
          </div>

          <figure
            className="card-elevated overflow-hidden rounded-3xl"
            aria-label="Prévia em foto do feed"
          >
            <img
              src={siteConfig.gridImageUrl}
              alt="Prévia do feed com fotos"
              className="h-full w-full object-cover"
              loading="lazy"
            />
          </figure>
        </div>
      </section>

      {/* Modal para pedir CPF */}
      <Dialog open={showCpfModal} onOpenChange={setShowCpfModal}>
        <DialogContent className="max-w-sm animate-enter rounded-3xl border border-border bg-background/95 px-6 py-5 shadow-xl shadow-primary/30">
          <DialogHeader className="space-y-2 text-center">
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.25em] text-primary">
              pagamento seguro
            </p>
            <DialogTitle className="text-lg font-semibold tracking-tight">
              Informe seu CPF
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              Digite seu CPF para gerar o pagamento PIX.
            </p>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            <input
              type="text"
              inputMode="numeric"
              placeholder="000.000.000-00"
              value={cpfInput}
              onChange={(e) => setCpfInput(e.target.value.replace(/\D/g, "").slice(0, 11))}
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-center text-lg tracking-wider focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <Button
              variant="cta"
              className="w-full rounded-2xl py-3 text-base font-semibold shadow-lg shadow-primary/40"
              onClick={handleCpfSubmit}
              disabled={cpfInput.replace(/\D/g, "").length !== 11}
            >
              Gerar PIX
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={pixModalOpen} onOpenChange={setPixModalOpen}>
        <DialogContent className="max-w-sm animate-enter rounded-3xl border border-border bg-background/95 px-6 py-5 shadow-xl shadow-primary/30">
          <DialogHeader className="space-y-2 text-center">
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.25em] text-primary">
              pagamento seguro
            </p>
            <DialogTitle className="text-lg font-semibold tracking-tight">
              Pague com PIX
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              Escaneie o QR Code ou use o código copia e cola para concluir o pagamento.
            </p>
          </DialogHeader>

          {isLoadingPix && (
            <p className="mt-4 text-center text-sm text-muted-foreground">
              Gerando seu PIX, aguarde alguns segundos…
            </p>
          )}

          {!isLoadingPix && pixError && (
            <p className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-center text-sm text-destructive">
              {pixError}
            </p>
          )}

          {!isLoadingPix && (pixQrBase64 || pixCode) && (
            <div className="mt-4 space-y-4">
              {pixQrBase64 && (
                <div className="flex justify-center">
                  <div className="rounded-2xl border border-border bg-card p-3 shadow-lg shadow-primary/20">
                    <img
                      src={`data:image/png;base64,${pixQrBase64}`}
                      alt="QR Code PIX para pagamento"
                      className="h-48 w-48 rounded-xl object-contain"
                    />
                  </div>
                </div>
              )}

              {pixCode && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    código copia e cola
                  </p>
                  <div className="flex flex-col gap-2 rounded-2xl border border-border bg-muted/40 p-2">
                    <textarea
                      readOnly
                      value={pixCode}
                      rows={3}
                      className="w-full resize-none border-none bg-transparent text-center text-xs text-foreground focus:outline-none"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full rounded-xl text-xs"
                      onClick={handleCopyPixCode}
                    >
                      Copiar código
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <footer className="border-t border-border/40 py-4 text-center text-[0.65rem] text-muted-foreground">
        <p>© {new Date().getFullYear()} Privacy. Todos os direitos reservados.</p>
      </footer>
    </div>
  );
};

export default Index;
