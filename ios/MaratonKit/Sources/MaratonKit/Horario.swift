// El horario de maratón de la web (simulaHorario de App.jsx): eliges qué días
// ves, cuánto rato y a qué hora, y la simulación recorre el calendario
// consumiendo lo pendiente en el orden del maratón. Simula, no promete: las
// series van por tandas de episodios que quepan en la sesión y las películas
// enteras aunque se pasen (en una sesión vacía siempre cae algo, así avanza).
import Foundation

public struct Horario: Codable, Sendable, Hashable {
    /// Días como getDay() de la web: 0 domingo … 6 sábado
    public var dias: Set<Int>
    /// Minutos por sesión (15–600)
    public var min: Int
    /// «HH:MM» en hora local
    public var hora: String
    /// Solo la ruta express
    public var exp: Bool

    public init(dias: Set<Int>, min: Int, hora: String, exp: Bool) {
        self.dias = dias; self.min = min; self.hora = hora; self.exp = exp
    }

    /// El de la web al abrirlo por primera vez: viernes y sábado, 1 h 30 a las 21:00
    public static let porDefecto = Horario(dias: [5, 6], min: 90, hora: "21:00", exp: true)

    /// Lunes primero, como la web
    public static let diasEnOrden = [1, 2, 3, 4, 5, 6, 0]
    public static let duraciones = [60, 90, 120, 180]

    /// Como saneaHorario: sin días o con minutos fuera de rango se descarta entero
    public var saneado: Horario? {
        let d = dias.filter { (0...6).contains($0) }
        guard !d.isEmpty, (15...600).contains(min) else { return nil }
        return Horario(dias: d, min: min, hora: Self.horaValida(hora) ? hora : "21:00", exp: exp)
    }

    static func horaValida(_ h: String) -> Bool {
        let p = h.split(separator: ":")
        guard p.count == 2, p[0].count == 2, p[1].count == 2, let hh = Int(p[0]), let mm = Int(p[1]) else { return false }
        return (0...23).contains(hh) && (0...59).contains(mm)
    }

    public var horaYMinuto: (hora: Int, minuto: Int) {
        let p = hora.split(separator: ":").compactMap { Int($0) }
        return p.count == 2 ? (p[0], p[1]) : (21, 0)
    }

    /// El día de la semana de una fecha en la cuenta de la web (0 = domingo)
    public static func dia(_ fecha: Date, _ cal: Calendar) -> Int { cal.component(.weekday, from: fecha) - 1 }

    /// Desde qué día simular: la sesión de hoy cuenta como hecha cuando ya
    /// empezó (avisos, `despuesDe` 0) o cuando ya terminó (la tarjeta, `min`).
    /// Sin esto, lo que marcas después de la sesión corría todas las siguientes.
    public func primerDia(ahora: Date, _ cal: Calendar, despuesDe minutos: Int = 0) -> Date {
        let hoy = cal.startOfDay(for: ahora)
        guard dias.contains(Self.dia(hoy, cal)),
              ahora >= inicio(el: hoy, cal).addingTimeInterval(Double(minutos) * 60) else { return hoy }
        return cal.date(byAdding: .day, value: 1, to: hoy) ?? hoy
    }

    /// La fecha a la hora de la sesión
    public func inicio(el dia: Date, _ cal: Calendar) -> Date {
        let (h, m) = horaYMinuto
        return cal.date(bySettingHour: h, minute: m, second: 0, of: dia) ?? dia
    }
}

/// Lo que cae en una sesión: un título entero o una tanda de episodios
public struct TrozoSesion: Sendable, Hashable {
    public let titulo: Titulo
    public let desde: Episodio?
    public let hasta: Episodio?

    /// «T1·E1–T1·E4» como la web (S en inglés); vacío si es el título entero
    public func episodios(en idioma: Idioma) -> String {
        guard let desde, let hasta else { return "" }
        let t = idioma == .en ? "S" : "T"
        let a = "\(t)\(desde.s)·E\(desde.n)"
        return desde == hasta ? a : "\(a)–\(t)\(hasta.s)·E\(hasta.n)"
    }
}

public struct SesionHorario: Sendable, Hashable {
    /// El día, a medianoche local
    public let fecha: Date
    public let trozos: [TrozoSesion]
    /// Lo que dura de verdad (una película larga se pasa de la sesión)
    public let min: Int
}

