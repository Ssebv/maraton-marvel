// El perfil compartible y el modo duelo de la web (generarPerfil,
// parsePerfilCod y Duelo en src/App.jsx): una foto fija del maratón de alguien
// metida en el propio enlace, sin servidor. JSON {n, v, e, r, t} en base64url
// sobre UTF-8, con v y e en bits (Bits.swift) y r = [[posición en el orden, estrellas]].
import Foundation

public struct PerfilCompartido: Codable, Sendable, Hashable, Identifiable {
    /// El nombre que eligió (hasta 40 letras; «Alguien» si no puso)
    public let n: String
    public let v: String
    public let e: String
    /// Sus estrellas: [posición en ordenIds, 1…5]
    public let r: [[Int]]
    /// Cuándo se hizo el enlace, en ms (puede faltar)
    public let t: Double?

    public var id: String { n }
    public var fecha: Date? { t.map { Date(timeIntervalSince1970: $0 / 1000) } }

    public init(n: String, v: String, e: String, r: [[Int]] = [], t: Double? = nil) {
        self.n = n; self.v = v; self.e = e; self.r = r; self.t = t
    }

    /// Mismo enlace que la web, que es el que abre cualquiera que no tenga la app
    public static let base = URL(string: "https://ssebv.github.io/maraton-marvel/")!

