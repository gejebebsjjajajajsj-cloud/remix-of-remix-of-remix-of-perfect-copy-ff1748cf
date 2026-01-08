import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const supabase = supabaseUrl && serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey)
  : null;

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
    const body = await req.json();
    console.log("Webhook Async recebido:", body);

    // A Async envia o identifier como identificador único
    const { identifier, status, amount } = body;

    if (!identifier) {
      console.warn("Webhook sem identifier, ignorando.");
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!supabase) {
      console.error("Supabase client não inicializado.");
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mapeia os status da Async para os status do sistema
    let newStatus = "pending";
    if (status === "paid" || status === "approved" || status === "completed") {
      newStatus = "paid";
    } else if (status === "failed" || status === "expired" || status === "cancelled") {
      newStatus = "failed";
    }

    const updateData: Record<string, unknown> = { status: newStatus };
    if (amount !== undefined) {
      // A Async envia amount em reais, convertemos para centavos
      updateData.amount_cents = Math.round(amount * 100);
    }

    const { error } = await supabase
      .from("orders")
      .update(updateData)
      .eq("external_id", identifier);

    if (error) {
      console.error("Erro ao atualizar pedido no banco:", error);
    }

    if (newStatus === "paid") {
      console.log("Pagamento confirmado para:", identifier);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Erro no webhook Async:", error);
    return new Response(JSON.stringify({ error: "Erro ao processar webhook" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
