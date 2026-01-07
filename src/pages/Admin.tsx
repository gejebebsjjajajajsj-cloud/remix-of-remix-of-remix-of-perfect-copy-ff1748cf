import { useState, ChangeEvent, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Eye,
  EyeOff,
  Menu,
  TrendingUp,
  MousePointer,
  MessageCircle,
  DollarSign,
  Palette,
  Image,
  Video,
  Type,
  Trash2,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { 
  defaultSiteConfig, 
  loadSiteConfig, 
  saveSiteConfig, 
  loadSiteConfigFromDB, 
  saveSiteConfigToDB,
  resetMediaField,
  SiteConfig 
} from "@/config/siteConfig";
import { supabase } from "@/integrations/supabase/client";

const ADMIN_PASSWORD = "admin123"; // Altere para uma senha segura

const Admin = () => {
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [panelConfig, setPanelConfig] = useState<SiteConfig>(defaultSiteConfig);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [stats, setStats] = useState({
    visits: 0,
    clicksPlan: 0,
    clicksWhatsApp: 0,
    payments: 0,
    revenue: 0,
  });

  const today = new Date().toLocaleDateString("pt-BR");

  // Carrega configurações do banco + localStorage
  useEffect(() => {
    const loadConfig = async () => {
      setIsLoading(true);
      try {
        // Carrega do banco de dados (textos, cores, etc)
        const dbConfig = await loadSiteConfigFromDB();
        // Carrega do localStorage (mídias locais)
        const localConfig = loadSiteConfig();
        // Combina: banco tem prioridade para textos, local para mídias
        setPanelConfig({ ...dbConfig, ...localConfig });
      } catch (error) {
        console.error("Erro ao carregar configurações:", error);
        setPanelConfig(defaultSiteConfig);
      } finally {
        setIsLoading(false);
      }
    };
    loadConfig();
  }, []);

  useEffect(() => {
    const loadStats = async () => {
      try {
        const [visitsRes, clicksPlanRes, clicksWhatsRes, ordersRes] = await Promise.all([
          supabase.from("analytics_events").select("*", { count: "exact", head: true }).eq("event_type", "visit"),
          supabase.from("analytics_events").select("*", { count: "exact", head: true }).eq("event_type", "click_plan_pix"),
          supabase.from("analytics_events").select("*", { count: "exact", head: true }).in("event_type", ["click_whatsapp", "click_whatsapp_pix"]),
          supabase.from("orders").select("amount_cents,status", { count: "exact" }).eq("status", "paid"),
        ]);

        const visits = visitsRes.count || 0;
        const clicksPlan = clicksPlanRes.count || 0;
        const clicksWhatsApp = clicksWhatsRes.count || 0;
        const payments = ordersRes.count || 0;
        const revenue = (ordersRes.data || []).reduce(
          (acc, row: any) => (row.status === "paid" ? acc + (row.amount_cents || 0) : acc),
          0,
        ) / 100;

        setStats({ visits, clicksPlan, clicksWhatsApp, payments, revenue });
      } catch (error) {
        console.error("Erro ao carregar estatísticas do painel:", error);
      }
    };

    loadStats();
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === ADMIN_PASSWORD) {
      setAuthenticated(true);
      toast.success("Autenticado com sucesso!");
    } else {
      toast.error("Senha incorreta");
    }
  };

  const handleSaveConfig = async () => {
    setIsSaving(true);
    try {
      // Salva textos e cores no banco de dados
      const success = await saveSiteConfigToDB(panelConfig);
      // Salva mídias no localStorage
      saveSiteConfig(panelConfig);
      
      if (success) {
        toast.success("Configurações salvas para todos os visitantes!");
      } else {
        toast.error("Erro ao salvar algumas configurações.");
      }
    } catch (error) {
      console.error("Erro ao salvar:", error);
      toast.error("Erro ao salvar configurações.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleImageUpload = (
    field:
      | "heroBannerUrl"
      | "profileImageUrl"
      | "gridImageUrl"
      | "mainTeaserVideoUrl"
      | "secondaryTeaserVideoUrl",
  ) => (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Verifica tamanho do arquivo (max 5MB para imagens, 50MB para vídeos)
    const isVideo = field.includes("Video");
    const maxSize = isVideo ? 50 * 1024 * 1024 : 5 * 1024 * 1024;
    
    if (file.size > maxSize) {
      toast.error(`Arquivo muito grande. Máximo: ${isVideo ? '50MB' : '5MB'}`);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setPanelConfig((current) => ({
        ...current,
        [field]: result,
      }));
      toast.success(`${isVideo ? 'Vídeo' : 'Imagem'} carregado! Clique em Salvar para aplicar.`);
    };

    reader.readAsDataURL(file);
  };

  const handleRemoveMedia = (field: keyof SiteConfig) => {
    const updated = resetMediaField(field);
    setPanelConfig(updated);
    toast.success("Mídia removida. Voltou ao padrão.");
  };

  const handleResetConfig = async () => {
    setPanelConfig(defaultSiteConfig);
    saveSiteConfig(defaultSiteConfig);
    // Remove todas as configurações do banco
    await supabase.from("site_config").delete().neq("config_key", "");
    toast.success("Configurações resetadas para o padrão.");
  };

  if (!authenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md space-y-6 p-8">
          <div className="space-y-2 text-center">
            <h1 className="text-3xl font-bold">Painel Admin</h1>
            <p className="text-sm text-muted-foreground">Digite a senha para acessar</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="Senha"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <Button type="submit" className="w-full">
              Entrar
            </Button>
          </form>
        </Card>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-gradient-to-b from-background to-muted/30 p-3 md:p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex items-center justify-between gap-3 rounded-xl bg-card/60 px-3 py-2 shadow-sm md:gap-4 md:px-4 md:py-3">
          <div className="flex items-center gap-2 md:gap-3">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 md:h-9 md:w-9"
              onClick={() => setShowEditor(true)}
            >
              <Menu className="h-4 w-4 md:h-5 md:w-5" />
            </Button>
            <div>
              <h1 className="text-base font-semibold tracking-tight md:text-xl">Painel financeiro</h1>
              <p className="text-[10px] text-muted-foreground md:text-xs">
                Faturamento e desempenho geral - {today}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-3 text-xs md:h-9 md:px-4 md:text-sm"
            onClick={() => setAuthenticated(false)}
          >
            Sair
          </Button>
        </header>

        <section className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4 md:gap-4">
            <Card className="space-y-2 p-4 md:p-6">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-primary/10 p-2.5 md:p-3">
                  <TrendingUp className="h-4 w-4 text-primary md:h-5 md:w-5" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground md:text-sm">Visitas</p>
                  <p className="text-xl font-bold md:text-2xl">{stats.visits}</p>
                </div>
              </div>
            </Card>

            <Card className="space-y-2 p-4 md:p-6">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-primary/10 p-2.5 md:p-3">
                  <MousePointer className="h-4 w-4 text-primary md:h-5 md:w-5" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground md:text-sm">Cliques no plano</p>
                  <p className="text-xl font-bold md:text-2xl">{stats.clicksPlan}</p>
                </div>
              </div>
            </Card>

            <Card className="space-y-2 p-4 md:p-6">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-emerald-500/10 p-2.5 md:p-3">
                  <MessageCircle className="h-4 w-4 text-emerald-500 md:h-5 md:w-5" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground md:text-sm">Cliques no WhatsApp</p>
                  <p className="text-xl font-bold md:text-2xl">{stats.clicksWhatsApp}</p>
                </div>
              </div>
            </Card>

            <Card className="space-y-2 p-4 md:p-6">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-yellow-500/10 p-2.5 md:p-3">
                  <DollarSign className="h-4 w-4 text-yellow-500 md:h-5 md:w-5" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground md:text-sm">Vendas confirmadas</p>
                  <p className="text-xl font-bold md:text-2xl">{stats.payments}</p>
                </div>
              </div>
            </Card>
          </div>

          <div className="grid gap-3 md:grid-cols-3 md:gap-4">
            <Card className="space-y-2 p-4 md:p-6">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-primary/10 p-2.5 md:p-3">
                  <DollarSign className="h-4 w-4 text-primary md:h-5 md:w-5" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground md:text-sm">Faturamento de hoje</p>
                  <p className="text-xl font-bold md:text-2xl">
                    R$ {stats.revenue.toFixed(2).replace(".", ",")}
                  </p>
                  <p className="text-[10px] text-muted-foreground md:text-xs">Data de hoje: {today}</p>
                </div>
              </div>
            </Card>

            <Card className="space-y-2 p-4 md:p-6">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-primary/10 p-2.5 md:p-3">
                  <TrendingUp className="h-4 w-4 text-primary md:h-5 md:w-5" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground md:text-sm">Ticket médio</p>
                  <p className="text-xl font-bold md:text-2xl">
                    R$
                    {" "}
                    {(stats.payments ? stats.revenue / stats.payments : 0)
                      .toFixed(2)
                      .replace(".", ",")}
                  </p>
                  <p className="text-[10px] text-muted-foreground md:text-xs">
                    Faturamento dividido pelo número de vendas
                  </p>
                </div>
              </div>
            </Card>

            <Card className="space-y-2 p-4 md:p-6">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-primary/10 p-2.5 md:p-3">
                  <TrendingUp className="h-4 w-4 text-primary md:h-5 md:w-5" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground md:text-sm">Taxa de conversão</p>
                  <p className="text-xl font-bold md:text-2xl">
                    {(stats.visits ? (stats.payments / stats.visits) * 100 : 0)
                      .toFixed(1)
                      .replace(".", ",")}
                    %
                  </p>
                  <p className="text-[10px] text-muted-foreground md:text-xs">
                    Vendas sobre visitas totais
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </section>
      </div>

      {showEditor && (
        <div className="fixed inset-0 z-40 flex bg-background/80 backdrop-blur-sm">
          {/* Sidebar desktop */}
          <aside className="hidden h-full w-56 flex-col border-r border-border bg-card/95 md:flex">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Menu className="h-4 w-4" />
                <span>Menu admin</span>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => setShowEditor(false)}
              >
                <EyeOff className="h-4 w-4" />
              </Button>
            </div>

            <nav className="flex-1 space-y-1 px-3 py-4 text-sm">
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-lg bg-primary/10 px-3 py-2 text-left text-primary shadow-sm transition hover:bg-primary/15"
              >
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-primary/20">
                  <Palette className="h-3 w-3" />
                </span>
                <span>Configurações</span>
              </button>
            </nav>

            <div className="border-t border-border px-3 py-3 text-[11px] text-muted-foreground">
              <p>Painel de edição da página principal.</p>
            </div>
          </aside>

          {/* Área principal de configuração */}
          <section className="flex-1 overflow-y-auto bg-background px-3 py-3 md:px-6 md:py-6">
            <div className="mx-auto flex max-w-3xl flex-col gap-4">
              <header className="flex flex-col gap-2 rounded-lg border border-border/60 bg-card/90 px-3 py-2 text-xs md:flex-row md:items-center md:justify-between md:rounded-xl md:px-4 md:py-3 md:text-sm">
                <div className="space-y-0.5">
                  <div className="flex items-center justify-between gap-2 md:gap-3">
                    <div>
                      <h2 className="text-sm font-semibold tracking-tight md:text-base">
                        Configurações da página
                      </h2>
                      <p className="text-[11px] text-muted-foreground">
                        Edite tudo que aparece na página principal. As mudanças valem para todos!
                      </p>
                    </div>
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-7 w-7 shrink-0 md:hidden"
                      onClick={() => setShowEditor(false)}
                    >
                      <EyeOff className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <div className="flex gap-1.5 pt-1 md:gap-2 md:pt-0">
                  <Button 
                    className="h-8 px-3 text-[11px] md:h-8 md:px-4 md:text-xs" 
                    size="sm" 
                    onClick={handleSaveConfig}
                    disabled={isSaving}
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        Salvando...
                      </>
                    ) : (
                      "Salvar"
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 px-3 text-[11px] md:h-8 md:px-4 md:text-xs"
                    onClick={handleResetConfig}
                  >
                    Resetar
                  </Button>
                </div>
              </header>

              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <span className="ml-2 text-muted-foreground">Carregando configurações...</span>
                </div>
              ) : (
                <div className="space-y-3 pb-3 text-xs md:space-y-4 md:text-sm">
                  {/* Cores */}
                  <Card className="space-y-2.5 p-3 md:space-y-3 md:p-4">
                    <div className="flex items-center gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 md:h-8 md:w-8">
                        <Palette className="h-3 w-3 text-primary md:h-4 md:w-4" />
                      </div>
                      <div>
                        <h3 className="text-xs font-semibold md:text-sm">Cores da página</h3>
                        <p className="text-[10px] text-muted-foreground md:text-xs">
                          Fundo da página e cores dos botões.
                        </p>
                      </div>
                    </div>
                    <div className="grid gap-2 md:grid-cols-3 md:gap-3">
                      <div className="space-y-1">
                        <p className="text-[10px] font-medium text-muted-foreground">Cor de fundo</p>
                        <Input
                          type="color"
                          value={panelConfig.pageBackgroundColor || "#000000"}
                          onChange={(e) =>
                            setPanelConfig({ ...panelConfig, pageBackgroundColor: e.target.value })
                          }
                          className="h-9 w-full cursor-pointer rounded-md border border-border bg-transparent p-1"
                        />
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-medium text-muted-foreground">Botão principal</p>
                        <Input
                          type="color"
                          value={panelConfig.primaryButtonBgColor || "#ff0000"}
                          onChange={(e) =>
                            setPanelConfig({ ...panelConfig, primaryButtonBgColor: e.target.value })
                          }
                          className="h-9 w-full cursor-pointer rounded-md border border-border bg-transparent p-1"
                        />
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-medium text-muted-foreground">Botão WhatsApp</p>
                        <Input
                          type="color"
                          value={panelConfig.whatsappButtonBgColor || "#25D366"}
                          onChange={(e) =>
                            setPanelConfig({ ...panelConfig, whatsappButtonBgColor: e.target.value })
                          }
                          className="h-9 w-full cursor-pointer rounded-md border border-border bg-transparent p-1"
                        />
                      </div>
                    </div>
                  </Card>

                  {/* Textos e botões */}
                  <Card className="space-y-2.5 p-3 md:space-y-3 md:p-4">
                    <div className="flex items-center gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 md:h-8 md:w-8">
                        <Type className="h-3 w-3 text-primary md:h-4 md:w-4" />
                      </div>
                      <div>
                        <h3 className="text-xs font-semibold md:text-sm">Textos e botões</h3>
                        <p className="text-[10px] text-muted-foreground md:text-xs">
                          Nome, subtítulo e textos dos botões.
                        </p>
                      </div>
                    </div>
                    <div className="grid gap-2 md:grid-cols-2 md:gap-3">
                      <div className="space-y-1">
                        <p className="text-[10px] font-medium text-muted-foreground">Nome do perfil</p>
                        <Input
                          placeholder="Nome do perfil"
                          value={panelConfig.profileName}
                          onChange={(e) =>
                            setPanelConfig({ ...panelConfig, profileName: e.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-medium text-muted-foreground">Subtítulo</p>
                        <Input
                          placeholder="Subtítulo do perfil"
                          value={panelConfig.profileSubtitle}
                          onChange={(e) =>
                            setPanelConfig({ ...panelConfig, profileSubtitle: e.target.value })
                          }
                        />
                      </div>
                    </div>
                    <div className="grid gap-2 md:grid-cols-2 md:gap-3">
                      <div className="space-y-1">
                        <p className="text-[10px] font-medium text-muted-foreground">Texto botão principal</p>
                        <Input
                          placeholder="Ex: Assinar agora"
                          value={panelConfig.primaryPlanLabel}
                          onChange={(e) =>
                            setPanelConfig({ ...panelConfig, primaryPlanLabel: e.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-medium text-muted-foreground">Preço botão principal</p>
                        <Input
                          placeholder="Ex: R$ 29,90"
                          value={panelConfig.primaryPlanPriceText}
                          onChange={(e) =>
                            setPanelConfig({ ...panelConfig, primaryPlanPriceText: e.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-medium text-muted-foreground">Texto botão WhatsApp</p>
                        <Input
                          placeholder="Ex: Chamar no WhatsApp"
                          value={panelConfig.whatsappButtonLabel}
                          onChange={(e) =>
                            setPanelConfig({ ...panelConfig, whatsappButtonLabel: e.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-medium text-muted-foreground">Preço botão WhatsApp</p>
                        <Input
                          placeholder="Ex: R$ 150,00"
                          value={panelConfig.whatsappButtonPriceText}
                          onChange={(e) =>
                            setPanelConfig({ ...panelConfig, whatsappButtonPriceText: e.target.value })
                          }
                        />
                      </div>
                    </div>
                  </Card>

                  {/* Fotos e banner */}
                  <Card className="space-y-2.5 p-3 md:space-y-3 md:p-4">
                    <div className="flex items-center gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 md:h-8 md:w-8">
                        <Image className="h-3 w-3 text-primary md:h-4 md:w-4" />
                      </div>
                      <div>
                        <h3 className="text-xs font-semibold md:text-sm">Fotos e banner</h3>
                        <p className="text-[10px] text-muted-foreground md:text-xs">
                          Imagem de capa, foto de perfil e foto de grid. (Máximo 5MB)
                        </p>
                      </div>
                    </div>
                    <div className="space-y-2 md:space-y-3">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] font-medium text-muted-foreground">Banner principal</p>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-[10px] text-destructive hover:text-destructive"
                            onClick={() => handleRemoveMedia("heroBannerUrl")}
                          >
                            <Trash2 className="h-3 w-3 mr-1" />
                            Remover
                          </Button>
                        </div>
                        <Input
                          type="file"
                          accept="image/*"
                          onChange={handleImageUpload("heroBannerUrl")}
                          className="cursor-pointer"
                        />
                      </div>
                      <div className="grid gap-2 md:grid-cols-2 md:gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <p className="text-[10px] font-medium text-muted-foreground">Foto de perfil</p>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-[10px] text-destructive hover:text-destructive"
                              onClick={() => handleRemoveMedia("profileImageUrl")}
                            >
                              <Trash2 className="h-3 w-3 mr-1" />
                              Remover
                            </Button>
                          </div>
                          <Input
                            type="file"
                            accept="image/*"
                            onChange={handleImageUpload("profileImageUrl")}
                            className="cursor-pointer"
                          />
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <p className="text-[10px] font-medium text-muted-foreground">Foto de grid/feed</p>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-[10px] text-destructive hover:text-destructive"
                              onClick={() => handleRemoveMedia("gridImageUrl")}
                            >
                              <Trash2 className="h-3 w-3 mr-1" />
                              Remover
                            </Button>
                          </div>
                          <Input
                            type="file"
                            accept="image/*"
                            onChange={handleImageUpload("gridImageUrl")}
                            className="cursor-pointer"
                          />
                        </div>
                      </div>
                    </div>
                  </Card>

                  {/* Vídeos */}
                  <Card className="space-y-2.5 p-3 md:space-y-3 md:p-4">
                    <div className="flex items-center gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 md:h-8 md:w-8">
                        <Video className="h-3 w-3 text-primary md:h-4 md:w-4" />
                      </div>
                      <div>
                        <h3 className="text-xs font-semibold md:text-sm">Vídeos de prévia</h3>
                        <p className="text-[10px] text-muted-foreground md:text-xs">
                          Vídeos que aparecem na parte de baixo da página. (Máximo 50MB)
                        </p>
                      </div>
                    </div>
                    <div className="space-y-2 md:space-y-3">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] font-medium text-muted-foreground">Vídeo principal</p>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-[10px] text-destructive hover:text-destructive"
                            onClick={() => handleRemoveMedia("mainTeaserVideoUrl")}
                          >
                            <Trash2 className="h-3 w-3 mr-1" />
                            Remover
                          </Button>
                        </div>
                        <Input
                          type="file"
                          accept="video/*"
                          onChange={handleImageUpload("mainTeaserVideoUrl")}
                          className="cursor-pointer"
                        />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] font-medium text-muted-foreground">Segundo vídeo</p>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-[10px] text-destructive hover:text-destructive"
                            onClick={() => handleRemoveMedia("secondaryTeaserVideoUrl")}
                          >
                            <Trash2 className="h-3 w-3 mr-1" />
                            Remover
                          </Button>
                        </div>
                        <Input
                          type="file"
                          accept="video/*"
                          onChange={handleImageUpload("secondaryTeaserVideoUrl")}
                          className="cursor-pointer"
                        />
                      </div>
                    </div>
                  </Card>

                  {/* Métricas da capa */}
                  <Card className="space-y-2.5 p-3 md:space-y-3 md:p-4">
                    <div className="flex items-center gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 md:h-8 md:w-8">
                        <TrendingUp className="h-3 w-3 text-primary md:h-4 md:w-4" />
                      </div>
                      <div>
                        <h3 className="text-xs font-semibold md:text-sm">Métricas da capa</h3>
                        <p className="text-[10px] text-muted-foreground md:text-xs">
                          Números que aparecem em cima do banner (posts e likes).
                        </p>
                      </div>
                    </div>
                    <div className="grid gap-2 md:grid-cols-2 md:gap-3">
                      <div className="space-y-1">
                        <p className="text-[10px] font-medium text-muted-foreground">Número de posts</p>
                        <Input
                          placeholder="Ex: 744"
                          value={panelConfig.heroPostsCount}
                          onChange={(e) =>
                            setPanelConfig({ ...panelConfig, heroPostsCount: e.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-medium text-muted-foreground">Número de likes</p>
                        <Input
                          placeholder="Ex: 370k"
                          value={panelConfig.heroLikesCount}
                          onChange={(e) =>
                            setPanelConfig({ ...panelConfig, heroLikesCount: e.target.value })
                          }
                        />
                      </div>
                    </div>
                  </Card>

                  {/* Aviso importante */}
                  <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-[11px] text-yellow-600 dark:text-yellow-400">
                    <p className="font-semibold">⚠️ Importante sobre vídeos e imagens:</p>
                    <p className="mt-1">
                      Vídeos e imagens são salvos apenas no seu navegador (localStorage). 
                      Para que apareçam para todos os visitantes, você precisa hospedar os arquivos 
                      em um serviço externo e usar os links.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export default Admin;
