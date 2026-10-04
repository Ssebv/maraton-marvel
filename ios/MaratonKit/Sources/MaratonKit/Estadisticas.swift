// Las estadísticas de la web: «Tu mes» (resumenDeMes), el calendario de marcas
// y el diario del maratón. Solo cuentan las marcas con fecha (las que llegan
// por bits valen 1 y no se sabe cuándo se vieron).
import Foundation

/// Un mes del calendario, ordenable (clave = año × 12 + mes − 1, como claveMes de la web)
public struct Mes: Sendable, Hashable, Comparable {
    public let clave: Int
    public init(clave: Int) { self.clave = clave }
    public init(_ fecha: Date, _ cal: Calendar) {
        let c = cal.dateComponents([.year, .month], from: fecha)
        clave = (c.year ?? 0) * 12 + (c.month ?? 1) - 1
    }
    public var anio: Int { clave / 12 }
    public var mes: Int { clave % 12 + 1 }
    public var anterior: Mes { Mes(clave: clave - 1) }
    public func primerDia(_ cal: Calendar) -> Date {
        cal.date(from: DateComponents(year: anio, month: mes, day: 1)) ?? .distantPast
    }
    public static func < (a: Mes, b: Mes) -> Bool { a.clave < b.clave }
}

public struct ResumenMes: Sendable, Equatable {
    public var minutos = 0.0
    public var titulos = 0
    public var episodios = 0
    /// Marcas por día del mes (1…31): los puntos del calendario
    public var porDia: [Int: Int] = [:]
    public var racha = 0
    /// La saga con más títulos del mes, si son al menos 2
    public var saga: (id: String, n: Int)?
    /// El título del mes con más estrellas (a igual nota, el último)
    public var favorito: String?
    public var dias: Int { porDia.count }

    public static func == (a: ResumenMes, b: ResumenMes) -> Bool {
        a.minutos == b.minutos && a.titulos == b.titulos && a.episodios == b.episodios && a.porDia == b.porDia
            && a.racha == b.racha && a.saga?.id == b.saga?.id && a.saga?.n == b.saga?.n && a.favorito == b.favorito
    }
}

/// Lo que marcaste un día: un título entero o N episodios de una serie
public struct MarcaDelDia: Sendable, Hashable, Identifiable {
    public let id: String
    public let episodios: Int
    public let ts: Double
}

extension Progreso {
    static func conFecha(_ t: Double) -> Date? { t >= 1e12 ? Date(timeIntervalSince1970: t / 1000) : nil }

    /// Meses con alguna marca, del más reciente al más antiguo, y siempre el actual
    public func mesesConMarcas(hoy: Date = .now, calendario cal: Calendar = .current) -> [Mes] {
        let actual = Mes(hoy, cal)
        var m: Set<Mes> = [actual]
        for t in Array(vistas.values) + Array(eps.values) {
            if let f = Self.conFecha(t) { m.insert(Mes(f, cal)) }
        }
        return m.filter { $0 <= actual }.sorted(by: >)
    }

    public func resumen(mes: Mes, calendario cal: Calendar = .current) -> ResumenMes {
        var r = ResumenMes()
        var dias: Set<Date> = []
        func apunta(_ f: Date) {
            r.porDia[cal.component(.day, from: f), default: 0] += 1
            dias.insert(cal.startOfDay(for: f))
        }
        // los episodios suman su parte de la serie; la serie con episodios
        // marcados no suma además su duración entera
        var porSerie: [String: Int] = [:]
        var conEps: Set<String> = []
        for (clave, t) in eps {
            guard let i = clave.firstIndex(of: ":") else { continue }
            let id = String(clave[..<i])
            conEps.insert(id)
            guard let f = Self.conFecha(t), Mes(f, cal) == mes else { continue }
            porSerie[id, default: 0] += 1; r.episodios += 1; apunta(f)
        }
        for (id, n) in porSerie {
            let total = catalogo.episodios(de: id).count
            if let t = catalogo.titulo(id), total > 0 { r.minutos += Double(t.d ?? 0) * Double(n) / Double(total) }
        }
        var titulos: [(id: String, ts: Double)] = []
        for (id, t) in vistas {
            guard let titulo = catalogo.titulo(id), let f = Self.conFecha(t), Mes(f, cal) == mes else { continue }
            titulos.append((id, t)); apunta(f)
            if !conEps.contains(id) { r.minutos += Double(titulo.d ?? 0) }
        }
        r.titulos = titulos.count
        r.racha = rachaMaxima(Array(dias), cal)
        var sagas: [String: Int] = [:]
        for x in titulos { if let s = catalogo.saga(de: x.id) { sagas[s, default: 0] += 1 } }
        if let top = sagas.max(by: { ($0.value, $1.key) < ($1.value, $0.key) }), top.value >= 2 { r.saga = (top.key, top.value) }
        r.favorito = titulos.compactMap { x in notas[x.id]?.p.map { (x.id, $0, x.ts) } }
            .max { ($0.1, $0.2) < ($1.1, $1.2) }?.0
        return r
    }

    /// Lo que marcaste ese día, en el orden en que lo marcaste
    public func marcas(dia: Date, calendario cal: Calendar = .current) -> [MarcaDelDia] {
        var out: [String: MarcaDelDia] = [:]
        for (id, t) in vistas {
            if let f = Self.conFecha(t), cal.isDate(f, inSameDayAs: dia), catalogo.titulo(id) != nil {
                out[id] = MarcaDelDia(id: id, episodios: 0, ts: t)
            }
        }
        var porSerie: [String: (n: Int, ts: Double)] = [:]
        for (clave, t) in eps {
            guard let i = clave.firstIndex(of: ":"), let f = Self.conFecha(t), cal.isDate(f, inSameDayAs: dia) else { continue }
            let id = String(clave[..<i])
            let antes = porSerie[id]
            porSerie[id] = ((antes?.n ?? 0) + 1, min(antes?.ts ?? t, t))
        }
        // la serie completada ese día sale entera, no como episodios
        for (id, x) in porSerie where out[id] == nil && catalogo.titulo(id) != nil {
            out[id] = MarcaDelDia(id: id, episodios: x.n, ts: x.ts)
        }
        return out.values.sorted { ($0.ts, $0.id) < ($1.ts, $1.id) }
    }

    /// Los últimos títulos marcados, del más reciente al más antiguo (el diario)
    public func diario(limite: Int = 30) -> [(id: String, fecha: Date)] {
        vistas.compactMap { id, t in Self.conFecha(t).flatMap { catalogo.titulo(id) != nil ? (id, $0) : nil } }
            .sorted { ($0.1, $0.0) > ($1.1, $1.0) }
            .prefix(limite).map { ($0.0, $0.1) }
    }
}
