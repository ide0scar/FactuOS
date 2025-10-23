import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

// 🌿 UI pastel (verdes/menta/teal) + logo externo + modo oscuro pastel
const LOGO_SRC = "/logo-factuos.png"; // pon tu PNG transparente en /public

// --- utilidades ---
const fmt = (n) =>
  new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);
const todayISO = () => new Date().toISOString().slice(0, 10);

// Normaliza filas de Supabase a la forma usada en UI
const normalizeLine = (r) => ({
  id: r.id,
  customerId: r.customer_id,
  itemId: r.item_id,
  qty: Number(r.qty),
  price: Number(r.price),
  notes: r.notes ?? "",
  workDate: r.work_date, // "YYYY-MM-DD"
  invoiced: !!r.invoiced,
  invoiceId: r.invoice_id ?? null,
});

// --- estado persistente (local cache para estado UI) ---
function useLocalStore(key, initial) {
  const [state, setState] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {}
  }, [key, state]);
  return [state, setState];
}

export default function InvoicerApp() {
  // datos
  const [customers, setCustomers] = useLocalStore("customers", []);
  const [items, setItems] = useLocalStore("items", []);
  const [lines, setLines] = useLocalStore("lines", []);
  const [invoices, setInvoices] = useLocalStore("invoices", []);
  const [tab, setTab] = useState("lineas");

  // tema (persistente)
  const [dark, setDark] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("theme_dark") || "false");
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("theme_dark", JSON.stringify(dark));
    } catch {}
  }, [dark]);

  // índices
  const customersById = useMemo(() => Object.fromEntries(customers.map((c) => [c.id, c])), [customers]);
  const itemsById = useMemo(() => Object.fromEntries(items.map((i) => [i.id, i])), [items]);

  // formularios (crear)
  const [cName, setCName] = useState("");
  const [cTax, setCTax] = useState("");
  const [cAddr, setCAddr] = useState("");
  const [cPhone, setCPhone] = useState("");
  const [cCity, setCCity] = useState("");
  const [cCP, setCCP] = useState("");
  const [cProv, setCProv] = useState("");

  const [iName, setIName] = useState("");
  const [iPrice, setIPrice] = useState("");
  const [iSKU, setISKU] = useState("");

  const [lCustomer, setLCustomer] = useState("");
  const [lItem, setLItem] = useState("");
  const [lQty, setLQty] = useState(1);
  const [lPrice, setLPrice] = useState("");
  const [lNotes, setLNotes] = useState("");
  const [lDate, setLDate] = useState(todayISO());

  // Filtro en pestaña Líneas
  const [filterCustomer, setFilterCustomer] = useState("");

  const [factCustomer, setFactCustomer] = useState("");

  // edición en UI
  const [editingCustomer, setEditingCustomer] = useState(null); // objeto customer o null
  const [editingItem, setEditingItem] = useState(null); // objeto item o null
  const [editingLineId, setEditingLineId] = useState(null); // id de línea en edición
  const [lineDraft, setLineDraft] = useState({ qty: "", price: "", workDate: "", notes: "" });

  // --------- CARGAS INICIALES DESDE SUPABASE ---------
  // CLIENTES
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .order("created_at", { ascending: false });
      if (!error && data) setCustomers(data);
    })();
  }, []);

  // ARTÍCULOS
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("items")
        .select("*")
        .order("created_at", { ascending: false });
      if (!error && data) setItems(data);
    })();
  }, []);

  // LÍNEAS (work_lines) — SIEMPRE ORDENADAS POR FECHA ASC (y created_at como desempate)
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("work_lines")
        .select("*")
        .order("work_date", { ascending: true })
        .order("created_at", { ascending: true });
      if (!error && data) setLines(data.map(normalizeLine));
    })();
  }, []);

  // FACTURAS (invoices)
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .order("issued_at", { ascending: false });
      if (!error && data) setInvoices(data);
    })();
  }, []);

  const pendingByCustomer = useMemo(
    () =>
      lines
        .filter((l) => !l.invoiced)
        .reduce((acc, l) => {
          (acc[l.customerId] = acc[l.customerId] || []).push(l);
          return acc;
        }, {}),
    [lines]
  );

  // --------- DERIVADOS PARA LÍNEAS (filtro + total pendiente) ---------
  const filteredLines = useMemo(
    () => lines.filter((l) => !filterCustomer || l.customerId === filterCustomer),
    [lines, filterCustomer]
  );

  const pendingTotalFiltered = useMemo(
    () => filteredLines.filter((l) => !l.invoiced).reduce((s, l) => s + l.qty * l.price, 0),
    [filteredLines]
  );

  // Pequeño helper local para mantener orden ascendente tras cambios
  const sortAsc = (arr) => [...arr].sort((a, b) => (a.workDate === b.workDate ? 0 : a.workDate < b.workDate ? -1 : 1));

  // --------- ACCIONES SUPABASE ---------
  // Clientes
  const addCustomer = async () => {
    if (!cName.trim()) return;
    const { data, error } = await supabase
      .from("customers")
      .insert([
        {
          name: cName.trim(),
          tax_id: cTax || null,
          address: cAddr || null,
          phone: cPhone || null,
          city: cCity || null,
          postal_code: cCP || null,
          province: cProv || null,
        },
      ])
      .select()
      .single();
    if (!error && data) {
      setCustomers([data, ...customers]);
      setCName("");
      setCTax("");
      setCAddr("");
      setCPhone("");
      setCCity("");
      setCCP("");
      setCProv("");
    }
  };

  const delCustomer = async (id) => {
    await supabase.from("customers").delete().eq("id", id);
    setCustomers(customers.filter((c) => c.id !== id));
    setLines(lines.filter((l) => l.customerId !== id));
  };

  const startEditCustomer = (c) => setEditingCustomer({ ...c });
  const cancelEditCustomer = () => setEditingCustomer(null);
  const saveEditCustomer = async () => {
    const c = editingCustomer;
    if (!c || !c.name?.trim()) return;
    const { data, error } = await supabase
      .from("customers")
      .update({
        name: c.name.trim(),
        tax_id: c.tax_id || null,
        address: c.address || null,
        phone: c.phone || null,
        city: c.city || null,
        postal_code: c.postal_code || null,
        province: c.province || null,
      })
      .eq("id", c.id)
      .select()
      .single();
    if (!error && data) {
      setCustomers(customers.map((x) => (x.id === c.id ? data : x)));
      setEditingCustomer(null);
    }
  };

  // Artículos
  const addItem = async () => {
    if (!iName.trim()) return;
    const price = Number(iPrice || 0);
    const { data, error } = await supabase
      .from("items")
      .insert([{ name: iName.trim(), price, sku: iSKU || null }])
      .select()
      .single();
    if (!error && data) {
      setItems([data, ...items]);
      setIName("");
      setIPrice("");
      setISKU("");
    }
  };

  const delItem = async (id) => {
    await supabase.from("items").delete().eq("id", id);
    setItems(items.filter((i) => i.id !== id));
  };

  const startEditItem = (i) => setEditingItem({ ...i });
  const cancelEditItem = () => setEditingItem(null);
  const saveEditItem = async () => {
    const i = editingItem;
    if (!i || !i.name?.trim()) return;
    const price = Number(i.price || 0);
    const { data, error } = await supabase
      .from("items")
      .update({ name: i.name.trim(), sku: i.sku || null, price })
      .eq("id", i.id)
      .select()
      .single();
    if (!error && data) {
      setItems(items.map((x) => (x.id === i.id ? data : x)));
      setEditingItem(null);
    }
  };

  // Líneas (albarán)
  const addLine = async () => {
    if (!lCustomer || !lItem) return;
    const item = itemsById[lItem];
    const price = Number(lPrice === "" ? item?.price ?? 0 : lPrice);

    const { data, error } = await supabase
      .from("work_lines")
      .insert([
        {
          customer_id: lCustomer,
          item_id: lItem,
          qty: Number(lQty || 1),
          price,
          notes: lNotes || null,
          work_date: lDate,
          invoiced: false,
          invoice_id: null,
        },
      ])
      .select()
      .single();

    if (!error && data) {
      const nl = normalizeLine(data);
      setLines(sortAsc([nl, ...lines]));
      setLNotes("");
      setLPrice("");
      setLQty(1);
    }
  };

  const delLine = async (id) => {
    await supabase.from("work_lines").delete().eq("id", id);
    setLines(lines.filter((l) => l.id !== id));
  };

  const startEditLine = (l) => {
    setEditingLineId(l.id);
    setLineDraft({
      qty: String(l.qty),
      price: String(l.price),
      workDate: l.workDate,
      notes: l.notes || "",
    });
  };
  const cancelEditLine = () => {
    setEditingLineId(null);
    setLineDraft({ qty: "", price: "", workDate: "", notes: "" });
  };
  const saveEditLine = async (lineId) => {
    const draft = {
      qty: Number(lineDraft.qty || 1),
      price: Number(lineDraft.price || 0),
      work_date: lineDraft.workDate || todayISO(),
      notes: lineDraft.notes || null,
    };
    const { data, error } = await supabase.from("work_lines").update(draft).eq("id", lineId).select().single();
    if (!error && data) {
      const updated = normalizeLine(data);
      setLines(sortAsc(lines.map((l) => (l.id === lineId ? updated : l))));
      cancelEditLine();
    }
  };

  // Facturar pendientes de un cliente
  const facturarCliente = async (customerId) => {
    const pend = lines.filter((l) => !l.invoiced && l.customerId === customerId);
    if (!pend.length) return;

    const number = genInvoiceNumber(invoices); // si hay varios usuarios, mejor RPC en BD
    const total = pend.reduce((s, l) => s + l.qty * l.price, 0);

    // 1) Insertar factura
    const { data: inv, error: e1 } = await supabase
      .from("invoices")
      .insert([{ number, customer_id: customerId, total }])
      .select()
      .single();
    if (e1 || !inv) return;

    // 2) Marcar líneas como facturadas
    const ids = pend.map((l) => l.id);
    const { error: e2 } = await supabase.from("work_lines").update({ invoiced: true, invoice_id: inv.id }).in("id", ids);
    if (e2) return;

    // 3) Actualizar UI
    setInvoices([inv, ...invoices]);
    setLines(
      sortAsc(
        lines.map((l) => (ids.includes(l.id) ? { ...l, invoiced: true, invoiceId: inv.id } : l))
      )
    );

    // 4) Imprimir
    openInvoicePrint(inv, pend, customersById, itemsById);
  };

  // Eliminar factura y liberar líneas
  const deleteInvoiceAndRelease = async (invoiceId) => {
    await supabase.from("work_lines").update({ invoiced: false, invoice_id: null }).eq("invoice_id", invoiceId);
    await supabase.from("invoices").delete().eq("id", invoiceId);
    setInvoices(invoices.filter((inv) => inv.id !== invoiceId));
    setLines(
      sortAsc(lines.map((l) => (l.invoiceId === invoiceId ? { ...l, invoiced: false, invoiceId: null } : l)))
    );
  };

  // estilos por tema
  const bgClass = dark ? "bg-gradient-to-br from-emerald-900 via-teal-900 to-slate-900" : "bg-gradient-to-br from-green-200 via-emerald-100 to-teal-200";
  const textBase = dark ? "text-emerald-50" : "text-gray-800";

  return (
    <div className={`min-h-screen ${bgClass} p-4 md:p-8`}>
      <div className={`mx-auto max-w-6xl ${textBase}`}>
        <Header tab={tab} setTab={setTab} dark={dark} setDark={setDark} />

        {tab === "clientes" && (
          <div className="grid gap-4 md:grid-cols-2">
            <Card title="Nuevo cliente" dark={dark}>
              <div className="grid gap-2">
                <Input placeholder="Nombre *" value={cName} onChange={(e) => setCName(e.target.value)} dark={dark} />
                <Input placeholder="NIF/CIF" value={cTax} onChange={(e) => setCTax(e.target.value)} dark={dark} />
                <Input placeholder="Dirección" value={cAddr} onChange={(e) => setCAddr(e.target.value)} dark={dark} />
                <Input placeholder="Población" value={cCity} onChange={(e) => setCCity(e.target.value)} dark={dark} />
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="C.P." value={cCP} onChange={(e) => setCCP(e.target.value)} dark={dark} />
                  <Input placeholder="Provincia" value={cProv} onChange={(e) => setCProv(e.target.value)} dark={dark} />
                </div>
                <Input placeholder="Teléfono" value={cPhone} onChange={(e) => setCPhone(e.target.value)} dark={dark} />
                <Button onClick={addCustomer} dark={dark}>
                  Guardar
                </Button>
              </div>
            </Card>

            <Card title="Clientes" dark={dark}>
              <ul className="divide-y divide-emerald-100/60 dark:divide-emerald-800/50">
                {customers.map((c) => (
                  <li key={c.id} className="py-3 space-y-2">
                    {editingCustomer?.id === c.id ? (
                      <div className="grid gap-2">
                        <div className="grid md:grid-cols-2 gap-2">
                          <Input value={editingCustomer.name} onChange={(e) => setEditingCustomer({ ...editingCustomer, name: e.target.value })} placeholder="Nombre *" dark={dark} />
                          <Input value={editingCustomer.tax_id || ""} onChange={(e) => setEditingCustomer({ ...editingCustomer, tax_id: e.target.value })} placeholder="NIF/CIF" dark={dark} />
                        </div>
                        <Input value={editingCustomer.address || ""} onChange={(e) => setEditingCustomer({ ...editingCustomer, address: e.target.value })} placeholder="Dirección" dark={dark} />
                        <div className="grid md:grid-cols-3 gap-2">
                          <Input value={editingCustomer.city || ""} onChange={(e) => setEditingCustomer({ ...editingCustomer, city: e.target.value })} placeholder="Población" dark={dark} />
                          <Input value={editingCustomer.postal_code || ""} onChange={(e) => setEditingCustomer({ ...editingCustomer, postal_code: e.target.value })} placeholder="C.P." dark={dark} />
                          <Input value={editingCustomer.province || ""} onChange={(e) => setEditingCustomer({ ...editingCustomer, province: e.target.value })} placeholder="Provincia" dark={dark} />
                        </div>
                        <Input value={editingCustomer.phone || ""} onChange={(e) => setEditingCustomer({ ...editingCustomer, phone: e.target.value })} placeholder="Teléfono" dark={dark} />
                        <div className="flex gap-2">
                          <Button onClick={saveEditCustomer} dark={dark}>
                            Guardar cambios
                          </Button>
                          <ButtonDanger onClick={cancelEditCustomer}>Cancelar</ButtonDanger>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold">{c.name}</div>
                          <div className="text-xs text-emerald-700 dark:text-emerald-200/80">
                            {c.tax_id || ""} {c.address ? `· ${c.address}` : ""}
                          </div>
                          {(c.city || c.postal_code || c.province) && (
                            <div className="text-xs text-emerald-700 dark:text-emerald-200/80">
                              {[c.postal_code, c.city].filter(Boolean).join(" ")}{c.province ? ` (${c.province})` : ""}
                            </div>
                          )}
                          {c.phone && <div className="text-xs text-emerald-700 dark:text-emerald-200/80">Tel.: {c.phone}</div>}
                        </div>
                        <div className="flex gap-2">
                          <Button onClick={() => startEditCustomer(c)} dark={dark}>
                            Editar
                          </Button>
                          <ButtonDanger onClick={() => delCustomer(c.id)}>Eliminar</ButtonDanger>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
                {!customers.length && <div className="text-sm opacity-80">Aún no hay clientes.</div>}
              </ul>
            </Card>
          </div>
        )}

        {tab === "articulos" && (
          <div className="grid gap-4 md:grid-cols-2">
            <Card title="Nuevo artículo" dark={dark}>
              <div className="grid gap-2">
                <Input placeholder="Descripción *" value={iName} onChange={(e) => setIName(e.target.value)} dark={dark} />
                <Input placeholder="Precio base (€)" inputMode="decimal" value={iPrice} onChange={(e) => setIPrice(e.target.value)} dark={dark} />
                <Input placeholder="SKU / Ref." value={iSKU} onChange={(e) => setISKU(e.target.value)} dark={dark} />
                <Button onClick={addItem} dark={dark}>
                  Guardar
                </Button>
              </div>
            </Card>

            <Card title="Artículos" dark={dark}>
              <ul className="divide-y divide-emerald-100/60 dark:divide-emerald-800/50">
                {items.map((i) => (
                  <li key={i.id} className="py-3 space-y-2">
                    {editingItem?.id === i.id ? (
                      <div className="grid gap-2 md:grid-cols-3">
                        <Input value={editingItem.name} onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })} placeholder="Descripción *" dark={dark} />
                        <Input value={editingItem.price} inputMode="decimal" onChange={(e) => setEditingItem({ ...editingItem, price: e.target.value })} placeholder="Precio €" dark={dark} />
                        <Input value={editingItem.sku || ""} onChange={(e) => setEditingItem({ ...editingItem, sku: e.target.value })} placeholder="SKU / Ref." dark={dark} />
                        <div className="col-span-3 flex gap-2">
                          <Button onClick={saveEditItem} dark={dark}>
                            Guardar cambios
                          </Button>
                          <ButtonDanger onClick={cancelEditItem}>Cancelar</ButtonDanger>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-semibold">{i.name}</div>
                          <div className="text-xs text-emerald-700 dark:text-emerald-200/80">
                            {i.sku || ""} {` · €${fmt(i.price)}`}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button onClick={() => startEditItem(i)} dark={dark}>
                            Editar
                          </Button>
                          <ButtonDanger onClick={() => delItem(i.id)}>Eliminar</ButtonDanger>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
                {!items.length && <div className="text-sm opacity-80">Aún no hay artículos.</div>}
              </ul>
            </Card>
          </div>
        )}

        {tab === "lineas" && (
          <div className="grid gap-4">
            {/* Toolbar de filtro + total pendiente */}
            <Card dark={dark} title="Filtro y total pendiente">
              <div className="flex flex-col md:flex-row items-start md:items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className={dark ? "text-emerald-200/80" : "text-emerald-700"}>Cliente:</span>
                  <Select
                    className="min-w-[220px]"
                    value={filterCustomer}
                    onChange={(e) => setFilterCustomer(e.target.value)}
                    dark={dark}
                  >
                    <option value="">Todos los clientes</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className={`rounded-xl px-3 py-2 ml-0 md:ml-auto ${dark ? "bg-emerald-900/40 text-emerald-100" : "bg-emerald-50 text-emerald-800"}`}>
                  <strong>Pendiente por facturar: </strong>€{fmt(pendingTotalFiltered)}
                </div>
              </div>
            </Card>

            <Card title="Nueva línea de albarán" dark={dark}>
              <div className="grid md:grid-cols-2 gap-3">
                <Select value={lCustomer} onChange={(e) => setLCustomer(e.target.value)} dark={dark}>
                  <option value="">Cliente *</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>

                <Select
                  value={lItem}
                  onChange={(e) => {
                    setLItem(e.target.value);
                    const it = itemsById[e.target.value];
                    if (it) setLPrice(it.price);
                  }}
                  dark={dark}
                >
                  <option value="">Artículo *</option>
                  {items.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </Select>

                <Input placeholder="Cantidad" inputMode="decimal" value={lQty} onChange={(e) => setLQty(e.target.value)} dark={dark} />
                <Input placeholder="Precio (€)" inputMode="decimal" value={lPrice} onChange={(e) => setLPrice(e.target.value)} dark={dark} />
                <Input type="date" value={lDate} onChange={(e) => setLDate(e.target.value)} dark={dark} />
                <Input className="md:col-span-2" placeholder="Observaciones (aparecen bajo la descripción)" value={lNotes} onChange={(e) => setLNotes(e.target.value)} dark={dark} />
              </div>
              <div className="mt-3">
                <Button onClick={addLine} dark={dark}>
                  Añadir línea
                </Button>
              </div>
            </Card>

            <Card title={`Líneas (${filterCustomer ? customersById[filterCustomer]?.name : "todas"})`} dark={dark}>
              <LinesTable
                lines={filteredLines}
                onDelete={delLine}
                onStartEdit={startEditLine}
                onCancelEdit={cancelEditLine}
                onSaveEdit={saveEditLine}
                editingLineId={editingLineId}
                lineDraft={lineDraft}
                setLineDraft={setLineDraft}
                itemsById={itemsById}
                customersById={customersById}
                dark={dark}
              />
            </Card>
          </div>
        )}

        {tab === "facturar" && (
          <div className="grid gap-4">
            <Card title="Facturar pendientes" dark={dark}>
              <Select className="max-w-sm" value={factCustomer} onChange={(e) => setFactCustomer(e.target.value)} dark={dark}>
                <option value="">Selecciona cliente</option>
                {Object.keys(pendingByCustomer).map((cid) => (
                  <option key={cid} value={cid}>
                    {customersById[cid]?.name || "(sin nombre)"}
                  </option>
                ))}
              </Select>

              {factCustomer && (
                <div className={`rounded-xl p-3 mt-3 ${dark ? "bg-emerald-900/40" : "bg-gradient-to-r from-emerald-50 to-teal-50"}`}>
                  <LinesTable
                    lines={(pendingByCustomer[factCustomer] || []).map((l) => l)}
                    onDelete={() => {}}
                    onStartEdit={() => {}}
                    onCancelEdit={() => {}}
                    onSaveEdit={() => {}}
                    editingLineId={null}
                    lineDraft={{}}
                    setLineDraft={() => {}}
                    itemsById={itemsById}
                    customersById={customersById}
                    dark={dark}
                    compact
                  />
                  <div className="flex items-center justify-between mt-3">
                    <div className="text-sm opacity-80">
                      Total: €{fmt((pendingByCustomer[factCustomer] || []).reduce((s, l) => s + l.qty * l.price, 0))}
                    </div>
                    <Button onClick={() => facturarCliente(factCustomer)} dark={dark}>
                      Generar factura
                    </Button>
                  </div>
                </div>
              )}

              {!Object.keys(pendingByCustomer).length && <div className="text-sm opacity-80 mt-2">No hay líneas pendientes.</div>}
            </Card>

            <Card title="Histórico de facturas" dark={dark}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className={`text-left ${dark ? "text-emerald-200/80" : "text-gray-500"}`}>
                      <th className="py-2">Número</th>
                      <th>Cliente</th>
                      <th>Fecha</th>
                      <th>Total</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv) => (
                      <tr key={inv.id} className={`${dark ? "border-emerald-800/40" : ""} border-t`}>
                        <td className="py-2 font-medium">{inv.number}</td>
                        <td>{customersById[inv.customer_id]?.name || customersById[inv.customerId]?.name || ""}</td>
                        <td>{new Date(inv.issued_at || inv.issuedAt).toLocaleString()}</td>
                        <td>€{fmt(inv.total)}</td>
                        <td className="text-right">
                          <ButtonDanger onClick={() => deleteInvoiceAndRelease(inv.id)}>Eliminar factura</ButtonDanger>
                        </td>
                      </tr>
                    ))}
                    {!invoices.length && (
                      <tr>
                        <td className="py-2 opacity-70" colSpan={5}>
                          Aún no hay facturas.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Header (reordenado + separador + interruptor de tema) ---
function Header({ tab, setTab, dark, setDark }) {
  const groupA = [
    { k: "articulos", t: "Artículos" },
    { k: "clientes", t: "Clientes" },
  ];
  const groupB = [
    { k: "lineas", t: "Líneas" },
    { k: "facturar", t: "Facturar" },
  ];

  const btn = (active) =>
    `px-4 py-2 rounded-xl text-sm font-semibold shadow-md transition ${
      active
        ? dark
          ? "bg-emerald-600 text-emerald-50"
          : "bg-gradient-to-r from-green-400 to-emerald-500 text-white"
        : dark
        ? "bg-emerald-900/40 text-emerald-100 hover:bg-emerald-900/60"
        : "bg-white/90 text-gray-800 hover:bg-emerald-50"
    }`;

  return (
    <header className="mb-6 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <img src={LOGO_SRC} alt="Logo" className="h-12 w-auto object-contain" />
      </div>

      <nav className="flex items-center gap-2">
        {groupA.map(({ k, t }) => (
          <button key={k} onClick={() => setTab(k)} className={btn(tab === k)}>
            {t}
          </button>
        ))}
        <span className={`mx-2 h-6 w-px ${dark ? "bg-emerald-800" : "bg-emerald-300"}`} />
        {groupB.map(({ k, t }) => (
          <button key={k} onClick={() => setTab(k)} className={btn(tab === k)}>
            {t}
          </button>
        ))}

        {/* Interruptor de tema */}
        <div className="ml-3 flex items-center gap-2">
          <button
            onClick={() => setDark(!dark)}
            className={`relative h-6 w-11 rounded-full transition ${dark ? "bg-emerald-600" : "bg-emerald-300"}`}
            aria-label="Cambiar tema"
            title="Cambiar tema"
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${dark ? "translate-x-5" : "translate-x-1"}`} />
          </button>
        </div>
      </nav>
    </header>
  );
}

// --- Componentes base (estilo pastel + variantes oscuro) ---
function Card({ title, children, dark }) {
  return (
    <section className={`${dark ? "bg-emerald-950/60 text-emerald-50 ring-1 ring-emerald-800/40" : "bg-white text-gray-800 ring-1 ring-emerald-50"} rounded-2xl shadow-xl p-5`}>
      {title && <h2 className={`font-bold text-lg mb-3 ${dark ? "text-emerald-200" : "text-emerald-700"}`}>{title}</h2>}
      {children}
    </section>
  );
}

function Input({ className = "", dark, ...rest }) {
  return (
    <input
      className={`w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 ${dark ? "border-emerald-800/50 bg-emerald-950/40 text-emerald-50 placeholder:text-emerald-300/50 focus:ring-emerald-600" : "border-emerald-200 bg-white text-gray-800 placeholder:text-emerald-900/40 focus:ring-emerald-400"} ${className}`}
      {...rest}
    />
  );
}

function Select({ className = "", children, dark, ...rest }) {
  return (
    <select
      className={`w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 ${dark ? "border-emerald-800/50 bg-emerald-950/40 text-emerald-50 focus:ring-emerald-600" : "border-emerald-200 bg-white text-gray-800 focus:ring-emerald-400"} ${className}`}
      {...rest}
    >
      {children}
    </select>
  );
}

function Button({ children, dark, ...rest }) {
  return (
    <button
      className={`rounded-xl px-4 py-2 text-sm font-semibold shadow-md transition ${dark ? "bg-emerald-600 text-emerald-50 hover:opacity-95" : "bg-gradient-to-r from-green-400 to-emerald-500 text-white hover:opacity-95"}`}
      {...rest}
    >
      {children}
    </button>
  );
}

function ButtonDanger({ children, ...rest }) {
  return (
    <button className="rounded-xl px-3 py-2 text-sm font-semibold shadow bg-red-600 text-white hover:opacity-95 transition" {...rest}>
      {children}
    </button>
  );
}

function LinesTable({
  lines,
  onDelete,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  editingLineId,
  lineDraft,
  setLineDraft,
  itemsById,
  customersById,
  dark,
  compact = false,
}) {
  const headerClass = `text-left ${dark ? "text-emerald-200/80" : "text-gray-500"} ${compact ? "" : "border-b"} ${
    dark ? "border-emerald-800/40" : "border-emerald-100/60"
  }`;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className={headerClass}>
            <th className="py-2">Cliente</th>
            <th>Fecha</th>
            <th>Artículo / Observaciones</th>
            <th className="text-right">Cant.</th>
            <th className="text-right">Precio</th>
            <th className="text-right">Importe</th>
            {!compact && <th></th>}
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => {
            const isEdit = editingLineId === l.id && !compact;
            return (
              <tr key={l.id} className={`${dark ? "hover:bg-emerald-900/30 border-emerald-800/40" : "hover:bg-emerald-50/60"} ${compact ? "" : "border-b"} transition align-top`}>
                <td className="py-2 whitespace-nowrap">{customersById[l.customerId]?.name || "—"}</td>
                <td className="whitespace-nowrap">
                  {isEdit ? (
                    <Input type="date" value={lineDraft.workDate} onChange={(e) => setLineDraft({ ...lineDraft, workDate: e.target.value })} dark={dark} />
                  ) : (
                    l.workDate
                  )}
                </td>
                <td className="min-w-[260px]">
                  <div className="font-medium">{itemsById[l.itemId]?.name || "—"}</div>
                  {isEdit ? (
                    <Input className="mt-1" value={lineDraft.notes} onChange={(e) => setLineDraft({ ...lineDraft, notes: e.target.value })} placeholder="Observaciones" dark={dark} />
                  ) : (
                    l.notes && <div className={`${dark ? "text-emerald-200/80" : "text-gray-600"} text-xs mt-1`}>{l.notes}</div>
                  )}
                  {l.invoiced && !isEdit && (
                    <span className={`inline-flex items-center rounded-full text-xs px-2 py-0.5 mt-1 ${dark ? "bg-emerald-800 text-emerald-100" : "bg-emerald-100 text-emerald-700"}`}>Facturada</span>
                  )}
                </td>
                <td className="text-right whitespace-nowrap">
                  {isEdit ? (
                    <Input inputMode="decimal" value={lineDraft.qty} onChange={(e) => setLineDraft({ ...lineDraft, qty: e.target.value })} dark={dark} />
                  ) : (
                    fmt(l.qty)
                  )}
                </td>
                <td className="text-right whitespace-nowrap">
                  {isEdit ? (
                    <Input inputMode="decimal" value={lineDraft.price} onChange={(e) => setLineDraft({ ...lineDraft, price: e.target.value })} dark={dark} />
                  ) : (
                    `€${fmt(l.price)}`
                  )}
                </td>
                <td className="text-right whitespace-nowrap">€{fmt(l.qty * l.price)}</td>
                {!compact && (
                  <td className="text-right whitespace-nowrap">
                    {isEdit ? (
                      <div className="flex gap-2 justify-end">
                        <Button onClick={() => onSaveEdit(l.id)} dark={dark}>
                          Guardar
                        </Button>
                        <ButtonDanger onClick={onCancelEdit}>Cancelar</ButtonDanger>
                      </div>
                    ) : (
                      <div className="flex gap-2 justify-end">
                        {!l.invoiced && (
                          <Button onClick={() => onStartEdit(l)} dark={dark}>
                            Editar
                          </Button>
                        )}
                        <ButtonDanger onClick={() => onDelete(l.id)}>Borrar</ButtonDanger>
                      </div>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
          {!lines.length && (
            <tr>
              <td className="py-2 opacity-70" colSpan={7}>
                Sin líneas.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// --- facturación / impresión ---
function genInvoiceNumber(existing) {
  const year = new Date().getFullYear();
  const seq = (existing.filter((i) => new Date(i.issued_at || i.issuedAt).getFullYear() === year).length + 1)
    .toString()
    .padStart(4, "0");
  return `${year}-${seq}`;
}

function openInvoicePrint(inv, lines, customersById, itemsById) {
  const customer = customersById[inv.customer_id] || customersById[inv.customerId];
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Factura ${inv.number}</title>
    <style>
      body{font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial; padding:24px;}
      h1{font-size:20px;margin:0 0 16px}
      .muted{color:#666}
      table{width:100%;border-collapse:collapse}
      th,td{padding:8px;border-bottom:1px solid #eee;vertical-align:top}
      .right{text-align:right}
      .notes{color:#444;font-size:12px;margin-top:4px}
      .tot{font-weight:600}
    </style></head><body>
    <h1>Factura ${inv.number}</h1>
    <div class="muted">Fecha: ${new Date(inv.issued_at || inv.issuedAt).toLocaleString()}</div>
    <div style="margin:12px 0 20px">
      <div><strong>Cliente:</strong> ${customer?.name||""}</div>
      ${customer?.tax_id?`<div>NIF/CIF: ${customer.tax_id}</div>`:""}
      ${customer?.address?`<div>Dirección: ${customer.address}</div>`:""}
      ${(customer?.postal_code || customer?.city || customer?.province) ? 
        `<div>${[customer.postal_code, customer.city].filter(Boolean).join(" ")}${customer.province?` (${customer.province})`:""}</div>` 
        : ""
      }
      ${customer?.phone?`<div>Tel.: ${customer.phone}</div>`:""}
    </div>
    <table>
      <thead>
        <tr><th>Artículo</th><th class="right">Cant.</th><th class="right">Precio</th><th class="right">Importe</th></tr>
      </thead>
      <tbody>
        ${lines.map(l=>{
          const it  = itemsById[l.itemId];
          const base= `<div>${escapeHtml(it?.name||"")}</div>`;
          const obs = l.notes? `<div class="notes">${escapeHtml(l.notes)}</div>`: "";
          const work= l.workDate? `<div class="notes">Fecha trabajo: ${l.workDate}</div>`: "";
          const desc= base + obs + work;
          const amt = (l.qty * l.price).toFixed(2);
          return `<tr>
            <td>${desc}</td>
            <td class="right">${Number(l.qty).toFixed(2)}</td>
            <td class="right">€${Number(l.price).toFixed(2)}</td>
            <td class="right">€${amt}</td>
          </tr>`;
        }).join("")}
        <tr>
          <td></td><td></td><td class="right tot">Total</td><td class="right tot">€${(inv.total||0).toFixed(2)}</td>
        </tr>
      </tbody>
    </table>
    <script>window.onload = () => window.print();</script>
  </body></html>`;
  const w = window.open("", "_blank");
  if (w) {
    w.document.write(html);
    w.document.close();
  }
}

function escapeHtml(str) {
  return String(str).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
