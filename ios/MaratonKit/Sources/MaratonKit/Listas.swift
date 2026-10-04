// Listas propias, como la pestaña Listas de la web (KEY_LISTAS): rutas con su
// nombre, sus títulos y su propio progreso, aparte del maratón. Se guardan en
// progreso.json («ls») y entran con el «Copiar código» de la web («l»).
import Foundation

public struct Lista: Codable, Sendable, Hashable, Identifiable {
    public let id: String
    public var nombre: String
    public var items: [String]
    /// Qué viste en esta lista y cuándo (ms), independiente del maratón
    public var prog: [String: Double]

    public static let largoNombre = 80

    public func vista(_ item: String) -> Bool { prog[item] != nil }
    public var vistos: Int { items.filter { prog[$0] != nil }.count }
    public var fraccion: Double { items.isEmpty ? 0 : Double(vistos) / Double(items.count) }

    /// Como saneaListas de la web: lo que no tiene forma de lista se descarta
    static func sanea(_ x: Any?) -> [Lista] {
        guard let a = x as? [Any] else { return [] }
        return a.compactMap { $0 as? [String: Any] }.map { l in
            let prog = (l["prog"] as? [String: Any] ?? [:]).compactMapValues { v -> Double? in
                guard let n = v as? NSNumber else { return nil }
                if CFGetTypeID(n) == CFBooleanGetTypeID() { return n.boolValue ? 1 : nil }
                return n.doubleValue.isFinite ? n.doubleValue : nil
            }
            return Lista(id: l["id"] as? String ?? nuevoId(),
                         nombre: (l["nombre"] as? String).map { String($0.prefix(largoNombre)) } ?? "Lista",
                         items: (l["items"] as? [Any] ?? []).compactMap { $0 as? String },
                         prog: prog)
        }
    }

    /// 7 letras y cifras, como Math.random().toString(36).slice(2, 9)
    static func nuevoId() -> String {
        String((0..<7).map { _ in "abcdefghijklmnopqrstuvwxyz0123456789".randomElement()! })
    }
}

extension Progreso {
    public func lista(_ id: String) -> Lista? { listas.first { $0.id == id } }

    /// Crea una lista vacía y devuelve su id (nil si el nombre está vacío)
    @discardableResult
    public func creaLista(_ nombre: String) -> String? {
        let n = String(nombre.trimmingCharacters(in: .whitespacesAndNewlines).prefix(Lista.largoNombre))
        guard !n.isEmpty else { return nil }
        let l = Lista(id: Lista.nuevoId(), nombre: n, items: [], prog: [:])
        listas.append(l)
        guarda()
        return l.id
    }

    public func renombraLista(_ id: String, a nombre: String) {
        let n = String(nombre.trimmingCharacters(in: .whitespacesAndNewlines).prefix(Lista.largoNombre))
        guard !n.isEmpty else { return }
        cambia(id) { $0.nombre = n }
    }

    public func borraLista(_ id: String) {
        listas.removeAll { $0.id == id }
        guarda()
    }

    /// Mete o saca un título; al sacarlo se olvida si lo viste en la lista (toggleEnLista)
    public func alternar(_ item: String, enLista id: String) {
        cambia(id) { l in
            if l.items.contains(item) {
                l.items.removeAll { $0 == item }
                l.prog[item] = nil
            } else {
                l.items.append(item)
            }
        }
    }

    /// Visto o no dentro de la lista, sin tocar el maratón (toggleProgLista)
    public func alternarVista(_ item: String, enLista id: String) {
        cambia(id) { $0.prog[item] = $0.prog[item] == nil ? ahora : nil }
    }

    /// Los títulos de la lista en el orden del maratón (los que ya no existen, fuera)
    public func titulos(de lista: Lista) -> [Titulo] {
        let pos = Dictionary(uniqueKeysWithValues: catalogo.titulos.enumerated().map { ($1.id, $0) })
        return lista.items.compactMap { id in pos[id].map { ($0, id) } }.sorted { $0.0 < $1.0 }
            .compactMap { catalogo.titulo($0.1) }
    }

    func cambia(_ id: String, _ f: (inout Lista) -> Void) {
        guard let i = listas.firstIndex(where: { $0.id == id }) else { return }
        f(&listas[i])
        guarda()
    }

    /// Suma sin borrar: una lista nueva entra entera; una que ya está gana los
    /// títulos que le falten y lo visto en ellos. Devuelve cuántas cambiaron.
    func sumaListas(_ nuevas: [Lista]) -> Int {
        var n = 0
        for var l in nuevas {
            l.items = l.items.reduce(into: []) { a, id in
                if catalogo.titulo(id) != nil && !a.contains(id) { a.append(id) }
            }
            l.prog = l.prog.filter { l.items.contains($0.key) }
            if let i = listas.firstIndex(where: { $0.id == l.id }) {
                var cambio = false
                for id in l.items where !listas[i].items.contains(id) { listas[i].items.append(id); cambio = true }
                for (id, m) in l.prog where listas[i].prog[id] == nil { listas[i].prog[id] = m; cambio = true }
                if cambio { n += 1 }
            } else {
                listas.append(l); n += 1
            }
        }
        if n > 0 { guarda() }
        return n
    }
}
