import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ASYNC_BASE_URL = "https://api.syncpayments.com.br";
const clientId = Deno.env.get("SYNC_CLIENT_ID");
const clientSecret = Deno.env.get("SYNC_CLIENT_SECRET");
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const supabase = supabaseUrl && serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey)
  : null;

// Gera a URL pública do webhook
function getWebhookUrl() {
  try {
    const url = new URL(supabaseUrl!);
    const projectId = url.hostname.split(".")[0];
    return `https://${projectId}.functions.supabase.co/async-webhook`;
  } catch (e) {
    console.error("Erro ao montar URL do webhook:", e);
    return "";
  }
}

// Obtém o token de autenticação da Async
async function getAuthToken(): Promise<string | null> {
  if (!clientId || !clientSecret) {
    console.error("SYNC_CLIENT_ID ou SYNC_CLIENT_SECRET não configurados.");
    return null;
  }

  try {
    const response = await fetch(`${ASYNC_BASE_URL}/api/partner/v1/auth-token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Erro ao obter token Async:", data);
      return null;
    }

    return data.access_token;
  } catch (error) {
    console.error("Erro ao obter token Async:", error);
    return null;
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
    const { name, email, document, phone, amount, type } = await req.json();

    // Validações
    if (!name || !email || !document) {
      return new Response(
        JSON.stringify({ error: "Nome, e-mail e CPF são obrigatórios." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const cleanCpf = document.replace(/\D/g, "");
    if (cleanCpf.length !== 11) {
      return new Response(
        JSON.stringify({ error: "CPF deve conter 11 números." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Obtém token de autenticação
    const accessToken = await getAuthToken();
    if (!accessToken) {
      return new Response(
        JSON.stringify({ error: "Erro de autenticação com o gateway de pagamento." }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Converte centavos para reais (a Async espera valor em reais)
    const amountInCents = Number.isInteger(amount) && amount > 0 ? amount : 2990;
    const amountInReais = amountInCents / 100;

    const webhookUrl = getWebhookUrl();

    // Cria o PIX na Async
    const asyncResponse = await fetch(`${ASYNC_BASE_URL}/api/partner/v1/cash-in`, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: amountInReais,
        description: type === "subscription" ? "Assinatura" : "Pagamento",
        webhook_url: webhookUrl,
        client: {
          name,
          cpf: cleanCpf,
          email,
          phone: phone?.replace(/\D/g, "") || "",
        },
      }),
    });

    const data = await asyncResponse.json();

    if (!asyncResponse.ok) {
      console.error("Erro Async:", data);
      return new Response(
        JSON.stringify({
          error: "Não foi possível gerar o pagamento PIX. Tente novamente em alguns minutos.",
          provider_status: asyncResponse.status,
          provider_response: data,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const externalId = data.identifier;

    // Salva o pedido no banco
    if (supabase && externalId) {
      const { error: orderError } = await supabase
        .from("orders")
        .insert({
          external_id: externalId,
          type: type || "subscription",
          amount_cents: amountInCents,
          status: "pending",
        });

      if (orderError) {
        console.error("Erro ao salvar pedido no banco:", orderError);
      }
    }

    // Retorna no formato esperado pelo frontend
    return new Response(
      JSON.stringify({
        pixCode: data.pix_code,
        externalId,
        message: data.message,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Erro inesperado ao criar PIX Async:", error);
    return new Response(JSON.stringify({ error: "Erro inesperado ao criar PIX." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
