import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const triboPayApiKey = Deno.env.get("TRIBOPAY_API_KEY");
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!triboPayApiKey) {
  console.error("TRIBOPAY_API_KEY não configurado nas variáveis de ambiente.");
}

if (!supabaseUrl) {
  console.error("SUPABASE_URL não configurado nas variáveis de ambiente.");
}

if (!serviceRoleKey) {
  console.error("SUPABASE_SERVICE_ROLE_KEY não configurado nas variáveis de ambiente.");
}

const supabase = supabaseUrl && serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey)
  : null;

// Gera a URL pública do webhook a partir do SUPABASE_URL
function getWebhookUrl() {
  try {
    const url = new URL(supabaseUrl!);
    const projectId = url.hostname.split(".")[0];
    return `https://${projectId}.functions.supabase.co/tribopay-webhook`;
  } catch (e) {
    console.error("Erro ao montar URL do webhook TriboPay:", e);
    return "";
  }
}

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método não permitido" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!triboPayApiKey) {
    return new Response(JSON.stringify({ error: "Configuração de pagamento indisponível" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { name, email, document, amount, type } = await req.json();

    // Validações mínimas exigidas pela TriboPay
    if (!name || !email || !document) {
      return new Response(
        JSON.stringify({ error: "Nome, e-mail e CPF são obrigatórios." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (typeof document !== "string" || document.replace(/\D/g, "").length !== 11) {
      return new Response(
        JSON.stringify({ error: "CPF deve conter 11 números." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const amountInCents = Number.isInteger(amount) && amount > 0 ? amount : 2990; // fallback 29,90
    const cleanCpf = document.replace(/\D/g, "");

    const externalId = `order_${Date.now()}`;
    const postbackUrl = getWebhookUrl();

    const triboResponse = await fetch(
      "https://api.tribopay.com.br/api/public/cash/deposits/pix",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${triboPayApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: amountInCents,
          externalId,
          postbackUrl,
          method: "pix",
          transactionOrigin: "cashin",
          payer: {
            name,
            email,
            document: cleanCpf,
          },
        }),
      },
    );

    const data = await triboResponse.json();

    if (!triboResponse.ok) {
      console.error("Erro TriboPay:", data);
      return new Response(
        JSON.stringify({
          error: "Não foi possível gerar o pagamento PIX. Tente novamente em alguns minutos.",
          provider_status: triboResponse.status,
          provider_response: data,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!supabase) {
      console.error("Supabase client não inicializado, não será possível salvar o pedido.");

      return new Response(JSON.stringify({ ...data, externalId, orderId: null }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        external_id: externalId,
        type: type || "subscription",
        amount_cents: amountInCents,
        status: "pending",
      })
      .select("id")
      .single();

    if (orderError) {
      console.error("Erro ao salvar pedido no banco:", orderError);
    }

    return new Response(JSON.stringify({ ...data, externalId, orderId: order?.id ?? null }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Erro inesperado ao criar PIX TriboPay:", error);
    return new Response(JSON.stringify({ error: "Erro inesperado ao criar PIX." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
