import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function DELETE(request: Request, { params }: RouteContext<"/api/bms/[id]">) {
  const { id } = await params;
  const supabase = createSupabaseAdminClient();

  const { error } = await supabase.from("business_managers").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
