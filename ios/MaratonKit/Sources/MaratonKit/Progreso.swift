// Lo que el usuario ha visto. Igual que en la web: cada marca guarda el
// momento en milisegundos (las que llegan por bits valen 1) y los episodios
// van aparte con la clave «id:temporada:número».
import Foundation
import Observation

@MainActor @Observable
public final class Progreso {
    public private(set) var vistas: [String: Double] = [:]
    public private(set) var eps: [String: Double] = [:]
    /// Tus estrellas y reseñas, como KEY_NOTAS de la web
    public private(set) var notas: [String: Nota] = [:]

    @ObservationIgnored public let catalogo: Catalogo
    @ObservationIgnored let archivo: URL?
    /// El archivo existe pero no se pudo leer (protegido antes del primer
    /// desbloqueo, formato futuro…): se aparta antes de escribir encima.
    @ObservationIgnored var apartarAntesDeGuardar = false

    /// `archivo` nil = solo en memoria (pruebas y vistas previas)
    public init(catalogo: Catalogo, archivo: URL? = Progreso.archivoPorDefecto) {
        self.catalogo = catalogo
        self.archivo = archivo
        guard let archivo, FileManager.default.fileExists(atPath: archivo.path) else { return }
        if let datos = try? Data(contentsOf: archivo), let g = try? JSONDecoder().decode(Guardado.self, from: datos) {
            vistas = migraLotes(g.v)
            eps = g.e
            notas = g.n ?? [:]
        } else {
            apartarAntesDeGuardar = true
        }
    }

    public nonisolated static var archivoPorDefecto: URL? {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first?
            .appendingPathComponent("progreso.json")
    }

    // MARK: Marcar

    public func visto(_ id: String) -> Bool { vistas[id] != nil }
    public func visto(_ e: Episodio, de serie: String) -> Bool { eps[e.clave(serie)] != nil }

    public func alternar(_ id: String) {
        vistas[id] = visto(id) ? nil : ahora
        guarda()
    }

    /// Al completar todos los episodios de una serie, la serie queda vista
    /// (la web hace lo mismo y lanza el aviso de logro).
    public func alternar(_ e: Episodio, de serie: String) {
        let antes = completa(serie)
        eps[e.clave(serie)] = visto(e, de: serie) ? nil : ahora
        if completa(serie) && !antes && !visto(serie) { vistas[serie] = ahora }
        guarda()
    }

    public func vistosDe(serie: String) -> (vistos: Int, total: Int) {
        let lista = catalogo.episodios(de: serie)
        return (lista.filter { visto($0, de: serie) }.count, lista.count)
    }

    func completa(_ serie: String) -> Bool {
        let (v, t) = vistosDe(serie: serie)
        return t > 0 && v == t
    }

    // MARK: Notas

    public func nota(_ id: String) -> Nota { notas[id] ?? Nota() }

    /// Tocar la estrella que ya tenía la quita, como guardaNota de la web
    public func ponEstrellas(_ p: Int, a id: String) {
        var n = nota(id)
        n.p = n.p == p || !(1...5).contains(p) ? nil : p
        fija(n, id)
    }

    /// Corta en 280 lo que escribes aquí, pero una reseña más larga que llegó
    /// de la web no pierde texto al retocarla
    public func ponTexto(_ texto: String, a id: String) {
        var n = nota(id)
        let tope = max(Nota.largoMaximo, n.txt?.count ?? 0)
        n.txt = texto.isEmpty ? nil : String(texto.prefix(tope))
        fija(n, id)
    }

    func fija(_ n: Nota, _ id: String) {
        notas[id] = n.vacia ? nil : n
        guarda()
    }

    // MARK: Resumen

    public struct Resumen: Sendable, Equatable {
        public let vistos: Int
        public let total: Int
        public let minutosVistos: Int
        public let minutosTotal: Int
        public var fraccion: Double { total == 0 ? 0 : Double(vistos) / Double(total) }
        public var minutosRestantes: Int { max(0, minutosTotal - minutosVistos) }
    }

    /// Como resumenMaraton de la web: cuenta solo el maratón (sin cómics ni
    /// animación) y en las series a medias suma la parte vista de su duración.
    public var resumen: Resumen {
        var n = 0, min = 0, total = 0, minTotal = 0
        for t in catalogo.titulos where catalogo.idsMaraton.contains(t.id) {
            total += 1
            minTotal += t.minutos
            if visto(t.id) { n += 1; min += t.minutos }
            else if t.esSerie {
                let (v, tot) = vistosDe(serie: t.id)
                if v > 0 { min += Int((Double(t.minutos) * Double(v) / Double(tot)).rounded()) }
            }
        }
        return Resumen(vistos: n, total: total, minutosVistos: min, minutosTotal: minTotal)
    }

    /// El primer título del maratón sin ver, en el orden de la pantalla
    public func siguiente(filtro: (Titulo) -> Bool = { _ in true }) -> Titulo? {
        catalogo.titulos.first { catalogo.idsMaraton.contains($0.id) && !visto($0.id) && filtro($0) }
    }

    // MARK: Pasar el progreso (enlace de la web)

    public func exporta() -> (v: String, e: String) {
        (Bits.codifica(Set(vistas.keys), orden: catalogo.ordenIds),
         Bits.codifica(Set(eps.keys), orden: catalogo.ordenEps))
    }

