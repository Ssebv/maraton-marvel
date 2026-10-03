// Lo que el usuario ha visto. Igual que en la web: cada marca guarda el
// momento en milisegundos (las que llegan por bits valen 1) y los episodios
// van aparte con la clave «id:temporada:número».
import Foundation
import Observation

@MainActor @Observable
public final class Progreso {
    public private(set) var vistas: [String: Double] = [:]
    public private(set) var eps: [String: Double] = [:]

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
    public func importa(v: String, e: String) -> (titulos: Int, episodios: Int) {
        func unos(_ s: Set<String>) -> [String: Double] { Dictionary(uniqueKeysWithValues: s.map { ($0, 1.0) }) }
        return suma(unos(Bits.decodifica(v, orden: catalogo.ordenIds)), unos(Bits.decodifica(e, orden: catalogo.ordenEps)))
    }

    /// El código de la web (Ajustes › Tu progreso › «Copiar código»): JSON
    /// {v, e, n, l} en base64 sobre UTF-8. Aquí se usan v y e, con su momento.
    /// nil si el texto no es un código de la web.
    @discardableResult
    public func importa(codigoWeb: String) -> (titulos: Int, episodios: Int)? {
        let limpio = codigoWeb.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let datos = Data(base64Encoded: limpio + String(repeating: "=", count: (4 - limpio.count % 4) % 4)),
              let json = try? JSONSerialization.jsonObject(with: datos) as? [String: Any] else { return nil }
        func marcas(_ x: Any?) -> [String: Double] {
            guard let d = x as? [String: Any] else { return [:] }
            return d.compactMapValues { ($0 as? NSNumber)?.doubleValue }.filter { $0.value != 0 }
        }
        let v = marcas(json["v"]), e = marcas(json["e"])
        guard json["v"] is [String: Any] || json["e"] is [String: Any] else { return nil }
        return suma(v, e)
    }

    func suma(_ v: [String: Double], _ e: [String: Double]) -> (titulos: Int, episodios: Int) {
        var nv = 0, ne = 0
        let epsValidos = Set(catalogo.ordenEps)
        for (id, marca) in migraLotes(v) where vistas[id] == nil && catalogo.titulo(id) != nil {
            vistas[id] = marca; nv += 1
        }
        for (clave, marca) in e where eps[clave] == nil && epsValidos.contains(clave) {
            eps[clave] = marca; ne += 1
        }
        if nv + ne > 0 { guarda() }
        return (nv, ne)
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

    struct Guardado: Codable { let v: [String: Double]; let e: [String: Double] }

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
            try JSONEncoder().encode(Guardado(v: vistas, e: eps)).write(to: archivo, options: .atomic)
        } catch {
            // sin disco no hay nada que hacer: la marca sigue en memoria
        }
    }
}
