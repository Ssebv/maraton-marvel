// Los filtros de la Cronología de la web (pasaFiltro): cada uno esconde algo.
import Foundation

public struct Filtros: OptionSet, Sendable, Hashable {
    public let rawValue: Int
    public init(rawValue: Int) { self.rawValue = rawValue }

    /// Sin series
    public static let sinSeries = Filtros(rawValue: 1 << 0)
    /// Sin opcionales
    public static let sinOpcionales = Filtros(rawValue: 1 << 1)
    /// Solo joyas (nota ≥ 7,5; los cómics no tienen nota y quedan fuera del criterio)
    public static let joyas = Filtros(rawValue: 1 << 2)
    /// Solo la ruta express
    public static let express = Filtros(rawValue: 1 << 3)
    /// Solo lo que está en Disney+ en tu país (los cómics, fuera del criterio)
    public static let disney = Filtros(rawValue: 1 << 4)
    /// Esconder lo ya visto
    public static let sinVistos = Filtros(rawValue: 1 << 5)

    public static let todos: [Filtros] = [.sinSeries, .sinOpcionales, .joyas, .express, .disney, .sinVistos]
    public static let joyaMinima = 7.5

    /// Cuántos están puestos
    public var cuantos: Int { Filtros.todos.filter { contains($0) }.count }
}

extension Catalogo {
    /// ¿Se ve este título con estos filtros? Como pasaFiltro de la web
    public func pasa(_ t: Titulo, _ f: Filtros, pais: String, visto: Bool) -> Bool {
        let comic = saga(de: t.id) == "comics"
        if f.contains(.sinSeries) && t.esSerie { return false }
        if f.contains(.sinOpcionales) && t.esOpcional { return false }
        if f.contains(.joyas) && !comic && (t.s ?? 0) < Filtros.joyaMinima { return false }
        if f.contains(.express) && !t.esExpress { return false }
        if f.contains(.disney) && !comic && !(plataforma(t, pais: pais) ?? "").contains("Disney+") { return false }
        if f.contains(.sinVistos) && visto { return false }
        return true
    }

    /// Los filtros que tienen sentido en una saga: los que no la vacían por
    /// construcción (Animación es toda series; los cómics no tienen nota ni express)
    public func filtrosUtiles(saga id: String) -> [Filtros] {
        let items = sagas.first { $0.saga == id }?.eras.flatMap(\.items) ?? []
        let comic = id == "comics"
        return Filtros.todos.filter { f in
            switch f {
            case .sinSeries: items.contains(where: \.esSerie) && !items.allSatisfy(\.esSerie)
            case .sinOpcionales: items.contains(where: \.esOpcional)
            case .joyas, .disney: !comic
            case .express: items.contains(where: \.esExpress)
            default: true
            }
        }
    }
}
