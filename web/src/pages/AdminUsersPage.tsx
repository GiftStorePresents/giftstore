import { useEffect, useState } from "react";
import { api } from "../api";

type UserRow = { id:string; email:string; name:string|null; role:"USER"|"ADMIN"; verifiedAt:string|null; disabledAt:string|null; createdAt:string };

export default function AdminUsersPage() {
  const [items,setItems]=useState<UserRow[]>([]);
  const [page,setPage]=useState(1);
  const [pages,setPages]=useState(1);
  const [q,setQ]=useState("");
  const [role,setRole]=useState<""|"USER"|"ADMIN">("");
  const [verified,setVerified]=useState<""|"true"|"false">("");

  async function load() {
    const res = await api.admin.users(page,20,q, role || undefined, verified || undefined);
    setItems(res.items); setPages(res.pages);
  }
  useEffect(()=>{ load(); /* eslint-disable-next-line */ }, [page, role, verified]);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Użytkownicy</h1>
      <div className="flex gap-2 mb-3">
        <input className="border rounded px-3 py-2" placeholder="Szukaj email / imię" value={q} onChange={e=>setQ(e.target.value)} />
        <button className="px-3 py-2 bg-mainRed text-white rounded" onClick={()=>{ setPage(1); load(); }}>Szukaj</button>
        <select className="border rounded px-2" value={role} onChange={e=>setRole(e.target.value as any)}>
          <option value="">Rola: wszystkie</option>
          <option value="USER">USER</option>
          <option value="ADMIN">ADMIN</option>
        </select>
        <select className="border rounded px-2" value={verified} onChange={e=>setVerified(e.target.value as any)}>
          <option value="">Weryfikacja: wszystkie</option>
          <option value="true">Zweryfikowani</option>
          <option value="false">Niezweryfikowani</option>
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border">
          <thead className="bg-gray-50">
          <tr>
            <th className="p-2 border">Email</th>
            <th className="p-2 border">Imię</th>
            <th className="p-2 border">Rola</th>
            <th className="p-2 border">Weryfikacja</th>
            <th className="p-2 border">Ban</th>
            <th className="p-2 border">Akcje</th>
          </tr>
          </thead>
          <tbody>
          {items.map(u=>(
            <tr key={u.id}>
              <td className="p-2 border">{u.email}</td>
              <td className="p-2 border">{u.name || "-"}</td>
              <td className="p-2 border">
                <select className="border rounded px-2 py-1" value={u.role} onChange={async e=>{
                  await api.admin.setRole(u.id, e.target.value as "USER"|"ADMIN");
                  load();
                }}>
                  <option value="USER">USER</option>
                  <option value="ADMIN">ADMIN</option>
                </select>
              </td>
              <td className="p-2 border">{u.verifiedAt ? "TAK" : "NIE"}</td>
              <td className="p-2 border">{u.disabledAt ? <span className="text-red-600 font-bold">ZBANOWANY</span> : "OK"}</td>
              <td className="p-2 border">
                <button className="px-2 py-1 border rounded" onClick={async ()=>{
                  await api.admin.softBan(u.id, !u.disabledAt);
                  load();
                }}>
                  {u.disabledAt ? "Odblokuj" : "Zbanuj"}
                </button>
              </td>
            </tr>
          ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex gap-2">
        <button disabled={page<=1} className="px-3 py-1 border rounded" onClick={()=>setPage(p=>p-1)}>←</button>
        <span>Strona {page}/{pages}</span>
        <button disabled={page>=pages} className="px-3 py-1 border rounded" onClick={()=>setPage(p=>p+1)}>→</button>
      </div>
    </div>
  );
}