    /// Suma lo que trae el enlace sin borrar nada de lo marcado aquí.
    /// Devuelve cuántos títulos y episodios nuevos entraron.
    @discardableResult
    public func importa(v: String, e: String) -> Importado {
        func unos(_ s: Set<String>) -> [String: Double] { Dictionary(uniqueKeysWithValues: s.map { ($0, 1.0) }) }
        return suma(unos(Bits.decodifica(v, orden: catalogo.ordenIds)), unos(Bits.decodifica(e, orden: catalogo.ordenEps)))
    }

    /// El código de la web (Ajustes › Tu progreso › «Copiar código»): JSON
    /// {v, e, n, l} en base64 sobre UTF-8. Aquí se usan v y e, con su momento,
    /// y las notas n. nil si el texto no es un código de la web.
    @discardableResult
    public func importa(codigoWeb: String) -> Importado? {
        let limpio = codigoWeb.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let datos = Data(base64Encoded: limpio + String(repeating: "=", count: (4 - limpio.count % 4) % 4)),
              let json = try? JSONSerialization.jsonObject(with: datos) as? [String: Any] else { return nil }
        func marcas(_ x: Any?) -> [String: Double] {
            guard let d = x as? [String: Any] else { return [:] }
            return d.compactMapValues { ($0 as? NSNumber)?.doubleValue }.filter { $0.value != 0 }
        }
        let v = marcas(json["v"]), e = marcas(json["e"])
        guard json["v"] is [String: Any] || json["e"] is [String: Any] else { return nil }
        return suma(v, e, notas: Nota.sanea(json["n"]))
    }

    public struct Importado: Sendable, Equatable {
        public let titulos: Int
        public let episodios: Int
        public var notas = 0
    }

    func suma(_ v: [String: Double], _ e: [String: Double], notas nuevas: [String: Nota] = [:]) -> Importado {
        var nv = 0, ne = 0, nn = 0
        let epsValidos = Set(catalogo.ordenEps)
        for (id, marca) in migraLotes(v) where vistas[id] == nil && catalogo.titulo(id) != nil {
            vistas[id] = marca; nv += 1
        }
        for (clave, marca) in e where eps[clave] == nil && epsValidos.contains(clave) {
            eps[clave] = marca; ne += 1
        }
        // la nota de un lote viejo pasa a su primera pieza (como la web);
        // una nota que ya tienes aquí no se pisa
        var porId = nuevas
        for (lote, piezas) in catalogo.lotes {
            guard let n = porId.removeValue(forKey: lote), let primera = piezas.first else { continue }
            if porId[primera] == nil { porId[primera] = n }
        }
        for (id, n) in porId where notas[id] == nil && catalogo.titulo(id) != nil {
            notas[id] = n; nn += 1
        }
        if nv + ne + nn > 0 { guarda() }
        return Importado(titulos: nv, episodios: ne, notas: nn)
    }

    /// Quien tenía marcado un lote viejo (p. ej. «sony») conserva la marca en
    /// cada una de sus piezas, como migraMarcas de la web.
    func migraLotes(_ v: [String: Double]) -> [String: Double] {
        var n = v
        for (lote, piezas) in catalogo.lotes {
            guard let marca = v[lote] else { continue }
            for id in piezas where n[id] == nil { n[id] = marca }
            n[lote] = nil
        }
        return n
    }

    // MARK: Guardar

    /// n es opcional: los progreso.json de antes de las notas no la tienen
    struct Guardado: Codable { let v: [String: Double]; let e: [String: Double]; var n: [String: Nota]? }

    var ahora: Double { (Date().timeIntervalSince1970 * 1000).rounded() }

    func guarda() {
        guard let archivo else { return }
        do {
            let fm = FileManager.default
            try fm.createDirectory(at: archivo.deletingLastPathComponent(), withIntermediateDirectories: true)
            if apartarAntesDeGuardar {
                let respaldo = archivo.deletingPathExtension()
                    .appendingPathExtension("respaldo-\(Int(ahora)).json")
                try fm.moveItem(at: archivo, to: respaldo)
                apartarAntesDeGuardar = false
            }
            try JSONEncoder().encode(Guardado(v: vistas, e: eps, n: notas)).write(to: archivo, options: .atomic)
        } catch {
            // sin disco no hay nada que hacer: la marca sigue en memoria
        }
    }
}

/// Tus estrellas (1 a 5) y tu reseña de un título
public struct Nota: Codable, Sendable, Hashable {
    public var p: Int?
    public var txt: String?
    /// El campo de la web acepta 280; lo importado se corta en 4000 (saneaNotas)
    public static let largoMaximo = 280

    public init(p: Int? = nil, txt: String? = nil) { self.p = p; self.txt = txt }

    var vacia: Bool { p == nil && txt == nil }
    /// Cuenta como reseña si tiene algo escrito (no solo espacios)
    public var tieneResena: Bool { !(txt ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }

    /// Las notas del código de la web, con las reglas de saneaNotas
    static func sanea(_ x: Any?) -> [String: Nota] {
        guard let d = x as? [String: Any] else { return [:] }
        var out: [String: Nota] = [:]
        for (id, v) in d {
            guard let o = v as? [String: Any] else { continue }
            var n = Nota()
            if let p = (o["p"] as? NSNumber)?.doubleValue, p >= 1, p <= 5 { n.p = Int(p.rounded()) }
            if let t = o["txt"] as? String { n.txt = String(t.prefix(4000)) }
            if !n.vacia { out[id] = n }
        }
        return out
    }
}
