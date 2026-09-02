// functions/api/stock.js
// จุดประสงค์: ให้สแกน QR แล้วเช็คสต็อกผ้าได้ทันที โดยเปิดเผยข้อมูลแค่ "รหัส + ชื่อ + คงเหลือ" เท่านั้น
// ไม่เปิดเผยข้อมูลอื่นของร้าน (ลูกค้า, ยอดขาย, ราคาทุน, การเงิน) ออกสู่สาธารณะ
// การอ่านข้อมูล (GET) เปิดให้ทุกคนดูได้ทันทีไม่ต้องใส่รหัส (พนักงาน/ลูกค้า)
// การแก้ไข (POST) ต้องใส่รหัสเจ้าของร้าน (OWNER_PIN) ให้ตรงก่อนเท่านั้น
// ใช้ SUPABASE_SERVICE_ROLE_KEY (ตั้งเป็น secret ใน Cloudflare Pages) เพื่ออ่าน/เขียนฝั่งเซิร์ฟเวอร์เท่านั้น ไม่เคยส่งคีย์นี้ไปฝั่งไคลเอนต์

const SUPABASE_URL = "https://hpygvqhajpvhseamdfdc.supabase.co";
const STORE_ID = "siricharoen_web_novat_v1";
const TABLE = "app_store";

async function loadStore(env) {
  const url = `${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${STORE_ID}&select=data`;
  const res = await fetch(url, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!res.ok) throw new Error("load_failed");
  const rows = await res.json();
  if (!rows.length) throw new Error("no_store_row");
  return rows[0].data;
}

async function saveStore(env, data) {
  const url = `${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${STORE_ID}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ data, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error("save_failed");
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
    },
  });
}

function findFabricAndRoll(data, code, rollNo) {
  const fabric = (data.fabrics || []).find((f) => f.code === code && f.active);
  if (!fabric) return { fabric: null, roll: null };
  let roll = null;
  if (rollNo) {
    roll = (data.rolls || []).find((r) => r.fabric_id === fabric.id && r.roll_no === Number(rollNo));
  }
  return { fabric, roll };
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const u = new URL(request.url);
  const code = (u.searchParams.get("code") || "").trim();
  const rollNo = u.searchParams.get("roll") || "";
  if (!code) return json({ error: "missing_code" }, 400);
  try {
    const data = await loadStore(env);
    const { fabric, roll } = findFabricAndRoll(data, code, rollNo);
    if (!fabric) return json({ error: "not_found" }, 404);
    return json({
      code: fabric.code,
      name: fabric.name,
      unit: fabric.unit || "",
      total_qty: fabric.stock_qty,
      roll_no: roll ? roll.roll_no : null,
      roll_qty: roll ? roll.qty : null,
      roll_active: roll ? roll.active : null,
    });
  } catch (e) {
    return json({ error: "server_error" }, 500);
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: "invalid_body" }, 400);
  }
  const code = (body && body.code ? String(body.code) : "").trim();
  const rollNo = body && body.roll ? String(body.roll) : "";
  const pin = body && body.pin ? String(body.pin) : "";
  const newQtyRaw = body ? body.new_roll_qty : undefined;
  if (!code || !pin) return json({ error: "missing_fields" }, 400);
  if (!env.OWNER_PIN || pin !== String(env.OWNER_PIN)) {
    return json({ error: "invalid_pin" }, 401);
  }
  try {
    const data = await loadStore(env);
    const { fabric, roll } = findFabricAndRoll(data, code, rollNo);
    if (!fabric) return json({ error: "not_found" }, 404);
    if (newQtyRaw !== undefined && newQtyRaw !== null && newQtyRaw !== "") {
      const newQty = Number(newQtyRaw);
      if (isNaN(newQty)) return json({ error: "invalid_qty" }, 400);
      if (roll) {
        const delta = newQty - roll.qty;
        roll.qty = newQty;
        roll.active = newQty > 0;
        fabric.stock_qty = (fabric.stock_qty || 0) + delta;
      } else {
        fabric.stock_qty = newQty;
      }
    }
    await saveStore(env, data);
    return json({
      ok: true,
      code: fabric.code,
      name: fabric.name,
      unit: fabric.unit || "",
      total_qty: fabric.stock_qty,
      roll_no: roll ? roll.roll_no : null,
      roll_qty: roll ? roll.qty : null,
    });
  } catch (e) {
    return json({ error: "server_error" }, 500);
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
