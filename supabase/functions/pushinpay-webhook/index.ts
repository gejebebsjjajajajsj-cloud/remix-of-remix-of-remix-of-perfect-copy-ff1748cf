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
  console.error("SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurados para PushinPay webhook.");
}

const supabase = supabaseUrl && serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null;

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
    console.log("Webhook PushinPay recebido:", body);

    // Tentamos identificar o pedido pelo mesmo identificador retornado na criação
    const externalId =
      (body && (body.id || body.transaction_id || body.reference || body.uuid))
        ? String(body.id || body.transaction_id || body.reference || body.uuid)
        : null;

    if (supabase && externalId) {
      // Normalizamos o status recebido
      const rawStatus = String(body.status || body.payment_status || "").toLowerCase();
      const newStatus =
        rawStatus === "paid" || rawStatus === "approved" || rawStatus === "success"
          ? "paid"
          : rawStatus === "failed" || rawStatus === "canceled" || rawStatus === "refused"
            ? "failed"
            : "pending";

      const amount = typeof body.value === "number" ? body.value : body.amount_cents;

      const { error } = await supabase
        .from("orders")
        .update({
          status: newStatus,
          amount_cents: typeof amount === "number" ? amount : undefined,
        })
        .eq("external_id", externalId);

      if (error) {
        console.error("Erro ao atualizar pedido PushinPay no banco:", error);
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Erro no webhook PushinPay:", error);
    return new Response(JSON.stringify({ error: "Erro ao processar webhook" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
