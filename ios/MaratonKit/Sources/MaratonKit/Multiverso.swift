// El Multiverso de la web: cada Tierra con sus títulos, cuánto llevas de
// ella, con qué otras se cruza y las conexiones del mapa (MAPA_ARISTAS),
// además de las órbitas y anillos del sistema (ORBITAS, ANILLOS de App.jsx).
import Foundation

/// Una conexión canónica entre dos títulos («El Loki de 2012 escapa con el Teseracto»)
public struct Arista: Codable, Sendable, Hashable {
    public let a: String
    public let b: String
    public let t: String
}

/// Un anillo del sistema: radio y su nombre y descripción [es, en]
public struct Anillo: Codable, Sendable, Hashable {
    public let r: Double
    public let t: [String]
    public let d: [String]
    public func titulo(en idioma: Idioma) -> String { idioma == .en ? t.last ?? "" : t.first ?? "" }
    public func descripcion(en idioma: Idioma) -> String { idioma == .en ? d.last ?? "" : d.first ?? "" }
}

/// Dónde gira un planeta: [radio, ángulo de salida, segundos por vuelta, sentido, diámetro]
public struct Orbita: Sendable, Hashable {
    public let radio: Double
    public let fase: Double
    public let segundos: Double
    public let sentido: Double
    public let diametro: Double
}

struct FicheroMultiverso: Codable {
    let aristas: [Arista]
    let anillos: [Anillo]
    let orbitas: [String: [Double]]
    let numEn: [String: String]
    let corto: [String: String]
}

extension Universo: Identifiable {
    public var id: String { num }
}

extension Catalogo {
    /// Los títulos de una Tierra: la saga entera si es un grupo (en el UCM, sin
    /// los de otro universo) o su lista de ids
    public func titulos(de u: Universo) -> [Titulo] { porTierra[u.num] ?? [] }

    public func universo(_ num: String) -> Universo? { multiverso.first { $0.num == num } }

    /// «Tierra-616» → «Earth-616» en inglés (el num es también la clave)
    public func numero(_ num: String, en idioma: Idioma) -> String {
        guard idioma == .en else { return num }
        if let n = mapaMultiverso.numEn[num] { return n }
        if num.hasPrefix("Tierra-") { return "Earth-" + num.dropFirst(7) }
        if num.hasPrefix("T-") { return "E-" + num.dropFirst(2) }
        return num
    }

    /// El nombre corto del sistema: «Sony», «What If», «T-10005»…
    public func numeroCorto(_ num: String, en idioma: Idioma) -> String {
        numero(mapaMultiverso.corto[num] ?? num.replacingOccurrences(of: "Tierra-", with: "T-"), en: idioma)
    }

    public var anillos: [Anillo] { mapaMultiverso.anillos }
    public var aristas: [Arista] { mapaMultiverso.aristas }

    public func orbita(_ num: String) -> Orbita? {
        guard let o = mapaMultiverso.orbitas[num], o.count == 5 else { return nil }
        return Orbita(radio: o[0], fase: o[1], segundos: o[2], sentido: o[3], diametro: o[4])
    }

    /// Las Tierras de un anillo (por su radio), en el orden de data.js
    public func universos(anillo: Anillo) -> [Universo] {
        multiverso.filter { orbita($0.num)?.radio == anillo.r }
    }

    /// Las otras Tierras que comparten títulos con esta, de más a menos cruces
    public func cruces(de u: Universo) -> [(universo: Universo, comunes: Int)] {
        let mios = Set(titulos(de: u).map(\.id))
        return multiverso.filter { $0.num != u.num }
            .map { o in (o, titulos(de: o).filter { mios.contains($0.id) }.count) }
            .filter { $0.1 > 0 }
            .enumerated().sorted { $0.element.1 != $1.element.1 ? $0.element.1 > $1.element.1 : $0.offset < $1.offset }
            .map { ($0.element.0, $0.element.1) }
    }

    /// Las conexiones del mapa que tocan esta Tierra: título de aquí ↔ título de donde sea
    public func conexiones(de u: Universo) -> [(arista: Arista, aqui: Titulo, otro: Titulo)] {
        let mios = Set(titulos(de: u).map(\.id))
        return aristas.compactMap { e in
            guard mios.contains(e.a) || mios.contains(e.b) else { return nil }
            let aqui = mios.contains(e.a) ? e.a : e.b, otro = aqui == e.a ? e.b : e.a
            guard let ta = titulo(aqui), let to = titulo(otro) else { return nil }
            return (e, ta, to)
        }
    }

    /// Los dos colores de la era de un título
    public func coloresEra(de id: String) -> [String]? { eraDe[id]?.c }
}

extension Progreso {
    public struct ProgresoTierra: Sendable, Hashable {
        public let vistos: Int
        public let total: Int
        public var fraccion: Double { total == 0 ? 0 : Double(vistos) / Double(total) }
        public var completa: Bool { total > 0 && vistos == total }
    }

    public struct ResumenMultiverso: Sendable, Hashable {
        /// Títulos distintos vistos y en total (sin las Tierras opcionales)
        public let vistos: Int
        public let total: Int
        public let completas: Int
        public let cuentan: Int
        public var fraccion: Double { total == 0 ? 0 : Double(vistos) / Double(total) }
    }

    public func progreso(de u: Universo) -> ProgresoTierra {
        let ts = catalogo.titulos(de: u)
        return ProgresoTierra(vistos: ts.filter { visto($0.id) }.count, total: ts.count)
    }

    public func siguiente(en u: Universo) -> Titulo? { catalogo.titulos(de: u).first { !visto($0.id) } }

    public var resumenMultiverso: ResumenMultiverso {
        let cuentan = catalogo.multiverso.filter { $0.opc != true }
        let todos = Set(cuentan.flatMap { catalogo.titulos(de: $0).map(\.id) })
        return ResumenMultiverso(vistos: todos.filter { visto($0) }.count, total: todos.count,
                                 completas: cuentan.filter { progreso(de: $0).completa }.count, cuentan: cuentan.count)
    }
}
