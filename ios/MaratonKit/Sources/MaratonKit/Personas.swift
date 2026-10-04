// La página de cada persona, como FichaPersona de la web: lo que sale de TMDB
// (/person/{id}?append_to_response=combined_credits) reducido a lo que se
// enseña, y dónde sale dentro del maratón. La red la hace la app; aquí, lo
// que se puede probar sin red.
import Foundation

public struct DatosPersona: Codable, Sendable, Equatable {
    public var bio: String
    /// nil = TMDB en el idioma; «wikipedia» o «tmdb-en» si vino de otro lado
    public var bioFuente: String?
    public var bioUrl: String?
    public var nacimiento: String?
    public var muerte: String?
    public var lugar: String?
    public var foto: String?
    /// Los ids del maratón en los que sale (por TMDB, no por nombre)
    public var enMaraton: [String]
    /// A quién interpreta en cada título del maratón
    public var papeles: [String: String]
    public var carrera: Carrera
    public var imdb: String?

    public struct Carrera: Codable, Sendable, Equatable {
        /// Su primera película
        public var desde: Int?
        public var creditos: Int
        /// Lo más votado fuera del maratón
        public var conocido: [Conocido]
    }
    public struct Conocido: Codable, Sendable, Hashable {
        public let t: String
        public let a: Int?
        public let p: String
        public let papel: String
    }

    /// Como cargaPersona de la web. `inverso`: «movie:1726» → id del maratón
    public static func lee(_ j: [String: Any], inverso: [String: String]) -> DatosPersona {
        func texto(_ k: String) -> String? { (j[k] as? String).flatMap { $0.isEmpty ? nil : $0 } }
        let cc = j["combined_credits"] as? [String: Any] ?? [:]
        let cast = (cc["cast"] as? [Any] ?? []).compactMap { $0 as? [String: Any] }
        let crew = (cc["crew"] as? [Any] ?? []).compactMap { $0 as? [String: Any] }
        func clave(_ c: [String: Any]) -> String? {
            guard let tipo = c["media_type"] as? String, tipo == "movie" || tipo == "tv",
                  let n = c["id"] as? Int else { return nil }
            return "\(tipo):\(n)"
        }
        func generos(_ c: [String: Any]) -> [Int] { c["genre_ids"] as? [Int] ?? [] }

        var enMaraton: [String] = []
        for c in cast + crew {
            if let id = clave(c).flatMap({ inverso[$0] }), !enMaraton.contains(id) { enMaraton.append(id) }
        }
        var papeles: [String: String] = [:]
        for c in cast {
            guard let id = clave(c).flatMap({ inverso[$0] }), papeles[id] == nil,
                  let p = c["character"] as? String, !p.trimmingCharacters(in: .whitespaces).isEmpty else { continue }
            papeles[id] = String(Personas.limpiaPapel(p).prefix(80))
        }

        // fuera lo que no es su trabajo: de sí mismo, entrevistas, noticias, documentales, realities
        let no: Set<Int> = [10767, 10763, 99, 10764]
        let deSiMismo = /\b(himself|herself|self|themselves|narrator|host|él mismo|ella misma)\b/.ignoresCase()
        // y lo que no es de verdad su trabajo: «Hugh Jackman (voice)» en un cameo de sí
        // mismo o los agradecimientos («Thanks») de los créditos
        let propio = Texto.compacto(j["name"] as? String ?? "")
        func suyo(_ c: [String: Any]) -> Bool {
            let papel = c["character"] as? String
            return clave(c) != nil && !generos(c).contains(where: no.contains)
                && papel.map { $0.firstMatch(of: deSiMismo) == nil } ?? true
                && !(propio.count > 3 && papel.map { Texto.compacto($0).contains(propio) } == true)
                && (c["job"] as? String) != "Thanks"
        }
        func anio(_ c: [String: Any]) -> Int? {
            let f = (c["release_date"] as? String) ?? (c["first_air_date"] as? String) ?? ""
            return f.count >= 4 ? Int(f.prefix(4)) : nil
        }
        let castSuyo = cast.filter(suyo), crewSuyo = crew.filter(suyo)
        // el año de una serie es el de la serie, no el suyo: solo películas
        let anios = (castSuyo + crewSuyo).filter { $0["media_type"] as? String == "movie" }.compactMap(anio)
        var vistos = Set<Int>()
        let conocido = (castSuyo + crewSuyo)
            .filter { c in
                guard let k = clave(c), inverso[k] == nil, c["poster_path"] is String, let n = c["id"] as? Int else { return false }
                return vistos.insert(n).inserted
            }
            .sorted { ($0["vote_count"] as? Int ?? 0) > ($1["vote_count"] as? Int ?? 0) }
            .prefix(8)
            .map { c in
                Conocido(t: String(((c["title"] as? String) ?? (c["name"] as? String) ?? "").prefix(80)), a: anio(c),
                         p: c["poster_path"] as? String ?? "",
                         papel: (c["character"] as? String).map { String($0.prefix(60)) } ?? (c["job"] as? String ?? ""))
            }
        let creditos = Set((castSuyo + crewSuyo).compactMap { $0["id"] as? Int }).count

        return DatosPersona(
            bio: (texto("biography") ?? "").trimmingCharacters(in: .whitespacesAndNewlines),
            nacimiento: texto("birthday"), muerte: texto("deathday"),
            lugar: texto("place_of_birth").map { $0.replacing(/\s*\[[^\]]*\]/, with: "").trimmingCharacters(in: .whitespaces) }
                .flatMap { $0.isEmpty ? nil : $0 },
            foto: texto("profile_path"), enMaraton: enMaraton, papeles: papeles,
            carrera: Carrera(desde: anios.min(), creditos: creditos, conocido: Array(conocido)),
            imdb: texto("imdb_id"))
    }

    /// Años cumplidos (al morir, si murió); nil si la fecha no es creíble
    public func edad(hoy: Date = Date(), calendario cal: Calendar = .current) -> Int? {
        guard let n = nacimiento.flatMap({ Catalogo.dia($0, cal) }) else { return nil }
        let fin = muerte.flatMap { Catalogo.dia($0, cal) } ?? hoy
        guard let a = cal.dateComponents([.year], from: n, to: fin).year, a > 0, a < 120 else { return nil }
        return a
    }
}