public struct SimulacionHorario: Sendable, Hashable {
    public let totalMin: Int
    /// Las primeras, con su contenido
    public let sesiones: [SesionHorario]
    public let nSesiones: Int
    public let fin: Date?
    /// false = ni en dos años se acaba
    public let seAcaba: Bool
}

extension Progreso {
    /// La simulación de la web. `detalladas` = cuántas sesiones se devuelven con
    /// su contenido; las demás solo se cuentan.
    public func simula(_ h: Horario, desde hoy: Date = Date(), calendario cal: Calendar = .current,
                       detalladas: Int = 5) -> SimulacionHorario {
        // la cola: lo pendiente del maratón (sin cómics ni animación), en su orden
        enum Unidad { case entero(Titulo, Int), serie(Titulo, [Episodio], Double) }
        var cola: [Unidad] = []
        for t in catalogo.titulos where catalogo.idsMaraton.contains(t.id) {
            guard !visto(t.id), let d = t.d, d > 0, !h.exp || t.esExpress else { continue }
            let todos = catalogo.episodios(de: t.id)
            if t.esSerie && !todos.isEmpty {
                let pend = todos.filter { !visto($0, de: t.id) }
                if !pend.isEmpty { cola.append(.serie(t, pend, Double(d) / Double(todos.count))) }
            } else {
                cola.append(.entero(t, d))
            }
        }
        let total = cola.reduce(0.0) { s, u in
            switch u { case let .entero(_, m): s + Double(m); case let .serie(_, e, porEp): s + Double(e.count) * porEp }
        }

        var sesiones: [SesionHorario] = [], n = 0, fin: Date?
        var dia = cal.startOfDay(for: hoy), i = 0
        // dos años de tope: si ni así se acaba, con ese horario no se acaba
        for _ in 0..<740 where i < cola.count {
            defer { dia = cal.date(byAdding: .day, value: 1, to: dia) ?? dia }
            guard h.dias.contains(Horario.dia(dia, cal)) else { continue }
            var resto = Double(h.min), trozos: [TrozoSesion] = []
            sesion: while i < cola.count && resto > 0 {
                switch cola[i] {
                case let .serie(t, pend, porEp):
                    let caben = min(pend.count, Int((resto / porEp).rounded(.down)))
                    // en una sesión aún vacía siempre cae al menos un episodio
                    let k = trozos.isEmpty ? max(1, caben) : caben
                    if k < 1 { break sesion }
                    trozos.append(TrozoSesion(titulo: t, desde: pend[0], hasta: pend[k - 1]))
                    resto -= Double(k) * porEp
                    if k == pend.count { i += 1 } else { cola[i] = .serie(t, Array(pend.dropFirst(k)), porEp) }
                case let .entero(t, m):
                    if Double(m) > resto && !trozos.isEmpty { break sesion }
                    trozos.append(TrozoSesion(titulo: t, desde: nil, hasta: nil))
                    resto -= Double(m)
                    i += 1
                }
            }
            n += 1
            fin = dia
            if sesiones.count < detalladas {
                sesiones.append(SesionHorario(fecha: dia, trozos: trozos, min: Int((Double(h.min) - resto).rounded())))
            }
        }
        return SimulacionHorario(totalMin: Int(total.rounded()), sesiones: sesiones, nSesiones: n, fin: fin, seAcaba: i >= cola.count)
    }

    /// Cuántos minutos tendría que durar cada sesión para acabar antes de `tope`
    /// (los días elegidos desde hoy hasta la víspera); nil si no cae ninguno
    public func minutosNecesarios(_ h: Horario, total: Int, antesDe tope: Date, desde hoy: Date = Date(),
                                  calendario cal: Calendar = .current) -> Int? {
        var dia = cal.startOfDay(for: hoy), n = 0
        while dia < tope {
            if h.dias.contains(Horario.dia(dia, cal)) { n += 1 }
            dia = cal.date(byAdding: .day, value: 1, to: dia) ?? tope
        }
        return n > 0 ? Int((Double(total) / Double(n)).rounded(.up)) : nil
    }

    /// La sesión de hoy, si hoy toca y queda algo
    public func sesionDeHoy(_ h: Horario, hoy: Date = Date(), calendario cal: Calendar = .current) -> SesionHorario? {
        guard h.dias.contains(Horario.dia(hoy, cal)),
              let s = simula(h, desde: hoy, calendario: cal, detalladas: 1).sesiones.first,
              !s.trozos.isEmpty, cal.isDate(s.fecha, inSameDayAs: hoy) else { return nil }
        return s
    }
}
