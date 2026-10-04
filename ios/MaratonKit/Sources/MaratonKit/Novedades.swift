// Estrenos y episodios nuevos: el aviso «Desde tu última visita» de la web
// (Novedades) y los avisos del día del estreno que programa la app. Las fechas
// van como texto «AAAA-MM-DD» en hora local y se comparan como texto, igual que la web.
import Foundation

public enum Novedad: Sendable, Hashable {
    case estreno(Estreno)
    /// Episodios de una serie que sigues (con alguno marcado)
    case episodios(Titulo, Int)
}

/// Un aviso para el día de un estreno o de episodios nuevos de una serie que sigues
public struct AvisoEstreno: Sendable, Hashable {
    public let fecha: String
    public let novedad: Novedad
    /// Para el identificador del aviso: el mismo estreno el mismo día es el mismo aviso
    public var clave: String {
        switch novedad {
        case let .estreno(e): "\(fecha)-\(e.id ?? e.t)"
        case let .episodios(t, _): "\(fecha)-\(t.id)"
        }
    }
}

extension Catalogo {
    /// «2026-10-04» del día local de `fecha`
    public static func diaTexto(_ fecha: Date, _ cal: Calendar = .current) -> String {
        let c = gregoriano(cal).dateComponents([.year, .month, .day], from: fecha)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }

    /// Lo que llegó después de `desde` y hasta `hoy` incluido: estrenos y
    /// episodios de las series que sigues. Como Novedades de la web.
    public func novedades(desde: String, hasta hoy: String, seguidas: Set<String>) -> [Novedad] {
        avisos(entre: desde, y: hoy, seguidas: seguidas).map(\.novedad)
    }

    /// Los avisos desde hoy incluido (si ya pasó la hora del aviso lo decide la
    /// app), en orden de fecha
    public func proximosAvisos(desde hoy: String, seguidas: Set<String>, limite: Int = 24) -> [AvisoEstreno] {
        Array(avisos(entre: Self.diaAnterior(hoy), y: "9999-12-31", seguidas: seguidas)
            .sorted { $0.fecha < $1.fecha }.prefix(limite))
    }

    /// Fechas en (desde, hasta]
    func avisos(entre desde: String, y hasta: String, seguidas: Set<String>) -> [AvisoEstreno] {
        var out: [AvisoEstreno] = []
        for e in estrenos {
            guard let f = e.fecha, f > desde, f <= hasta else { continue }
            out.append(AvisoEstreno(fecha: f, novedad: .estreno(e)))
        }
        for t in titulos where seguidas.contains(t.id) {
            var porDia: [String: Int] = [:]
            for ep in episodios(de: t.id) {
                guard let f = ep.f, f > desde, f <= hasta else { continue }
                porDia[f, default: 0] += 1
            }
            for (f, n) in porDia.sorted(by: { $0.key < $1.key }) {
                out.append(AvisoEstreno(fecha: f, novedad: .episodios(t, n)))
            }
        }
        return out
    }

    static func diaAnterior(_ dia: String) -> String {
        let cal = Calendar(identifier: .gregorian)
        guard let d = Self.dia(dia, cal), let antes = cal.date(byAdding: .day, value: -1, to: d) else { return dia }
        return diaTexto(antes, cal)
    }
}

extension Progreso {
    /// Las series con algún episodio marcado (las que «sigues», como la web)
    public var seriesSeguidas: Set<String> {
        Set(eps.keys.compactMap { $0.split(separator: ":").first.map(String.init) })
    }
}