public enum Personas {
    /// «Hugh Jackman (voz)» → «Hugh Jackman» (limpiaNombre de la web)
    public static func limpia(_ nombre: String) -> String {
        nombre.replacing(#/ \((voz|creador|creadora|showrunner|creadores)\)$/#, with: "")
    }

    /// La dirección es un texto: «Anthony y Joe Russo» son dos personas
    /// (Anthony Russo y Joe Russo); «Markus y McFeely (creadores)», dos apellidos
    public static func separa(direccion: String) -> [String] {
        let partes = limpia(direccion).split(separator: #/, | y /#).map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
        guard partes.count > 1, let ultima = partes.last else { return partes }
        let palabras = ultima.split(separator: " ")
        // nombres sueltos que comparten el apellido de la última («Anthony y Joe Russo»)
        if palabras.count == 2, partes.dropLast().allSatisfy({ !$0.contains(" ") && Self.nombresDePila.contains($0) }) {
            return partes.dropLast().map { "\($0) \(palabras[1])" } + [ultima]
        }
        return partes
    }
    /// Los nombres de pila que aparecen solos en la dirección de data.js
    static let nombresDePila: Set<String> = ["Anthony"]

    /// «Logan (voice)» → «Logan»; « / » con espacios
    static func limpiaPapel(_ p: String) -> String {
        p.replacing(/\s*\((?:[^)]*\b(?:voice|uncredited|archive|footage)\b[^)]*)\)/.ignoresCase(), with: "")
            .replacing(/\s*\/\s*/, with: " / ")
            .trimmingCharacters(in: .whitespaces)
    }

