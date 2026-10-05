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
    let mapaMultiverso: FicheroMultiverso
    let eraDe: [String: Era]
    /// Los títulos de cada Tierra, calculados una vez (las vistas los piden en cada pasada)
    let porTierra: [String: [Titulo]]
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
        mapaMultiverso = try lee("multiverso.json", FicheroMultiverso.self)
        let plat = try lee("plataformas.json", FicheroPlataformas.self)
        paises = plat.paises
        porPais = plat.porPais
        imagenes = try lee("imagenes.json", FicheroImagenes.self)
        detalles = [
            .es: try lee("detalles-es.json", [String: Detalle].self),
            .en: try lee("detalles-en.json", [String: Detalle].self),
        ]

        var lista: [Titulo] = [], ids: [String: Titulo] = [:], de: [String: String] = [:], maraton = Set<String>()
        var eras: [String: Era] = [:]
        for saga in cat.sagas {
            for era in saga.eras {
                for it in era.items {
                    lista.append(it)
                    ids[it.id] = it
                    de[it.id] = saga.saga
                    eras[it.id] = era
                    if saga.saga != "comics" && saga.saga != "animacion" { maraton.insert(it.id) }
                }
            }
        }
        titulos = lista
        porId = ids
        sagaDe = de
        eraDe = eras
        idsMaraton = maraton
        porTierra = Dictionary(cat.multiverso.map { u in
            if let grupo = u.grupo {
                // la saga entera; en el UCM, sin los de otro universo
                let items = (cat.sagas.first { $0.saga == grupo }?.eras ?? []).flatMap(\.items)
                return (u.num, items.filter { grupo != "ucm" || $0.uni == nil })
            }
            return (u.num, (u.ids ?? []).compactMap { ids[$0] })
        }, uniquingKeysWith: { a, _ in a })
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

    /// El fotograma de TMDB de un título (red; la web lo pide igual en w780)
    public func urlFotograma(_ id: String, ancho: Int = 780) -> URL? {
        imagenes.fotogramas?[id].flatMap { URL(string: "https://image.tmdb.org/t/p/w\(ancho)\($0)") }
    }

    /// Un fichero del paquete por su ruta relativa («fondo/ucm.webp»), si está
    public func urlLocal(_ ruta: String?) -> URL? {
        guard let ruta else { return nil }
        let url = recursos.appendingPathComponent(ruta)
        return FileManager.default.fileExists(atPath: url.path) ? url : nil
    }

    /// El fondo de una saga (public/fondo/<saga>.webp); X-Men no tiene y usa fotogramas
    public func urlFondo(saga: String) -> URL? { urlLocal("fondo/\(saga).webp") }

    /// El próximo estreno con fecha y los días que faltan (la cuenta atrás de la cabecera)
    public func proximoEstreno(hoy: Date = Date()) -> (estreno: Estreno, dias: Int)? {
        estrenosPendientes(hoy: hoy).first.flatMap { e in e.dias.map { (e.estreno, $0) } }
    }

    /// Los estrenos que faltan: primero los que tienen fecha (del más cercano al
    /// más lejano) y luego los aproximados («Otoño de 2026»), en el orden de los datos
    public func estrenosPendientes(hoy: Date = Date()) -> [(estreno: Estreno, dias: Int?)] {
        let cal = Calendar(identifier: .gregorian)
        let inicio = cal.startOfDay(for: hoy)
        let conFecha = estrenos
            .compactMap { e in e.fecha.flatMap { Self.dia($0, cal) }.map { (e, $0) } }
            .filter { $0.1 >= inicio }
            .sorted { $0.1 < $1.1 }
            .map { (estreno: $0.0, dias: Optional(cal.dateComponents([.day], from: inicio, to: $0.1).day ?? 0)) }
        let sinFecha = estrenos.filter { $0.fecha == nil }.map { (estreno: $0, dias: Int?.none) }
        return conFecha + sinFecha
    }

    /// La meta del horario, como la web: el primer estreno con fecha que aún no
    /// llega, en el orden de los datos (Doomsday va antes que las series que se
    /// estrenan antes), con su medianoche local
    public func estrenoObjetivo(hoy: Date = Date(), calendario cal: Calendar = .current) -> (estreno: Estreno, fecha: Date)? {
        estrenos.lazy.compactMap { e in e.fecha.flatMap { Self.dia($0, cal) }.map { (e, $0) } }.first { $0.1 > hoy }
    }

    /// «2026-12-18» a medianoche en hora local (sin DateFormatter: no se crea uno por llamada)
    /// (siempre gregoriano, en la zona horaria de `cal`: con el calendario budista
    /// o el japonés del iPhone, «2026» sería otro año)
    public static func dia(_ texto: String, _ cal: Calendar = .current) -> Date? {
        let p = texto.split(separator: "-").compactMap { Int($0) }
        guard p.count == 3 else { return nil }
        return gregoriano(cal).date(from: DateComponents(year: p[0], month: p[1], day: p[2]))
    }

    static func gregoriano(_ cal: Calendar) -> Calendar {
        var g = Calendar(identifier: .gregorian)
        g.timeZone = cal.timeZone
        return g
    }

    /// La imagen de un estreno: su fondo, su póster propio o el del título
    public func urlImagen(estreno e: Estreno) -> URL? {
        urlLocal(e.img) ?? urlLocal(e.poster) ?? e.id.flatMap { urlPoster($0) }
    }

    /// Posición de un título del maratón dentro de su saga (1…n) y cuántos tiene
    public func posicionEnSaga(_ id: String) -> (posicion: Int, total: Int)? {
        let ts = enSaga(id)
        return ts.firstIndex { $0.id == id }.map { ($0 + 1, ts.count) }
    }

    /// El título de antes y el de después en su saga, en el orden del maratón
    public func vecinosEnSaga(_ id: String) -> (anterior: Titulo?, siguiente: Titulo?) {
        let ts = enSaga(id)
        guard let i = ts.firstIndex(where: { $0.id == id }) else { return (nil, nil) }
        return (i > 0 ? ts[i - 1] : nil, i + 1 < ts.count ? ts[i + 1] : nil)
    }

    /// Los títulos del maratón de la saga de `id` (vacío si no está en el maratón)
    private func enSaga(_ id: String) -> [Titulo] {
        guard let saga = sagaDe[id] else { return [] }
        return titulos.filter { sagaDe[$0.id] == saga && idsMaraton.contains($0.id) }
    }

    public func tmdb(_ id: String) -> RefTMDB? { imagenes.tmdb[id] }
    /// La clave pública de lectura de TMDB que usa la web (src/tmdb.js)
    public var claveTMDB: String? { imagenes.tmdbKey }

    // MARK: Búsqueda

    /// Busca en títulos y episodios (los tres idiomas), reparto y dirección, sin importar
    /// tildes, mayúsculas, guiones ni espacios («spiderman» encuentra «Spider-Man»).
    /// `conEpisodios` dice de qué series se miran los episodios (sin spoilers: solo de las vistas).
    public func buscar(_ consulta: String, conEpisodios: (Titulo) -> Bool = { _ in true }) -> [Titulo] {
        let q = Texto.compacto(consulta)
        guard !q.isEmpty else { return [] }
        return titulos.filter { t in
            var campos = [t.t, idiomas.latam.titulos[t.id], idiomas.en.titulos[t.id], t.en, t.dir]
            campos += (t.cast ?? []).map(Optional.some)
            if campos.contains(where: { $0.map { Texto.compacto($0).contains(q) } ?? false }) { return true }
            // y los episodios de las series, en los tres idiomas
            guard conEpisodios(t) else { return false }
            return episodios(de: t.id).contains { e in
                Idioma.allCases.contains { Texto.compacto(nombre(e, de: t.id, en: $0)).contains(q) }
            }
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
