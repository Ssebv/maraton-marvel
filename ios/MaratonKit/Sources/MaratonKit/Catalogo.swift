// El catálogo entero en memoria: se carga una vez de los JSON del paquete y no
// cambia mientras la app corre (por eso es Sendable y todo es `let`).
import Foundation

public enum Idioma: String, Codable, Sendable, CaseIterable {
    /// Español de España: los títulos de data.js tal cual
    case es
    /// Español de Latinoamérica: títulos de estreno de allá (src/titulos.js)
    case latam
    case en
}

public final class Catalogo: Sendable {
    public let sagas: [Saga]
    public let estrenos: [Estreno]
    public let multiverso: [Universo]
    /// Nota de IMDb desde la que un título es una «joya»
    public let joyaMin: Double
    /// Todos los títulos en el orden de la pantalla (el de data.js)
    public let titulos: [Titulo]
    /// Los que cuentan para el maratón: todo menos cómics y animación
    public let idsMaraton: Set<String>
    public let episodios: [String: [Episodio]]
    /// El orden de los bits (contrato con la web: solo crece por el final)
    public let ordenIds: [String]
    public let ordenEps: [String]
    /// Lotes viejos partidos en títulos sueltos (LOTES_PARTIDOS de App.jsx)
    public let lotes: [String: [String]]
    public let paises: [Pais]

    let porId: [String: Titulo]
    let sagaDe: [String: String]
    let idiomas: FicheroIdiomas
    let porPais: [String: [String: String]]
    let imagenes: FicheroImagenes
    let detalles: [Idioma: [String: Detalle]]
    let recursos: URL

    /// La carpeta Recursos del paquete, o otra (pruebas)
    public static func cargar(desde carpeta: URL? = nil) throws -> Catalogo {
        guard let recursos = carpeta ?? Bundle.module.url(forResource: "Recursos", withExtension: nil) else {
            throw ErrorCatalogo.faltanRecursos
        }
        return try Catalogo(recursos: recursos)
    }

    init(recursos: URL) throws {
        self.recursos = recursos
        let datos = recursos.appendingPathComponent("datos")
        func lee<T: Decodable>(_ nombre: String, _ tipo: T.Type) throws -> T {
            let url = datos.appendingPathComponent(nombre)
            do { return try JSONDecoder().decode(T.self, from: Data(contentsOf: url)) }
            catch { throw ErrorCatalogo.ficheroMalo(nombre, String(describing: error)) }
        }
        let cat = try lee("catalogo.json", FicheroCatalogo.self)
        let orden = try lee("orden.json", FicheroOrden.self)
        sagas = cat.sagas
        estrenos = cat.estrenos
        multiverso = cat.multiverso
        joyaMin = cat.joyaMin
        episodios = try lee("episodios.json", [String: [Episodio]].self)
        ordenIds = orden.ids
        ordenEps = orden.eps
        lotes = orden.lotes
        idiomas = try lee("idiomas.json", FicheroIdiomas.self)
        let plat = try lee("plataformas.json", FicheroPlataformas.self)
        paises = plat.paises
        porPais = plat.porPais
        imagenes = try lee("imagenes.json", FicheroImagenes.self)
        detalles = [
            .es: try lee("detalles-es.json", [String: Detalle].self),
            .en: try lee("detalles-en.json", [String: Detalle].self),
        ]

        var lista: [Titulo] = [], ids: [String: Titulo] = [:], de: [String: String] = [:], maraton = Set<String>()
        for saga in cat.sagas {
            for era in saga.eras {
                for it in era.items {
                    lista.append(it)
                    ids[it.id] = it
                    de[it.id] = saga.saga
                    if saga.saga != "comics" && saga.saga != "animacion" { maraton.insert(it.id) }
                }
            }
        }
        titulos = lista
        porId = ids
        sagaDe = de
        idsMaraton = maraton
    }

    // MARK: Consultas

    public func titulo(_ id: String) -> Titulo? { porId[id] }
    public func saga(de id: String) -> String? { sagaDe[id] }
    public func episodios(de id: String) -> [Episodio] { episodios[id] ?? [] }