    /// Entre homónimos de /search/person: quien tiene algo del maratón entre lo
    /// conocido; si no, el del nombre exacto; si no, el primero
    public static func elige(_ resultados: [[String: Any]], nombre: String, inverso: [String: String]) -> Int? {
        let rs = resultados.filter { $0["id"] is Int }
        func enMaraton(_ x: [String: Any]) -> Bool {
            (x["known_for"] as? [Any] ?? []).compactMap { $0 as? [String: Any] }.contains { k in
                guard let t = k["media_type"] as? String, let n = k["id"] as? Int else { return false }
                return inverso["\(t):\(n)"] != nil
            }
        }
        let x = rs.first(where: enMaraton)
            ?? rs.first { Texto.compacto($0["name"] as? String ?? "") == Texto.compacto(nombre) }
            ?? rs.first
        return x?["id"] as? Int
    }

    /// ¿El resumen de la Wikipedia es de alguien del oficio? (no un homónimo futbolista)
    public static func esDelOficio(descripcion: String, texto: String) -> Bool {
        let oficio = /\b(actor|actriz|actress|actor de voz|voice actor|directora? de cine|film director|cineasta|filmmaker|guionista|screenwriter|productora? de cine|film producer|comedian|comediante)\b/.ignoresCase()
        let noOficio = /\b(futbol|fútbol|football|soccer|político|politician|empresari|businessman|periodista|journalist|entrenador|coach)\b/.ignoresCase()
        return texto.count > 120 && (descripcion + " " + texto.prefix(300)).firstMatch(of: oficio) != nil
            && descripcion.firstMatch(of: noOficio) == nil
    }
}

extension Catalogo {
    /// «movie:1726» → id del maratón (TMDB_INV de la web)
    public var tmdbInverso: [String: String] {
        Dictionary(imagenes.tmdb.map { ("\($0.value.tipo):\($0.value.numero)", $0.key) }, uniquingKeysWith: { a, _ in a })
    }

    /// Las personas de un título: la dirección separada y el reparto, sin «(voz)»
    /// (una vez cada una: quien dirige y actúa sale como dirección)
    public func personas(de t: Titulo) -> [(nombre: String, esDireccion: Bool)] {
        let todas = (t.dir.map { Personas.separa(direccion: $0) } ?? []).map { ($0, true) }
            + (t.cast ?? []).map { (Personas.limpia($0), false) }
        var vistas = Set<String>()
        return todas.filter { vistas.insert(Texto.compacto($0.0)).inserted }
    }

    /// Dónde sale una persona en el maratón: por su nombre en data.js y por lo que diga TMDB
    public func titulos(dePersona nombre: String, enTMDB: [String] = []) -> [Titulo] {
        let k = Texto.compacto(nombre)
        let porTmdb = Set(enTMDB)
        return titulos.filter { t in
            porTmdb.contains(t.id) || personas(de: t).contains { Texto.compacto($0.nombre) == k }
        }
    }

    /// El papel en el idioma de la app: España con PERSONAJES_ES, Latinoamérica
    /// con los nombres del doblaje latino, inglés tal cual
    public func personaje(_ papel: String, en idioma: Idioma) -> String {
        guard idioma != .en else { return papel }
        func una(_ x: String) -> String {
            if let m = x.firstMatch(of: /^(.*?)\s+as\s+(.+)$/.ignoresCase()) { return "\(una(String(m.1))) como \(una(String(m.2)))" }
            let limpio = x.trimmingCharacters(in: .whitespaces)
            let es = idiomas.personajes?[limpio.lowercased()] ?? limpio
            guard idioma == .latam else { return es }
            return idiomas.latam.terminos?.first { $0.count == 2 && $0[0] == es }?[1] ?? es
        }
        return papel.components(separatedBy: " / ").map(una).joined(separator: " / ")
    }
}