    public var codigo: String {
        var j: [String: Any] = ["n": n, "v": v, "e": e, "r": r]
        if let t { j["t"] = t }
        let datos = (try? JSONSerialization.data(withJSONObject: j, options: [.sortedKeys])) ?? Data()
        return datos.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    public var enlace: URL {
        var c = URLComponents(url: Self.base, resolvingAgainstBaseURL: false)!
        c.queryItems = [URLQueryItem(name: "perfil", value: codigo)]
        return c.url!
    }

    /// Acepta el enlace entero o solo su código. El código lo escribe quien
    /// quiera: se comprueba cada campo, como parsePerfilCod. nil si no es un perfil.
    public static func lee(_ entrada: String) -> PerfilCompartido? {
        var cod = entrada.trimmingCharacters(in: .whitespacesAndNewlines)
        if cod.contains("perfil=") {
            // el enlace puede llegar dentro del mensaje con que se compartió
            // (WhatsApp junta texto y enlace): se saca solo el código
            guard let m = cod.firstMatch(of: /perfil=([A-Za-z0-9_\-]+)/) else { return nil }
            cod = String(m.1)
        }
        cod = cod.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        cod += String(repeating: "=", count: (4 - cod.count % 4) % 4)
        guard let datos = Data(base64Encoded: cod),
              let j = try? JSONSerialization.jsonObject(with: datos) as? [String: Any],
              let v = j["v"] as? String, !v.isEmpty else { return nil }
        let nombre = (j["n"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let r = (j["r"] as? [Any] ?? []).compactMap { x -> [Int]? in
            guard let par = x as? [Any], par.count >= 2,
                  let i = (par[0] as? NSNumber)?.intValue, let p = (par[1] as? NSNumber)?.intValue,
                  i >= 0, (1...5).contains(p) else { return nil }
            return [i, p]
        }
        let t = (j["t"] as? NSNumber)?.doubleValue
        return PerfilCompartido(n: nombre.isEmpty ? "Alguien" : String(nombre.prefix(40)),
                                v: v, e: j["e"] as? String ?? "", r: r,
                                t: t.flatMap { $0.isFinite && $0 > 0 ? $0 : nil })
    }
}

extension Progreso {
    /// Tu perfil para compartir: lo visto en bits, tus estrellas y la hora
    public func perfil(nombre: String, ahora: Date = Date()) -> PerfilCompartido {
        let (v, e) = exporta()
        let r = catalogo.ordenIds.enumerated().compactMap { i, id in notas[id]?.p.map { [i, $0] } }
        let n = nombre.trimmingCharacters(in: .whitespacesAndNewlines)
        return PerfilCompartido(n: n.isEmpty ? "Alguien" : String(n.prefix(40)), v: v, e: e, r: r,
                                t: (ahora.timeIntervalSince1970 * 1000).rounded())
    }

    /// El maratón de otra persona como un Progreso en memoria (sin archivo):
    /// así su resumen, sus logros y sus estrellas salen de las mismas cuentas
    /// que los tuyos. Los lotes viejos se migran como al importar.
    public static func ajeno(_ p: PerfilCompartido, catalogo: Catalogo) -> Progreso {
        let otro = Progreso(catalogo: catalogo, archivo: nil)
        var notas: [String: Nota] = [:]
        for par in p.r where catalogo.ordenIds.indices.contains(par[0]) {
            notas[catalogo.ordenIds[par[0]]] = Nota(p: par[1])
        }
        func unos(_ s: Set<String>) -> [String: Double] { Dictionary(uniqueKeysWithValues: s.map { ($0, 1.0) }) }
        _ = otro.suma(unos(Bits.decodifica(p.v, orden: catalogo.ordenIds)),
                      unos(Bits.decodifica(p.e, orden: catalogo.ordenEps)), notas: notas)
        return otro
    }

    /// Tú contra otra persona, como el Duelo de la web: solo el maratón
    /// (sin cómics ni animación), que es lo que cuenta la cabecera.
    public func duelo(contra otro: Progreso) -> Duelo {
        let ids = catalogo.titulos.map(\.id).filter { catalogo.idsMaraton.contains($0) }
        let comunes = ids.filter { visto($0) && otro.visto($0) }.count
        return Duelo(yo: resumen, el: otro.resumen, comunes: comunes,
                     soloEl: ids.filter { !visto($0) && otro.visto($0) },
                     soloYo: ids.filter { visto($0) && !otro.visto($0) })
    }
}

extension PerfilCompartido {
    /// ¿Es una versión más nueva del mismo maratón? Lo visto en `viejo` sigue
    /// visto aquí (el progreso solo crece): así un enlace nuevo de la misma
    /// persona la pone al día y dos «Ana» distintas no se pisan.
    public func continua(_ viejo: PerfilCompartido) -> Bool {
        func bytes(_ b64: String) -> [UInt8] {
            var s = b64.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
            s += String(repeating: "=", count: (4 - s.count % 4) % 4)
            return Data(base64Encoded: s).map { [UInt8]($0) } ?? []
        }
        let a = bytes(viejo.v), b = bytes(v)
        return a.enumerated().allSatisfy { i, x in x & ~(i < b.count ? b[i] : 0) == 0 }
    }

    /// Mismo perfil con otro nombre
    public func llamado(_ nombre: String) -> PerfilCompartido {
        PerfilCompartido(n: String(nombre.prefix(40)), v: v, e: e, r: r, t: t)
    }
}

public enum Rivales {
    /// Añade un rival: si ya hay alguien con su nombre y el enlace continúa su
    /// maratón, lo pone al día; si no, entra con el nombre numerado («Ana 2»).
    public static func agrega(_ p: PerfilCompartido, a lista: [PerfilCompartido]) -> [PerfilCompartido] {
        var lista = lista
        if let i = lista.firstIndex(where: { $0.n == p.n }), p.continua(lista[i]) {
            lista[i] = p
            return lista
        }
        var nombre = p.n, k = 2
        while lista.contains(where: { $0.n == nombre }) { nombre = "\(p.n) \(k)"; k += 1 }
        lista.append(p.llamado(nombre))
        return lista
    }
}

public struct Duelo: Sendable, Equatable {
    public let yo: Progreso.Resumen
    public let el: Progreso.Resumen
    public let comunes: Int
    /// Lo que vio y tú no, en el orden del maratón
    public let soloEl: [String]
    public let soloYo: [String]
    /// > 0: vas por delante (en títulos)
    public var diferencia: Int { yo.vistos - el.vistos }
}
