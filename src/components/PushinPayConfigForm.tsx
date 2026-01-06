import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function PushinPayConfigForm() {
  const [token, setToken] = useState("");
  const [environment, setEnvironment] = useState<"sandbox" | "production">("sandbox");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    const loadStatus = async () => {
      const { data, error } = await supabase.functions.invoke("pushinpay-admin", {
        method: "GET",
      } as any);

      if (error) {
        console.error("Erro ao carregar status PushinPay:", error);
        return;
      }

      const anyData = data as any;
      if (anyData?.configured) {
        setEnvironment(anyData.environment === "production" ? "production" : "sandbox");
        setStatus(
          `Configuração ativa em ${
            anyData.environment === "production" ? "produção" : "sandbox"
          } (última atualização em ${new Date(anyData.created_at).toLocaleString("pt-BR")})`,
        );
      } else {
        setStatus("Nenhuma configuração ativa. Configure o token abaixo.");
      }
    };

    loadStatus();
  }, []);

  const handleSave = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke("pushinpay-admin", {
        body: { token, environment },
      });

      if (error) {
        console.error("Erro ao salvar configuração PushinPay:", error);
        alert("Erro ao salvar configuração");
        return;
      }

      alert("Configuração PushinPay salva com sucesso!");
      setToken("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      {status && <p className="text-[11px] text-muted-foreground">{status}</p>}
      <div className="grid gap-2 md:grid-cols-[2fr,1fr] md:gap-3">
        <div className="space-y-1">
          <p className="text-[10px] font-medium text-muted-foreground">Token PushinPay</p>
          <Input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Cole aqui o token privado (não será exibido novamente)"
          />
        </div>
        <div className="space-y-1">
          <p className="text-[10px] font-medium text-muted-foreground">Ambiente</p>
          <select
            className="h-9 w-full rounded-md border border-border bg-background px-2 text-xs"
            value={environment}
            onChange={(e) =>
              setEnvironment(e.target.value === "production" ? "production" : "sandbox")
            }
          >
            <option value="sandbox">Sandbox</option>
            <option value="production">Produção</option>
          </select>
        </div>
      </div>
      <Button
        type="button"
        size="sm"
        className="h-8 px-4 text-xs"
        onClick={handleSave}
        disabled={loading || !token}
      >
        {loading ? "Salvando..." : "Salvar configuração"}
      </Button>
    </div>
  );
}
