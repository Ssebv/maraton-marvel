// Los tipos de los JSON que exporta scripts/exportar-ios.mjs. Los nombres de
// campo son los de src/data.js (cortos) y se traducen aquí a nombres legibles.
import Foundation

public struct Saga: Codable, Sendable, Identifiable {
    public let saga: String
    public let titulo: String
    public let uni: String?
    public let desc: String?
    public let guia: [Guia]?
    public let eras: [Era]
    public var id: String { saga }
}

public struct Guia: Codable, Sendable, Hashable {
    public let t: String
    public let p: String
}

public struct Era: Codable, Sendable, Identifiable {
    public let era: String
    public let rango: String?
    /// Dos colores (claro y oscuro) en hexadecimal: el degradado de la era
    public let c: [String]?
    /// Id estable de la era cuando el nombre puede cambiar
    public let clave: String?
    public let items: [Titulo]
    public var id: String { clave ?? era }
}

public struct Titulo: Codable, Sendable, Identifiable, Hashable {
    public let id: String
    /// Título en español de España
    public let t: String
    /// Dónde van las escenas post-créditos («0», «1 al final»…) y su nota
    public let pc: String?
    public let pcn: String?
    /// Cuándo ocurre la historia
    public let h: String?
    /// Año de estreno
    public let r: Int?
    /// Nota de IMDb
    public let s: Double?
    /// Duración en minutos (en series, la serie entera)
    public let d: Int?
    public let plat: String?
    public let dir: String?
    public let cast: [String]?
    public let res: String?
    /// Nota de visionado
    public let n: String?
    /// Ruta express y opcional
    public let exp: Bool?
    public let opt: Bool?
    /// «serie», «esp» (especial) o texto libre; nil = película
    public let tipo: String?
    public let uni: String?
    /// Cómics: título en inglés y autores
    public let en: String?
    public let a: String?

    public var esSerie: Bool { tipo == "serie" }
    public var esExpress: Bool { exp == true }
    public var esOpcional: Bool { opt == true }
    public var minutos: Int { d ?? 0 }
}

public struct Episodio: Codable, Sendable, Hashable {
    public let s: Int
    public let n: Int
    public let t: String
    /// Fecha de emisión AAAA-MM-DD
    public let f: String?
    /// La clave de su bit y de las marcas: «id:temporada:número»
    public func clave(_ serie: String) -> String { "\(serie):\(s):\(n)" }
}

public struct Estreno: Codable, Sendable, Hashable {
    public let t: String
    public let id: String?
    /// AAAA-MM-DD, o nil con `aprox` («Otoño de 2026»)
    public let fecha: String?
    public let aprox: String?
    public let tipo: String?
    public let n: String?
    public let img: String?
    public let poster: String?
}

public struct Universo: Codable, Sendable, Hashable {
    public let num: String
    public let nombre: String
    public let ids: [String]?
    public let c: String?
    public let grupo: String?
    public let estado: String?
    public let desc: String?
    public let rasgo: String?
    public let doom: String?
    public let opc: Bool?
}

/// Lo que cuentan las fichas ampliadas (public/detalles/<idioma>.json)
public struct Detalle: Codable, Sendable, Hashable {
    public let larga: String?
    public let cambios: [Cambio]?
    public let extras: [Extra]?
    public let pcs: [PostCredito]?

    public struct Cambio: Codable, Sendable, Hashable {
        public let p: String
        public let antes: String?
        public let ahora: String?
        public let nota: String?
    }
    public struct Extra: Codable, Sendable, Hashable {
        public let t: String
        public let d: String?
        public let donde: String?
    }
    public struct PostCredito: Codable, Sendable, Hashable {
        public let cuando: String?
        public let t: String
        public let d: String?
        public let conecta: String?
    }
}

public struct Pais: Codable, Sendable, Hashable, Identifiable {
    public let id: String
    public let nombre: String
}

/// [número, "movie" | "tv"] en TMDB
public struct RefTMDB: Codable, Sendable, Hashable {
    public let numero: Int
    public let tipo: String
    public init(from decoder: Decoder) throws {
        var c = try decoder.unkeyedContainer()
        numero = try c.decode(Int.self)
        tipo = try c.decode(String.self)
    }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.unkeyedContainer()
        try c.encode(numero)
        try c.encode(tipo)
    }
}

// Los ficheros tal como salen del exportador
struct FicheroCatalogo: Codable { let sagas: [Saga]; let estrenos: [Estreno]; let multiverso: [Universo]; let joyaMin: Double }
struct FicheroOrden: Codable { let ids: [String]; let eps: [String]; let lotes: [String: [String]] }
struct FicheroIdiomas: Codable {
    struct Traduccion: Codable { let textos: [String: String]?; let titulos: [String: String]; let episodios: [String: [String: String]] }
    let en: Traduccion
    let latam: Traduccion
}
struct FicheroPlataformas: Codable { let paises: [Pais]; let porPais: [String: [String: String]] }
struct FicheroImagenes: Codable { let posters: [String: String]; let postersEn: [String: String]?; let personas: [String: String]; let tmdb: [String: RefTMDB]; let tmdbKey: String?; let fotogramas: [String: String]? }
