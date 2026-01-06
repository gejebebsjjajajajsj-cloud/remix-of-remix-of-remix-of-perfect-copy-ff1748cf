import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !serviceRoleKey) {
  console.error("SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurados para PushinPay.");
}

const supabase = supabaseUrl && serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null;

async function getPushinPayConfig() {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("pushinpay_config")
    .select("token, environment")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Erro ao buscar configuração PushinPay:", error);
    return null;
  }

  return data;
}

function getWebhookUrl() {
  try {
    const url = new URL(supabaseUrl!);
    const projectId = url.hostname.split(".")[0];
    return `https://${projectId}.functions.supabase.co/pushinpay-webhook`;
  } catch (e) {
    console.error("Erro ao montar URL do webhook PushinPay:", e);
    return "";
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método não permitido" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { product } = await req.json();

    const config = await getPushinPayConfig();
    if (!config || !config.token) {
      return new Response(
        JSON.stringify({ error: "Token PushinPay não configurado no painel administrativo." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    let amount = 0;
    let type = "subscription";
    if (product === "mensalidade") {
      amount = 2990;
      type = "subscription";
    }
    if (product === "whatsapp") {
      amount = 15000;
      type = "whatsapp";
    }

    if (!amount) {
      return new Response(JSON.stringify({ error: "Produto inválido." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const baseURL =
      config.environment === "production"
        ? "https://api.pushinpay.com.br/api"
        : "https://api-sandbox.pushinpay.com.br/api";

    const webhookUrl = getWebhookUrl();

    const response = await fetch(`${baseURL}/pix/cashIn`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        value: amount,
        webhook_url: webhookUrl,
        split_rules: [],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Erro PushinPay:", data);
      return new Response(
        JSON.stringify({
          error: "Erro ao gerar PIX",
          details: data,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Tentamos extrair um identificador único retornado pela PushinPay
    const externalId =
      (data && (data.id || data.transaction_id || data.reference || data.uuid))
        ? String(data.id || data.transaction_id || data.reference || data.uuid)
        : `pushinpay_${Date.now()}`;

    if (supabase) {
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
          external_id: externalId,
          type,
          amount_cents: amount,
          status: "pending",
        })
        .select("id")
        .single();

      if (orderError) {
        console.error("Erro ao salvar pedido PushinPay no banco:", orderError);
      } else {
        // Devolvemos também o id interno do pedido para o frontend, caso queira usar
        (data as any).orderId = order?.id ?? null;
        (data as any).externalId = externalId;
      }
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Erro inesperado ao criar PIX PushinPay:", error);
    return new Response(JSON.stringify({ error: "Erro inesperado ao criar PIX." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