    /// Temporadas de una serie con sus episodios, en orden
    public func temporadas(de id: String) -> [(numero: Int, episodios: [Episodio])] {
        Dictionary(grouping: episodios(de: id), by: \.s)
            .sorted { $0.key < $1.key }
            .map { ($0.key, $0.value.sorted { $0.n < $1.n }) }
    }

    // MARK: Idioma

    public func nombre(_ t: Titulo, en idioma: Idioma) -> String {
        switch idioma {
        case .es: t.t
        case .latam: idiomas.latam.titulos[t.id] ?? t.t
        case .en: idiomas.en.titulos[t.id] ?? t.en ?? t.t
        }
    }

    public func nombre(_ e: Episodio, de serie: String, en idioma: Idioma) -> String {
        let clave = "\(e.s):\(e.n)"
        switch idioma {
        case .es: return e.t
        case .latam: return idiomas.latam.episodios[serie]?[clave] ?? e.t
        case .en: return idiomas.en.episodios[serie]?[clave] ?? e.t
        }
    }

    /// Los textos de data.js (resúmenes, notas, guías) en inglés si hay traducción
    public func texto(_ s: String?, en idioma: Idioma) -> String? {
        guard let s else { return nil }
        return idioma == .en ? (idiomas.en.textos?[s] ?? s) : s
    }

    public func detalle(_ id: String, en idioma: Idioma) -> Detalle? {
        detalles[idioma == .en ? .en : .es]?[id] ?? detalles[.es]?[id]
    }

    /// Dónde verlo en un país (misma regla que la web: España, Panini,
    /// Marvel Unlimited y cine se quedan con lo que dice data.js)
    public func plataforma(_ t: Titulo, pais: String) -> String? {
        guard let plat = t.plat else { return nil }
        if pais == "ES" || plat.range(of: #"panini|unlimited|^cine"#, options: [.regularExpression, .caseInsensitive]) != nil {
            return plat
        }
        return porPais[pais]?[t.id] ?? plat
    }

    // MARK: Imágenes del paquete

    /// En inglés, el póster inglés si está en el paquete; si no, el español
    public func urlPoster(_ id: String, idioma: Idioma = .es) -> URL? {
        if idioma == .en, let ruta = imagenes.postersEn?[id] {
            let url = recursos.appendingPathComponent(ruta)
            if FileManager.default.fileExists(atPath: url.path) { return url }
        }
        return imagenes.posters[id].map { recursos.appendingPathComponent($0) }
    }

    public func urlFoto(persona: String) -> URL? {
        imagenes.personas[persona].map { recursos.appendingPathComponent($0) }
    }

    public func tmdb(_ id: String) -> RefTMDB? { imagenes.tmdb[id] }
    /// La clave pública de lectura de TMDB que usa la web (src/tmdb.js)
    public var claveTMDB: String? { imagenes.tmdbKey }

    // MARK: Búsqueda

    /// Busca en títulos (los tres idiomas), reparto y dirección, sin importar
    /// tildes, mayúsculas, guiones ni espacios («spiderman» encuentra «Spider-Man»).
    public func buscar(_ consulta: String) -> [Titulo] {
        let q = Texto.compacto(consulta)
        guard !q.isEmpty else { return [] }
        return titulos.filter { t in
            var campos = [t.t, idiomas.latam.titulos[t.id], idiomas.en.titulos[t.id], t.en, t.dir]
            campos += (t.cast ?? []).map(Optional.some)
            return campos.contains { $0.map { Texto.compacto($0).contains(q) } ?? false }
        }
    }
}

public enum ErrorCatalogo: Error, CustomStringConvertible {
    case faltanRecursos
    case ficheroMalo(String, String)
    public var description: String {
        switch self {
        case .faltanRecursos: "No están los datos: corre `npm run ios:datos` en la raíz del repo."
        case let .ficheroMalo(f, e): "No se pudo leer \(f): \(e)"
        }
    }
}

enum Texto {
    /// Minúsculas, sin tildes y solo letras y números
    static func compacto(_ s: String) -> String {
        s.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "es"))
            .unicodeScalars.filter { CharacterSet.alphanumerics.contains($0) }
            .map(String.init).joined()
    }
}
