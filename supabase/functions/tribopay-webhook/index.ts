import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !serviceRoleKey) {
  console.error("SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurados." );
}

const supabase = supabaseUrl && serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey)
  : null;

serve(async (req) => {
  // A TriboPay enviará POST para este endpoint
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
    console.log("Webhook TriboPay recebido:", body);

    const { externalId, status, amount } = body;

    if (!externalId) {
      console.warn("Webhook sem externalId, ignorando.");
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!supabase) {
      console.error("Supabase client não inicializado.");
    } else {
      // Atualiza o pedido correspondente no banco
      const newStatus = status === "paid" ? "paid" : status === "failed" ? "failed" : "pending";

      const { error } = await supabase
        .from("orders")
        .update({ status: newStatus, amount_cents: amount ?? undefined })
        .eq("external_id", externalId);

      if (error) {
        console.error("Erro ao atualizar pedido no banco:", error);
      }
    }

    if (status === "paid") {
      console.log("Pagamento confirmado para:", externalId);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Erro no webhook TriboPay:", error);
    return new Response(JSON.stringify({ error: "Erro ao processar webhook" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
