// Los logros de la web (LOGROS en src/App.jsx) con las mismas reglas. Faltan
// «Crítico» y «Pluma afilada»: dependen de las notas, que la app aún no tiene.
// Los textos van en español; el inglés sale de en-textos (Catalogo.texto).
import Foundation

public struct Logro: Sendable, Identifiable, Hashable {
    public let id: String
    public let grupo: String
    /// Símbolo SF en lugar del emoji de la web
    public let simbolo: String
    public let titulo: String
    public let descripcion: String
    public let conseguido: Bool
    /// Cuánto llevas de cuánto, si el logro se puede contar
    public let avance: Avance?

    public struct Avance: Sendable, Hashable {
        public let hecho: Int
        public let meta: Int
    }
}

public enum GrupoLogro {
    /// id, español, inglés (GRUPOS_LOGROS)
    public static let todos: [(id: String, es: String, en: String)] = [
        ("maraton", "El maratón", "The marathon"), ("xmen", "X-Men", "X-Men"), ("ucm", "UCM", "MCU"),
        ("papel", "Cómics y animación", "Comics and animation"), ("habitos", "Tus hábitos", "Your habits"),
    ]
}

extension Progreso {
    public func logros(calendario: Calendar = .current) -> [Logro] {
        let cat = catalogo
        let r = resumen
        func idsSaga(_ s: String) -> [String] {
            cat.sagas.first { $0.saga == s }?.eras.flatMap { $0.items.map(\.id) } ?? []
        }
        func idsEra(_ s: String, _ i: Int) -> [String] {
            guard let eras = cat.sagas.first(where: { $0.saga == s })?.eras, eras.indices.contains(i) else { return [] }
            return eras[i].items.map(\.id)
        }
        func cuenta(_ ids: [String]) -> Int { ids.filter { vistas[$0] != nil }.count }

        let porDia = marcasPorDia(calendario)
        let racha = rachaMaxima(Array(porDia.keys), calendario)
        let mejorDia = porDia.values.max() ?? 0
        let comics = vistas.keys.filter { $0.hasPrefix("c-") }.count
        let mitad = (r.total + 1) / 2
        let horas = r.minutosVistos / 60
        let express = cat.sagas.prefix(2).allSatisfy { $0.eras.allSatisfy { $0.items.filter(\.esExpress).allSatisfy { visto($0.id) } } }
        let todo = cat.sagas.allSatisfy { $0.eras.allSatisfy { $0.items.allSatisfy { visto($0.id) } } }

        var lista: [Logro] = []
        func agrega(_ id: String, _ g: String, _ simbolo: String, _ t: String, _ d: String, _ ok: Bool, _ av: (Int, Int)? = nil) {
            lista.append(Logro(id: id, grupo: g, simbolo: simbolo, titulo: t, descripcion: d, conseguido: ok,
                               avance: av.map { Logro.Avance(hecho: $0.0, meta: $0.1) }))
        }
        func deIds(_ id: String, _ g: String, _ simbolo: String, _ t: String, _ d: String, _ ids: [String]) {
            let n = cuenta(ids)
            agrega(id, g, simbolo, t, d, !ids.isEmpty && n == ids.count, (n, ids.count))
        }

        agrega("primero", "maraton", "film", "Primer paso", "Marca tu primer título", vistas.keys.contains { !$0.hasPrefix("c-") })
        agrega("express", "maraton", "bolt.fill", "Ruta express", "Todo lo imprescindible para Doomsday", express)
        agrega("cien", "maraton", "clock.fill", "Cien horas", "100 horas de maratón vistas", horas >= 100, (min(100, horas), 100))
        agrega("mitad", "maraton", "circle.lefthalf.filled", "Media maratón", "La mitad de los títulos", r.vistos >= mitad, (min(r.vistos, mitad), mitad))
        agrega("completista", "maraton", "trophy.fill", "Completista", "Absolutamente todo visto y leído", todo)

        deIds("xmen-original", "xmen", "graduationcap.fill", "Alumno de Xavier", "Toda la línea original de X-Men", idsEra("xmen", 0))
        deIds("xmen-nueva", "xmen", "tornado", "Línea temporal nueva", "Toda la línea nueva de X-Men", idsEra("xmen", 1))
        deIds("logan", "xmen", "scissors", "Garras de adamantium", "Las tres películas en solitario de Logan", ["origins-wolverine", "the-wolverine", "logan"])
        deIds("deadpool", "xmen", "bubble.left.fill", "Rompe la cuarta pared", "Las tres películas de Deadpool", ["deadpool1", "deadpool2", "deadpool3"])
        deIds("xmen-series", "xmen", "tv.fill", "Mutantes en la tele", "Las cuatro series de la saga X-Men", idsEra("xmen", 2))
        deIds("fenix", "xmen", "flame.fill", "La Fénix, dos veces", "Fénix Oscura en película y en cómic", ["dark-phoenix", "c-darkphoenix"])
        deIds("futuro-pasado", "xmen", "hourglass", "Futuro pasado", "Días del futuro pasado en película y en cómic", ["dofp", "c-dofp"])
        deIds("xmen-papel", "xmen", "book.fill", "X-Men de papel", "Los cómics esenciales de X-Men", idsEra("comics", 0))
        let xmen = idsSaga("xmen")
        agrega("mutante", "xmen", "allergens", "Mutante y orgulloso", "Toda la saga X-Men", !xmen.isEmpty && cuenta(xmen) == xmen.count, (cuenta(xmen), xmen.count))

        deIds("capi", "ucm", "shield.fill", "Trilogía del Capi", "El primer vengador, Soldado de Invierno y Civil War", ["cap1", "cap2", "civilwar"])
        deIds("thanos", "ucm", "hand.raised.fill", "El chasquido", "Infinity War y Endgame", ["infinitywar", "endgame"])
        deIds("arana", "ucm", "ant.fill", "Tu amigo y vecino", "Homecoming, Lejos de casa y No Way Home", ["homecoming", "ffh", "nwh"])
        deIds("groot", "ucm", "leaf.fill", "Yo soy Groot", "Las tres de Guardianes de la Galaxia", ["gotg1", "gotg2", "gotg3"])
        deIds("variantes", "ucm", "clock.arrow.2.circlepath", "Variante", "Las dos temporadas de Loki y What If...?", ["loki1", "loki2", "whatif"])
        deIds("defensores", "ucm", "figure.boxing", "Los Defensores", "Las 6 series de Netflix", ["daredevil", "jessicajones", "lukecage", "ironfist", "defenders", "punisher"])
        deIds("infinito", "ucm", "diamond.fill", "Saga del Infinito", "Todas las eras hasta Endgame", (0...3).flatMap { idsEra("ucm", $0) })

        agrega("lector", "papel", "books.vertical.fill", "Ratón de biblioteca", "Lee 5 cómics esenciales", comics >= 5, (min(5, comics), 5))
        deIds("coleccionista", "papel", "archivebox.fill", "Coleccionista", "Todos los cómics esenciales", idsSaga("comics"))
        let boveda = cuenta(idsSaga("animacion"))
        agrega("boveda", "papel", "sparkles.tv.fill", "Sábado por la mañana", "5 series de la bóveda de animación", boveda >= 5, (min(5, boveda), 5))

        agrega("racha", "habitos", "calendar", "Una semana sin parar", "Marca algo 7 días seguidos", racha >= 7, (min(7, racha), 7))
        agrega("maraton-dia", "habitos", "popcorn.fill", "Maratón de verdad", "5 títulos o episodios el mismo día", mejorDia >= 5, (min(5, mejorDia), 5))
        agrega("enganchado", "habitos", "play.rectangle.on.rectangle.fill", "Enganchado", "100 episodios vistos", eps.count >= 100, (min(100, eps.count), 100))
        return lista
    }

    /// Marcas por día local; las que llegan por bits (valen 1) no tienen fecha
    func marcasPorDia(_ cal: Calendar) -> [Date: Int] {
        var m: [Date: Int] = [:]
        for t in Array(vistas.values) + Array(eps.values) where t >= 1e12 {
            m[cal.startOfDay(for: Date(timeIntervalSince1970: t / 1000)), default: 0] += 1
        }
        return m
    }

    func rachaMaxima(_ dias: [Date], _ cal: Calendar) -> Int {
        var mejor = 0, actual = 0
        var previo: Date?
        for d in dias.sorted() {
            // «el día siguiente» y no «24 h después»: el día del cambio de hora dura 23 o 25
            let seguido = previo.flatMap { cal.date(byAdding: .day, value: 1, to: $0) }.map { cal.isDate($0, inSameDayAs: d) } ?? false
            actual = seguido ? actual + 1 : 1
            mejor = max(mejor, actual)
            previo = d
        }
        return mejor
    }
}
